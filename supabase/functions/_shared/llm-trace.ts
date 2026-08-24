// §34 Layer 1 — Observability writer for paige_llm_trace.
//
// One row per LLM call. This module owns the three safety properties the adversarial pre-flight
// demanded (the existing paige_audit_log writer copies the *words* "best-effort, never blocks" but
// NOT the safety — it logs no raw content and is awaited; a full-I/O trace must do better):
//
//   S0 SCRUB — every text that could carry a credential (input, output, error message) is run through
//      scrubSecrets() BEFORE it leaves this process. input/output MAY still hold tenant/client PII (that
//      is the point of a trace) but NEVER a secret. We serialize only what we are handed — never Deno.env,
//      never a raw opts/headers object (metadata is an explicit scalar allowlist).
//   S1 DETACH — the write is fired through EdgeRuntime.waitUntil (NOT awaited on the response path), so
//      uploading a multi-KB row never adds latency to the actual generation. Own try/catch, bounded by an
//      AbortController timeout, never rethrows. Best-effort: MAY drop under isolate teardown (stated
//      honestly, §13) — we do not claim certainty.
//   S3 CAP — input/output are truncated to 32KB with truncation flags + original length; binaries are
//      referenced by deliverable_id, never inlined.
//
// Pure Supabase (§34): a service-role insert into one Postgres table. No vendor observability SDK.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// Own the service-role client here (lazy) so EVERY LLM chokepoint can trace with a single
// traceLLMCall(row) — no caller needs to thread an admin client. Null when there's no service
// context (offline/local) → the writer is an honest no-op, never a fake row.
let _admin: SupabaseClient | null = null;
let _adminTried = false;
function traceAdmin(): SupabaseClient | null {
  if (_adminTried) return _admin;
  _adminTried = true;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (url && key) _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

/** The minimal correlation context an LLM-call site threads in. All optional — a site with no tenant
 *  in scope still writes an honest row (tenant_id null), never a fabricated one. */
export interface TraceCtx {
  tenant_id?: string | null;
  task_id?: string | null;
  agent_id?: string | null;
  parent_trace_id?: string | null;
  job_kind?: string | null;
  /** The caller's OWN active workspace tenant id (owner #489) — server-derived for operator display
   *  itemization, DISTINCT from tenant_id (the persona-context attribution). Soft ref, coerced to null
   *  if non-uuid. Optional: a site that doesn't set it writes null (default), never a fabricated id. */
  working_context_tenant_id?: string | null;
  /**
   * DECLARED SCOPE for a call with no tenant. Owner boundary, 2026-08-24: a tenant-less trace is
   * either VERIFIED platform/system work or MISSING ATTRIBUTION, and the difference must not be
   * guessed. Set "platform" ONLY where the call genuinely has no tenant by design — an operator-
   * scope chat turn, a cron sweep, a systems check. Leaving it unset is the honest default: the
   * cost ledger then records the call as `unattributed` and it shows up in v_llm_unattributed_spend
   * as a call site to repair, rather than being silently banked as internal burn.
   *
   * This must be decided SERVER-SIDE. It is never read from a request body.
   */
  scope?: "platform";
}

/** Provenance stamp — bump when the estimator/scrubber/schema changes so a reader knows what produced a row. */
export const ROUTER_VERSION = "trace-1";
/** The cost figures in paige_llm_trace are ESTIMATES on this basis — surfaced so no dashboard reads them as a bill. */
export const COST_BASIS = "list price, in+out tokens, excl caching/thinking/tool round-trips, 2026-07";

const EXCERPT_CAP = 32 * 1024; // 32KB per I/O field (S3). Logged here so the cap is never silent (§24).

// Credential shapes to redact. Allowlist-of-patterns on the WRITE path (S0). Not exhaustive by design —
// the goal is to catch the well-known provider/cloud key formats that must never land at rest, not to be a
// perfect DLP. Extend as new shapes appear.
const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,               // Anthropic
  /sk-[A-Za-z0-9]{20,}/g,                       // OpenAI / generic sk-
  /\bAKIA[0-9A-Z]{16}\b/g,                      // AWS access key id
  /\bASIA[0-9A-Z]{16}\b/g,                      // AWS temp key id
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,            // Slack tokens
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,              // GitHub tokens
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,           // Authorization: Bearer …
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /([?&](?:token|sig|signature|key|apikey|api_key|access_token)=)[^&\s"']{8,}/gi, // signed-URL query params
  /\b[A-Fa-f0-9]{64,}\b/g,                      // long hex blobs (keys/hashes pasted inline)
];

// A trace's tenant_id is a SOFT correlation id (the DB FK to tenants was dropped — an observability row
// must never be LOST because its tenant isn't a real tenants row: a God/platform/operator context, a
// sub-account/agency id not stored in tenants, or a since-deleted tenant). Coerce anything that isn't a
// well-formed uuid to null so a malformed/empty id (e.g. "" ?? null keeps "") can't throw a 22P02 cast
// error into the (swallowed) insert. NULL = platform/system row — invisible to every tenant per RLS (§9).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cleanUuid(v: string | null | undefined, field: string): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (UUID_RE.test(s)) return s;
  // Loud, never silent (§32): a non-empty non-uuid id is a caller bug worth seeing, but the trace
  // still persists (with that field null) rather than being dropped by the swallowing catch.
  console.warn(`paige_llm_trace: non-uuid ${field} coerced to null:`, s.slice(0, 40));
  return null;
}

