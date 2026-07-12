// paige-deep-research — Paige's universal, cited, multi-hop research engine (#165/#166).
//
// A bounded PLAN → SEARCH → READ → GAP-CHECK loop, then exactly ONE Claude synthesis
// call, followed by a deterministic anti-fabrication gate. Every returned finding carries
// at least one citation that resolves to a real, non-excluded source. Nothing is invented:
// if web search is unconfigured, or no sources survive validation, the engine returns
// `findings: []` with an honest note — it never fabricates a fact to fill the gap (§13).
//
// The engine is DOMAIN-AGNOSTIC. It carries no vertical or finance vocabulary of any kind
// (§2/§4). `domain` and `caller` are opaque hint strings that only ever colour the search
// queries the planner writes and are persisted verbatim; they are never branched on in code.
//
// Reuse, don't reinvent (§13):
//   • search  → POST ${SUPABASE_URL}/functions/v1/paige-web-search   (Firecrawl; honours its
//               own `configured:false` path — we propagate it, never fabricate).
//   • read    → POST ${SUPABASE_URL}/functions/v1/fetch-url-content  (SSRF-guarded fetch).
//   • models  → _shared/model-router.ts routedChatCompletion(jobKind):
//               "extract" (PLAN/GAP-CHECK, cheap) · "score" (tie-breaks, cheap) ·
//               "doc_draft" (the ONE final synthesis → Claude reasoning tier = claude-sonnet-5).
//
// Persistence is via the SERVICE-ROLE client into research_runs + research_sources
// (RLS declared for direct client reads; the service role is the write boundary).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { routedChatCompletion } from "../_shared/model-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Hard bounds (A2 — enforced, not advisory) ───────────────────────────────
const MAX_HOPS = 3;                 // absolute ceiling; request clamps to 1..3, default 2
const MAX_QUERIES_PER_HOP = 4;
const MAX_TOTAL_SEARCHES = 10;
const MAX_READS = 6;
const WALL_CLOCK_MS = 60_000;
const COST_CEILING_USD = 0.15;      // soft — logged, breaks gathering, still synthesises
const READ_BODY_MAX = 6_000;        // chars kept per fetched page

// Rough per-op cost estimate (USD) — only for the soft ceiling log/break, never billed.
const COST = { search: 0.001, read: 0.0005, cheapLLM: 0.002, synthesis: 0.03 };

type StopReason =
  | "answered" | "max_hops" | "budget" | "wall_clock"
  | "no_results" | "unconfigured" | "error";

// ── Request contract (A1) ───────────────────────────────────────────────────
interface DeepResearchRequest {
  question: string;
  user_id: string;
  client_user_id?: string | null;
  domain?: string;
  max_hops?: number;
  freshness_days?: number;
  persist?: boolean;
  strict?: boolean;
  caller?: string;   // opaque provenance tag (e.g. "chat" | "manual" | an opted-in caller)
}

// ── Output contract (A6) ────────────────────────────────────────────────────
interface Finding {
  text: string;
  citations: number[];
  confidence: "high" | "medium" | "low";
  unverifiedFields?: string[];
}
interface OutSource {
  index: number;
  url: string;
  title: string;
  snippet: string;
  reliability_score: number;
  tier: "T1" | "T2" | "T3" | "T4" | "T5";
  reliability: "high" | "medium" | "low";
  published_at: string | null;
  fetched_at: string;
  excluded: boolean;
}
interface DeepResearchResult {
  run_id: string;
  question: string;
  findings: Finding[];
  sources: OutSource[];
  coverage: {
    stop_reason: string;
    hops_used: number;
    searches: number;
    reads: number;
    note: string;
    configured: boolean;
  };
}

// Internal working record for a discovered source.
interface SourceRec {
  index: number;              // assigned in rank order at the end; provisional during loop
  url: string;
  title: string;
  snippet: string;            // from search description
  content: string;            // full-page body (truncated), "" until read
  read: boolean;
  host: string;               // eTLD+1
  published_at: string | null;
  fetched_at: string;
  // ranking outputs
  authority: number;
  recency: number;
  corroboration: number;
  reliability_score: number;
  tier: "T1" | "T2" | "T3" | "T4" | "T5";
  reliability: "high" | "medium" | "low";
  excluded: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── eTLD+1 + authority classification (B1) ──────────────────────────────────
// Two-part TLDs we may encounter; keeps eTLD+1 from collapsing to "co.uk".
const MULTI_TLDS = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "co.jp", "com.au", "gov.au", "co.nz",
  "com.br", "co.in", "gov.in",
]);