/** Tenant-specific wrapper, kept as the named export existing callers import. */
export function cleanTenantId(t: string | null | undefined): string | null {
  return cleanUuid(t, "tenant_id");
}

/** Redact known credential shapes. input/output keep their PII (that's the trace's job) but shed secrets. */
export function scrubSecrets(input: string): string {
  let s = input;
  for (const re of SECRET_PATTERNS) s = s.replace(re, "[REDACTED]");
  // keep the signed-URL param NAME, drop only the value
  s = s.replace(/([?&](?:token|sig|signature|key|apikey|api_key|access_token)=)\[REDACTED\]/gi, "$1[REDACTED]");
  return s;
}

/** Coerce any input/output payload to a bounded, scrubbed string. Returns the excerpt + truncation flags. */
export function toExcerpt(value: unknown): { text: string | null; truncated: boolean; len: number | null } {
  if (value === undefined || value === null) return { text: null, truncated: false, len: null };
  let raw: string;
  if (typeof value === "string") raw = value;
  else {
    try { raw = JSON.stringify(value); } catch { raw = String(value); }
  }
  const origLen = raw.length; // honest ORIGINAL length, reported even when we truncate before scrubbing
  if (origLen <= EXCERPT_CAP) {
    const scrubbed = scrubSecrets(raw);
    return { text: scrubbed, truncated: false, len: origLen };
  }
  // Truncate BEFORE scrubbing so a multi-MB payload (e.g. a base64 PDF passed as input) doesn't run 9
  // regexes over megabytes on the response path. Scrub a small margin past the cap so a credential
  // straddling the 32KB boundary is still caught, then trim the display to the cap.
  const scrubbed = scrubSecrets(raw.slice(0, EXCERPT_CAP + 512));
  return { text: scrubbed.slice(0, EXCERPT_CAP) + "…[truncated]", truncated: true, len: origLen };
}

/**
 * Only these scalar keys survive into metadata — never a raw opts/headers object (S0/S6).
 *
 * `scope` is deliberately ABSENT. It was briefly listed here on an UNMERGED, NEVER-DEPLOYED branch
 * commit, which was the wrong shape twice over: it made the [C6] declaration look wired when nothing
 * populated it, and it would have let any caller self-declare platform scope through ordinary
 * metadata and shift its spend off the unattributed ledger. Both were caught in review before the
 * branch was merged or deployed — no released build ever carried this path. The stored marker is
 * now written ONLY from the validated top-level TraceRow.scope, below.
 */