function etld1(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return h;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_TLDS.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

function hostOf(url: string): string {
  try { return etld1(new URL(url).hostname); } catch { return ""; }
}

// T2 established-institution / major-press allowlist (generic; no vertical content).
const T2_ALLOW = new Set([
  "reuters.com", "bloomberg.com", "apnews.com", "ap.org", "wsj.com",
  "ft.com", "economist.com", "nytimes.com", "washingtonpost.com", "bbc.co.uk",
  "npr.org", "nature.com", "science.org", "who.int", "worldbank.org", "oecd.org",
  "iso.org", "ieee.org", "w3.org",
]);

// T5 content-farm / SEO-spam / UGC-aggregator denylist → hard-excluded, never citable.
const T5_DENY = new Set([
  "pinterest.com", "quora.com", "answers.com", "ehow.com", "buzzfeed.com",
  "medium.com", "reddit.com", "wikihow.com", "slideshare.net", "scribd.com",
  "blogspot.com", "wordpress.com", "tumblr.com", "facebook.com", "instagram.com",
  "tiktok.com", "x.com", "twitter.com",
]);

const T1_TLDS = [".gov", ".edu", ".mil", ".int"];

function classifyAuthority(host: string, hostname: string): { tier: SourceRec["tier"]; authority: number } {
  const hn = hostname.toLowerCase();
  if (T1_TLDS.some((t) => hn.endsWith(t) || hn.includes(t + "."))) return { tier: "T1", authority: 1.0 };
  if (host.endsWith(".gov") || host.endsWith(".edu") || host.endsWith(".mil") || host.endsWith(".int")) {
    return { tier: "T1", authority: 1.0 };
  }
  if (T2_ALLOW.has(host)) return { tier: "T2", authority: 0.8 };
  if (T5_DENY.has(host)) return { tier: "T5", authority: 0.15 };
  return { tier: "T4", authority: 0.35 };
}

// Meaningful (>3 char, non-stopword) lowercased tokens.
const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are",
  "was", "were", "will", "have", "has", "not", "but", "all", "can", "how",
  "what", "when", "which", "who", "why", "about", "into", "over", "than",
]);
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).filter((t) => !STOP.has(t));
}
function tokenSet(s: string): Set<string> {
  return new Set(tokens(s));
}

// ── rankSources (B1) — deterministic; ties broken deterministically ─────────
// authority/recency/corroboration → reliability ∈ [0,1]. Exclude <0.25 and T5.
function rankSources(sources: SourceRec[], freshnessDays: number): SourceRec[] {
  const now = Date.now();
  // Precompute per-source token sets for corroboration (title + snippet + body head).
  const tsets = sources.map((s) => tokenSet(`${s.title} ${s.snippet} ${s.content.slice(0, 1200)}`));

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const hostname = (() => { try { return new URL(s.url).hostname; } catch { return s.host; } })();
    const { tier, authority } = classifyAuthority(s.host, hostname);
    s.tier = tier;
    s.authority = authority;

    // recency
    if (s.published_at) {
      const ageDays = Math.max(0, (now - Date.parse(s.published_at)) / 86_400_000);
      s.recency = Number.isFinite(ageDays) ? clamp01(1 - ageDays / freshnessDays) : 0.4;
    } else {
      s.recency = 0.4; // unknown date
    }

    // corroboration: central tokens independently echoed by ≥1 source on a DIFFERENT eTLD+1.
    const mine = tsets[i];
    let corroborated = false;
    for (let j = 0; j < sources.length; j++) {
      if (j === i) continue;
      if (sources[j].host === s.host || !sources[j].host) continue;
      let overlap = 0;
      for (const tk of tsets[j]) if (mine.has(tk)) { overlap++; if (overlap >= 4) break; }
      if (overlap >= 4) { corroborated = true; break; }
    }
    s.corroboration = corroborated ? 1.0 : 0.3;

    s.reliability_score = clamp01(0.45 * s.authority + 0.25 * s.recency + 0.30 * s.corroboration);

    // Exclusions: T5 hard-excluded; anything below 0.25 excluded (kept for audit).
    s.excluded = tier === "T5" || s.reliability_score < 0.25;

    // Bucket for UI badges: high = T1/T2 corroborated; low = T4/T5 or single-source; else medium.
    if (s.excluded) s.reliability = "low";
    else if ((tier === "T1" || tier === "T2") && s.corroboration >= 1.0) s.reliability = "high";
    else if (tier === "T4" || tier === "T5" || s.corroboration < 1.0) s.reliability = "low";
    else s.reliability = "medium";
  }

  // Deterministic sort: score desc, then authority desc, then recency desc, then url.
  const ranked = [...sources].sort((a, b) =>
    b.reliability_score - a.reliability_score ||
    b.authority - a.authority ||
    b.recency - a.recency ||
    a.url.localeCompare(b.url)
  );
  return ranked;
}

// ── Firecrawl fan-out via paige-web-search (honours configured:false) ───────
interface WebSearchOut {
  configured: boolean;
  results: Array<{ title: string; description: string; url: string; published_at?: string | null }>;
}
async function callWebSearch(
  supabaseUrl: string,
  serviceKey: string,
  query: string,
): Promise<WebSearchOut> {
  const r = await fetch(`${supabaseUrl}/functions/v1/paige-web-search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await r.json().catch(() => ({}));
  if (body?.configured === false) return { configured: false, results: [] };
  const results = Array.isArray(body?.results) ? body.results : [];
  return {
    configured: true,
    results: results.map((x: any) => ({
      title: String(x?.title ?? ""),
      description: String(x?.description ?? ""),
      url: String(x?.url ?? ""),
      published_at: x?.published_at ?? x?.date ?? null,
    })).filter((x: any) => x.url),
  };
}

function upsertSource(sources: SourceRec[], hit: { title: string; description: string; url: string; published_at?: string | null }): void {
  if (!hit.url || sources.find((s) => s.url === hit.url)) return;
  sources.push({
    index: -1,
    url: hit.url,
    title: hit.title || hit.url,
    snippet: (hit.description || "").slice(0, 600),
    content: "",
    read: false,
    host: hostOf(hit.url),
    published_at: hit.published_at ?? null,
    fetched_at: new Date().toISOString(),
    authority: 0, recency: 0, corroboration: 0,
    reliability_score: 0, tier: "T4", reliability: "low", excluded: false,
  });
}

// ── Full-page READ via fetch-url-content (SSRF-guarded) ─────────────────────
async function fetchUrl(supabaseUrl: string, serviceKey: string, url: string): Promise<string> {
  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/fetch-url-content`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!r.ok) return "";
    const b = await r.json().catch(() => ({}));
    return b?.success && typeof b.content === "string" ? b.content.slice(0, READ_BODY_MAX) : "";
  } catch {
    return "";
  }
}

// ── JSON parse that tolerates code-fences / stray prose around the object ────
function parseJsonLoose<T>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();
  try { return JSON.parse(s) as T; } catch { /* fall through */ }
  const first = s.search(/[[{]/);
  const lastO = s.lastIndexOf("}");
  const lastA = s.lastIndexOf("]");
  const last = Math.max(lastO, lastA);
  if (first >= 0 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)) as T; } catch { /* give up */ }
  }
  return null;
}

function llmContent(resp: any): string {
  return typeof resp?.choices?.[0]?.message?.content === "string"
    ? resp.choices[0].message.content
    : "";
}

// ── PLAN / GAP-CHECK (A3a) — cheap "extract" tier ───────────────────────────
interface PlanOut { done: boolean; queries: string[]; gaps?: string[] }