const METADATA_ALLOWLIST = ["caller_function", "actor_role", "retry_of", "attempt", "capped", "low_confidence"] as const;
function safeMetadata(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!meta) return out;
  for (const k of METADATA_ALLOWLIST) {
    const v = meta[k];
    if (v === undefined || v === null) continue;
    // scalars only — an object/array could smuggle a secret past the allowlist
    if (typeof v === "string") out[k] = scrubSecrets(v).slice(0, 512);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export interface TraceRow {
  tenant_id?: string | null;
  /** Owner #489 — the caller's OWN active workspace tenant id, server-derived (never body-supplied),
   *  captured for operator display itemization. Soft ref (no FK); cleanTenantId coerces non-uuid→null. */
  working_context_tenant_id?: string | null;
  task_id?: string | null;
  agent_id?: string | null;
  parent_trace_id?: string | null;
  provider: string;
  model?: string | null;
  job_kind?: string | null;
  modality?: string | null;
  tier?: string | null;
  status: "success" | "error" | "needs_config";
  tokens_in?: number | null;
  tokens_out?: number | null;
  /**
   * ─── CANONICAL USAGE (2026-08-24) ──────────────────────────────────────────────────────────
   * NULL means the provider did not report the field; 0 means it reported zero. The writer below
   * preserves that distinction rather than coalescing to 0, because a defaulted 0 is
   * indistinguishable from a real one on every downstream sum — the same failure that let list-price
   * estimates omitting caching read as the platform's whole spend.
   */
  tokens_in_uncached?: number | null;
  tokens_cache_read?: number | null;
  tokens_cache_write_5m?: number | null;
  tokens_cache_write_1h?: number | null;
  tokens_reasoning?: number | null;
  /** Non-token provider charges as {unit: quantity} — tool calls, searches, audio seconds. */
  billable_units?: Record<string, number> | null;

  /** Identity, separated. `provider` above remains the LEGACY router slug and is unchanged. */
  gateway_provider?: string | null;
  model_provider?: string | null;
  billing_provider?: string | null;
  capability?: string | null;
  pricing_version?: string | null;

  /** Correlation. request_id groups every ATTEMPT of one logical request. */
  request_id?: string | null;
  provider_request_id?: string | null;
  user_id?: string | null;
  run_id?: string | null;
  workflow_id?: string | null;
  conversation_id?: string | null;
  attempt?: number | null;
  is_retry?: boolean | null;
  is_fallback?: boolean | null;

  latency_ms?: number | null;
  cost_estimate_usd?: number | null;
  /** Raw input payload — scrubbed + truncated here, never stored raw. */
  input?: unknown;
  /** Raw output payload — scrubbed + truncated here, never stored raw. */
  output?: unknown;
  error_class?: string | null;
  error_message?: string | null;
  deliverable_id?: string | null;
  doctrine_gate_hits?: unknown;
  metadata?: Record<string, unknown>;
  /**
   * DECLARED SCOPE for a call with no tenant — the [C6] seam, mirrored from TraceCtx so it survives
   * the hop from the caller's context into the written row.
   *
   * This exists as a TOP-LEVEL field, and is deliberately NOT reachable through `metadata`. The
   * trigger classifies a tenant-less trace as 'platform' on the strength of metadata.scope, and
   * `metadata` is caller-supplied — so if an ordinary caller could put scope there, any call site
   * could declare itself platform-scoped and move its own spend off the unattributed ledger. The
   * allowlist above therefore drops `scope` from caller metadata, and the ONLY way the stored
   * marker appears is the validated assignment in traceLLMCall.
   *
   * Set "platform" ONLY where the call genuinely has no tenant by design. Absent stays absent:
   * the ledger records 'unattributed' and the call site shows up in v_llm_unattributed_spend to be
   * repaired, rather than being silently banked as internal burn.
   */
  scope?: "platform";
}

/**
 * Record one LLM-call trace. DETACHED and best-effort (S1): returns immediately; the insert runs via
 * EdgeRuntime.waitUntil so it never adds latency to the caller's response and never throws into the
 * generation path. `admin` is the service-role client (getAdmin()); a null client is a silent no-op.
 */
export function traceLLMCall(row: TraceRow): void {
  const admin = traceAdmin();
  if (!admin) return; // no service context → no-op (honest: no trace rather than a fake one)

  const inp = toExcerpt(row.input);
  const outp = toExcerpt(row.output);
  const record = {
    tenant_id: cleanTenantId(row.tenant_id),
    // Owner #489 — additive, DISTINCT from tenant_id. Same soft-ref coercion so a malformed/non-uuid
    // working-context id degrades to a null (platform/system) value rather than throwing into the insert.
    working_context_tenant_id: cleanTenantId(row.working_context_tenant_id),
    task_id: row.task_id ?? null,
    agent_id: row.agent_id ?? null,
    parent_trace_id: row.parent_trace_id ?? null,
    provider: row.provider,
    model: row.model ?? null,
    job_kind: row.job_kind ?? null,
    modality: row.modality ?? null,
    tier: row.tier ?? null,
    status: row.status,
    // NULL, never 0, when the provider didn't report — null cost/tokens ≠ zero (S4).
    tokens_in: row.tokens_in ?? null,
    tokens_out: row.tokens_out ?? null,
    // Canonical usage. `?? null` throughout — an absent field must not become a reported zero.
    tokens_in_uncached: row.tokens_in_uncached ?? null,
    tokens_cache_read: row.tokens_cache_read ?? null,
    tokens_cache_write_5m: row.tokens_cache_write_5m ?? null,
    tokens_cache_write_1h: row.tokens_cache_write_1h ?? null,
    tokens_reasoning: row.tokens_reasoning ?? null,
    // Column is NOT NULL DEFAULT '{}' — an empty object is the honest "no non-token charges".
    billable_units: row.billable_units ?? {},
    gateway_provider: row.gateway_provider ?? null,
    model_provider: row.model_provider ?? null,
    billing_provider: row.billing_provider ?? null,
    capability: row.capability ?? null,
    pricing_version: row.pricing_version ?? null,
    // Correlation ids reuse the same uuid coercion as tenant_id: a malformed id degrades to null
    // rather than throwing a 22P02 into the (swallowed) insert and losing the whole row.
    request_id: cleanUuid(row.request_id, "request_id"),
    provider_request_id: row.provider_request_id ?? null,
    user_id: cleanUuid(row.user_id, "user_id"),
    run_id: cleanUuid(row.run_id, "run_id"),
    workflow_id: cleanUuid(row.workflow_id, "workflow_id"),
    conversation_id: cleanUuid(row.conversation_id, "conversation_id"),
    // Defaults match the column defaults, so an un-threaded call site still writes a valid attempt.
    attempt: row.attempt ?? 1,
    is_retry: row.is_retry ?? false,
    is_fallback: row.is_fallback ?? false,
    latency_ms: row.latency_ms ?? null,
    cost_estimate_usd: row.cost_estimate_usd ?? null,
    cost_basis: row.cost_estimate_usd == null ? null : COST_BASIS,
    input_excerpt: inp.text,
    output_excerpt: outp.text,
    input_truncated: inp.truncated,
    output_truncated: outp.truncated,
    input_len: inp.len,
    output_len: outp.len,
    error_class: row.error_class ?? null,
    error_message: row.error_message ? scrubSecrets(String(row.error_message)).slice(0, EXCERPT_CAP) : null,
    deliverable_id: row.deliverable_id ?? null,
    doctrine_gate_hits: row.doctrine_gate_hits ?? null,
    router_version: ROUTER_VERSION,
    // [C6] The declared-scope marker the meter trigger reads (NEW.metadata->>'scope'). Sourced ONLY
    // from the validated top-level field: caller metadata cannot reach this key (see the allowlist
    // above), and any value other than the literal "platform" leaves it unset, so an absent or
    // malformed declaration degrades to 'unattributed' rather than being inferred into 'platform'.
    // Tenant attribution is unaffected — the trigger checks tenant_id FIRST, so a trace with a real
    // tenant is classified 'tenant' whatever this says.
    metadata: row.scope === "platform"
      ? { ...safeMetadata(row.metadata), scope: "platform" }
      : safeMetadata(row.metadata),
  };

  const write = async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000); // bounded so a locked insert can't keep the isolate alive
    try {
      await admin.from("paige_llm_trace").insert(record).abortSignal(ctrl.signal);
    } catch (e) {
      // Best-effort: a trace hiccup must NEVER surface to the caller. Log loudly, never rethrow (an
      // unhandled rejection in a detached promise can crash the isolate on some runtimes).
      console.error("paige_llm_trace: write failed:", (e as Error)?.message);
    } finally {
      clearTimeout(t);
    }
  };

  // Detach: return to the caller immediately, keep the insert alive after the handler resolves. Fall back
  // to a plain fire-and-forget where EdgeRuntime is absent (local/test) — with a swallowing catch so a
  // rejected detached promise never becomes an unhandled rejection.
  const er = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(write());
  else void write().catch(() => {});
}