async function planHop(
  question: string,
  domainHint: string,
  hop: number,
  evidence: Array<{ index: number; title: string; snippet: string }>,
): Promise<PlanOut> {
  const sys =
    "You are a research planner. Break a research goal into orthogonal, specific web-search " +
    "queries that would surface primary, authoritative sources. Return ONLY JSON of the form " +
    '{"done": boolean, "queries": string[], "gaps": string[]}. On the first hop, `done` is ' +
    "false and `queries` holds up to 4 non-overlapping sub-queries. On later hops, inspect the " +
    "evidence gathered so far: if it already answers the goal with concrete, source-backed " +
    "facts, set `done` true and return an empty `queries`; otherwise set `done` false and return " +
    "up to 4 NEW queries that target the remaining gaps. Never repeat an earlier query. No prose.";
  const evidenceBlock = evidence.length
    ? evidence.map((e) => `[${e.index}] ${e.title}\n${e.snippet}`).join("\n\n")
    : "(no evidence gathered yet)";
  const user =
    `RESEARCH GOAL: ${question}\n` +
    (domainHint ? `TOPIC HINT: ${domainHint}\n` : "") +
    `HOP: ${hop}\n\nEVIDENCE SO FAR:\n${evidenceBlock}`;

  try {
    const resp = await routedChatCompletion("extract", {
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 700,
    });
    const parsed = parseJsonLoose<PlanOut>(llmContent(resp));
    if (!parsed) return { done: false, queries: hop === 0 ? [question] : [] };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q) => typeof q === "string" && q.trim().length > 2).map((q) => q.trim())
      : [];
    return { done: !!parsed.done, queries, gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [] };
  } catch (e) {
    console.warn("[paige-deep-research] plan error:", (e as Error)?.message);
    return { done: false, queries: hop === 0 ? [question] : [] };
  }
}

// ── SYNTHESIS (A3d/A5) — the ONE Claude reasoning call ──────────────────────
// jobKind "doc_draft" resolves to the Claude reasoning tier (claude-sonnet-5) and is NEVER
// routed to an open model (only CHEAP_KINDS are). This is the single sensitive call.
interface RawFinding {
  summary: string;
  citations: number[];
  name?: string | null;
  website?: string | null;
  phone?: string | null;
  values?: string[];
}
interface SynthOut { findings: RawFinding[] }

async function synthesize(
  question: string,
  domainHint: string,
  citable: SourceRec[],
): Promise<SynthOut | null> {
  // Sources passed exactly as subagent-financial-research's `[n] title\nsnippet\nurl` block,
  // generalised: include the fetched body excerpt when we have it.
  const ctx = citable.map((s) => {
    const body = s.content ? `\n${s.content.slice(0, 1500)}` : "";
    return `[${s.index}] ${s.title}\n${s.snippet}${body}\n${s.url}`;
  }).join("\n\n");

  const sys =
    "You are a rigorous research synthesizer. State a fact ONLY if it appears in the fetched " +
    "text of a specific SOURCE, and tag that fact with the source's [n]. Use NO prior " +
    "knowledge, memory, or assumptions. A factual claim is any name, phone number, website/URL, " +
    "figure, threshold, date, or statistic. If a field is not present in a source, set it to " +
    "null — never invent it. Never emit a name that does not appear verbatim in a cited source. " +
    "For any figure or requirement, append \"as listed on [n], verify directly — terms change.\" " +
    'Output ONLY JSON: {"findings":[{"summary":string,"citations":number[],"name":string|null,' +
    '"website":string|null,"phone":string|null,"values":string[]}]}. `citations` must list the ' +
    "[n] indices that support the finding and must be non-empty. `name`/`website`/`phone` are for " +
    "entity findings (leave null for prose findings). `values` holds any figures/thresholds/dates " +
    "quoted verbatim from a cited source. No prose outside the JSON.";
  const user =
    `RESEARCH GOAL: ${question}\n` +
    (domainHint ? `TOPIC HINT: ${domainHint}\n` : "") +
    `\nSOURCES:\n${ctx}\n\nWrite grounded findings. Every finding MUST carry at least one [n] citation.`;

  try {
    const resp = await routedChatCompletion("doc_draft", {
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2400,
    });
    const parsed = parseJsonLoose<SynthOut>(llmContent(resp));
    if (!parsed || !Array.isArray(parsed.findings)) return { findings: [] };
    return parsed;
  } catch (e) {
    console.warn("[paige-deep-research] synthesis error:", (e as Error)?.message);
    return null;
  }
}

// ── Field-level verification helpers (A5) ───────────────────────────────────
function phonesIn(text: string): string[] {
  const raw = text.match(/(?:\+?\d[\s().-]?){9,15}\d/g) ?? [];
  return raw.map((p) => p.replace(/\D/g, "")).filter((d) => d.length >= 10 && d.length <= 15);
}
function digitsOnly(s: string): string { return s.replace(/\D/g, ""); }

// ── Deterministic post-validation + bind (A5) ───────────────────────────────
// Runs AFTER ranking. `citable` = non-excluded sources with their final `index`.
function validateAndBind(
  synth: SynthOut,
  citable: SourceRec[],
  strict: boolean,
): Finding[] {
  const byIndex = new Map<number, SourceRec>();
  for (const s of citable) byIndex.set(s.index, s);

  const out: Finding[] = [];
  for (const rf of synth.findings ?? []) {
    // Resolve citations to real, non-excluded sources; drop the rest.
    const cites = Array.from(new Set((rf.citations ?? []).filter((c) => byIndex.has(c))));
    if (cites.length === 0) continue; // empty/unresolvable citations are ILLEGAL → drop

    const cited = cites.map((c) => byIndex.get(c)!);
    const citedText = cited.map((s) => `${s.snippet}\n${s.content}`).join("\n").toLowerCase();
    const citedHosts = new Set(cited.map((s) => s.host));
    const unverified: string[] = [];

    // (1) Name check — token-set of the name must appear in a cited source. Absent → drop record.
    const name = (rf.name ?? "").trim();
    if (name) {
      const nameTokens = tokens(name);
      const present = nameTokens.length > 0 &&
        nameTokens.every((t) => citedText.includes(t));
      if (!present) continue; // name not grounded anywhere it was cited → drop whole record
    }

    // (2) Website check — emitted host must equal/subdomain a cited host (URL or body link).
    let website = (rf.website ?? "").trim() || null;
    if (website) {
      const wHost = hostOf(website.startsWith("http") ? website : `https://${website}`);
      const vouched = !!wHost && (citedHosts.has(wHost) || citedText.includes(wHost));
      if (!vouched) { website = null; unverified.push("website"); }
    }

    // (3) Phone check — emitted phone must match a phone in the cited snippets/bodies.
    let phone = (rf.phone ?? "").trim() || null;
    if (phone) {
      const want = digitsOnly(phone);
      const pool = phonesIn(citedText);
      const matched = want.length >= 10 && pool.some((p) => p.endsWith(want.slice(-10)));
      if (!matched) { phone = null; unverified.push("phone"); } // highest-harm error — never surface
    }

    // (4) Numeric / figure check — each value string must appear in a cited source.
    const values: string[] = Array.isArray(rf.values) ? rf.values : [];
    const keptValues: string[] = [];
    for (const v of values) {
      const vs = String(v).trim();
      if (!vs) continue;
      const nums = vs.match(/[\d][\d,.]*/g) ?? [];
      const grounded = nums.length === 0
        ? citedText.includes(vs.toLowerCase())
        : nums.every((n) => citedText.includes(n.toLowerCase()));
      if (grounded) keptValues.push(vs);
      else unverified.push(`value:${vs}`); // ungrounded figure dropped, never a bare fabricated range
    }

    // Emit rule: an ENTITY record (has a name) survives only if name passed AND, when a contact
    // vector was claimed, ≥1 vector (website OR phone) survived. Prose findings (no name) pass
    // on citations alone.
    const claimedContact = !!((rf.website ?? "").trim() || (rf.phone ?? "").trim());
    const survivingContact = !!(website || phone);
    if (name && claimedContact && !survivingContact) {
      if (strict) continue; // drop records where everything-but-name failed
      unverified.push("contact");
    }

    // Confidence derived deterministically from the surviving cites (A5).
    const confidence = deriveConfidence(cited);

    out.push({
      text: composeText(rf.summary, name, website, phone, keptValues),
      citations: cites,
      confidence,
      ...(unverified.length ? { unverifiedFields: unverified } : {}),
    });
  }
  return out;
}

// Confidence: corroboration + authority of the surviving cites.
function deriveConfidence(cited: SourceRec[]): "high" | "medium" | "low" {
  const distinctHosts = new Set(cited.map((s) => s.host)).size;
  const hasHighAuthority = cited.some((s) => s.tier === "T1" || s.tier === "T2");
  const corroborated = distinctHosts >= 2 || cited.some((s) => s.corroboration >= 1.0);
  if (hasHighAuthority && corroborated) return "high";
  if (cited.every((s) => s.tier === "T4" || s.tier === "T5") || distinctHosts < 2) return "low"; // single-source, unverified
  return "medium";
}

// Compose the finding text from ONLY the surviving, validated specifics.
function composeText(
  summary: string,
  name: string,
  website: string | null,
  phone: string | null,
  values: string[],
): string {
  const base = (summary ?? "").trim();
  const bits: string[] = [];
  if (website) bits.push(`website: ${website}`);
  if (phone) bits.push(`phone: ${phone}`);
  if (values.length) bits.push(values.join("; "));
  const detail = bits.length ? ` (${bits.join(" · ")})` : "";
  if (name) return `${name}${base ? ` — ${base}` : ""}${detail}`.trim();
  return `${base}${detail}`.trim();
}

// ── Persistence (service-role) ──────────────────────────────────────────────
async function persistRun(
  serviceUrl: string,
  serviceKey: string,
  runId: string,
  req: DeepResearchRequest,
  result: DeepResearchResult,
): Promise<void> {
  try {
    const admin = createClient(serviceUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: runErr } = await admin.from("research_runs").insert({
      id: runId,
      user_id: req.user_id,
      client_user_id: req.client_user_id ?? null,
      question: req.question,
      domain: req.domain ?? "general",
      caller: req.caller ?? "chat",
      findings: result.findings,
      coverage: result.coverage,
      stop_reason: result.coverage.stop_reason,
      configured: result.coverage.configured,
    });
    if (runErr) { console.error("[paige-deep-research] persist run failed:", runErr.message); return; }

    if (result.sources.length) {
      const rows = result.sources.map((s) => ({
        run_id: runId,
        user_id: req.user_id,
        source_index: s.index,
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        reliability_score: s.reliability_score,
        tier: s.tier,
        reliability: s.reliability,
        published_at: s.published_at,
        fetched_at: s.fetched_at,
        excluded: s.excluded,
      }));
      const { error: srcErr } = await admin.from("research_sources").insert(rows);
      if (srcErr) console.error("[paige-deep-research] persist sources failed:", srcErr.message);
    }
  } catch (e) {
    console.error("[paige-deep-research] persist error:", (e as Error)?.message);
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  const runId = crypto.randomUUID();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: DeepResearchRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length < 3) return json({ error: "question is required (min 3 chars)" }, 400);
  if (!body.user_id || typeof body.user_id !== "string") return json({ error: "user_id is required" }, 400);

  const domainHint = typeof body.domain === "string" ? body.domain : "general";
  const effectiveMaxHops = Math.max(1, Math.min(MAX_HOPS, Number.isFinite(body.max_hops as number) ? Number(body.max_hops) : 2));
  const freshnessDays = Number.isFinite(body.freshness_days as number) && Number(body.freshness_days) > 0
    ? Number(body.freshness_days) : 365;
  const persist = body.persist !== false;
  const strict = body.strict !== false;

  const sources: SourceRec[] = [];
  let searches = 0;
  let reads = 0;
  let hopsUsed = 0;
  let costUSD = 0;
  let stop: StopReason = "max_hops";
  let configured = true;

  // ── Bounded PLAN → SEARCH → READ → GAP-CHECK loop (A3) ────────────────────
  outer:
  for (let hop = 0; hop < effectiveMaxHops; hop++) {
    hopsUsed = hop + 1;

    if (Date.now() - t0 > WALL_CLOCK_MS) { stop = "wall_clock"; break; }
    if (costUSD > COST_CEILING_USD) { console.warn(`[paige-deep-research] soft cost ceiling hit ($${costUSD.toFixed(3)})`); stop = "budget"; break; }

    // (a) PLAN / GAP-CHECK
    const evidence = sources
      .filter((s) => s.read || s.snippet)
      .slice(0, 12)
      .map((s, i) => ({ index: i + 1, title: s.title, snippet: (s.content || s.snippet).slice(0, 400) }));
    costUSD += COST.cheapLLM;
    const plan = await planHop(question, domainHint, hop, evidence);
    if (plan.done && hop > 0) { stop = "answered"; break; }

    const queries = plan.queries.slice(0, MAX_QUERIES_PER_HOP);
    if (queries.length === 0) {
      if (hop === 0) queries.push(question);
      else { stop = "answered"; break; }
    }

    // (b) SEARCH — Firecrawl fan-out
    for (const q of queries) {
      if (searches >= MAX_TOTAL_SEARCHES) break;
      if (Date.now() - t0 > WALL_CLOCK_MS) { stop = "wall_clock"; break outer; }
      const r = await callWebSearch(SUPABASE_URL, SERVICE_KEY, q);
      if (!r.configured) { configured = false; stop = "unconfigured"; break outer; } // §13 — never fabricate
      searches++;
      costUSD += COST.search;
      for (const hit of r.results) upsertSource(sources, hit);
    }

    // (c) READ — top-ranked unread sources' full body
    const ranked = rankSources(sources, freshnessDays);
    for (const s of ranked) {
      if (reads >= MAX_READS) break;
      if (s.read || s.excluded) continue;
      if (Date.now() - t0 > WALL_CLOCK_MS) { stop = "wall_clock"; break outer; }
      const live = sources.find((x) => x.url === s.url)!;
      const content = await fetchUrl(SUPABASE_URL, SERVICE_KEY, s.url);
      live.read = true;
      reads++;
      costUSD += COST.read;
      if (content) live.content = content;
    }

    if (searches >= MAX_TOTAL_SEARCHES && reads >= MAX_READS) { stop = "budget"; break; }
    if (hop + 1 >= effectiveMaxHops) stop = "max_hops";
  }

  // ── Assemble ranked sources for output + citation binding ─────────────────
  const rankedFinal = rankSources(sources, freshnessDays);
  rankedFinal.forEach((s, i) => { s.index = i + 1; }); // stable 1-based citation indices
  const citable = rankedFinal.filter((s) => !s.excluded);

  const outSources: OutSource[] = rankedFinal.map((s) => ({
    index: s.index,
    url: s.url,
    title: s.title,
    snippet: s.snippet,
    reliability_score: Number(s.reliability_score.toFixed(3)),
    tier: s.tier,
    reliability: s.reliability,
    published_at: s.published_at,
    fetched_at: s.fetched_at,
    excluded: s.excluded,
  }));

  // ── Return invariants (A6) — the honest-empty short-circuits ──────────────
  const buildResult = (findings: Finding[], stopReason: string, note: string): DeepResearchResult => ({
    run_id: runId,
    question,
    findings,
    sources: outSources,
    coverage: { stop_reason: stopReason, hops_used: hopsUsed, searches, reads, note, configured },
  });

  // Unconfigured → no synthesis, findings [], persist NOTHING (test iii).
  if (!configured) {
    return json(buildResult(
      [], "unconfigured",
      "Live web search is not connected, so no sources could be gathered. No facts were produced — nothing was invented.",
    ));
  }

  // No citable sources at all → honest-empty. Persist an audit run (attempt happened).
  if (citable.length === 0) {
    const result = buildResult(
      [], searches === 0 ? "no_results" : (stop === "max_hops" ? "no_results" : stop),
      sources.length === 0
        ? "Search ran but returned no results. No verifiable sources, so no findings — nothing was fabricated."
        : "Sources were found but none met the reliability bar. No findings produced rather than surface unverifiable claims.",
    );
    if (persist) await persistRun(SUPABASE_URL, SERVICE_KEY, runId, body, result);
    return json(result);
  }

  // ── SYNTHESIZE — exactly ONE Claude reasoning call ────────────────────────
  costUSD += COST.synthesis;
  const synth = await synthesize(question, domainHint, citable);
  if (!synth) {
    const result = buildResult([], "error", "Synthesis failed; no findings returned rather than risk fabrication.");
    if (persist) await persistRun(SUPABASE_URL, SERVICE_KEY, runId, body, result);
    return json(result);
  }

  // ── POST-VALIDATION gate ──────────────────────────────────────────────────
  const findings = validateAndBind(synth, citable, strict);

  const finalStop = findings.length > 0
    ? (stop === "unconfigured" ? "answered" : stop)
    : "no_results";
  const note = findings.length > 0
    ? `Verified ${findings.length} finding(s) across ${citable.length} citable source(s).`
    : "The model produced no claim that survived source verification. Reporting nothing rather than an unverified fact.";

  const result = buildResult(findings, finalStop, note);
  if (persist) await persistRun(SUPABASE_URL, SERVICE_KEY, runId, body, result);
  return json(result);
});
