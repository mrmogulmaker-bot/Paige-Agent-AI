// _shared/prompt-forge.ts — Phase A (prompt-forge) + Phase B (semantic memory) of the Compound AI
// System. "Paige learns" (CLAUDE.md §26): every design Paige produces is forged from a versioned
// template (the DNA), steered away from cheesy tells, and — on a genuine success — remembered as a
// vector so future forges can retrieve what worked for this tenant.
//
// THIS FILE EXTENDS, IT DOES NOT RIVAL (§18):
//   • forge() BUILDS a task then calls the EXISTING full-modality seam callModel(modality, tier,
//     task, opts) in _shared/model-router.ts. There is no parallel router, no ROUTE_TABLE fork.
//   • captureToMemory() embeds with the EXISTING voyageEmbedOne() in _shared/voyage.ts — the one
//     canonical embedding space (voyage-3 @ 1024). There is no rival embedding client, and there is
//     NO code path that could send an embedding to a frontier/generation model (§17 structural gate).
//   • Doctrine is enforced with the EXISTING gates in _shared/model-router-gates.ts (§9 scope, §17
//     tier, §2 finance-in-default) and the EXISTING finance guard financeDefaultPrefilter — no new
//     vocab list is declared here.
//
// Honesty (§13): captureToMemory writes a memory row ONLY on a successful provider call
// (result.needs_config falsy AND content/artifact actually produced). A needs_config or errored call
// writes NO row — we never persist a fake artifact_url or a hoped-for result. cost_estimate_usd is
// carried through LABELED as an estimate, never as a billed figure.

import { callModel, type CallOpts, type ModelResult } from "./model-router.ts";
import {
  type Modality,
  type Tier,
  type GateInput,
  DoctrineViolation,
  runPreGenerationGates,
  financeDefaultPrefilter,
} from "./model-router-gates.ts";
import { readBrandTokens, type BrandTokens } from "./brand-tokens.ts";
import { CHEESY_TELLS_AVOID } from "./cheesy-tells.ts";
import { voyageEmbedOne, VOYAGE_MODEL, VOYAGE_DIMS } from "./voyage.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

// Re-export the shared error type from its one home (§12) so a caller imports it from the forge.
export { DoctrineViolation } from "./model-router-gates.ts";

// ── Service-role client (lazy) for template lookup, memory insert, and audit ──────────────────
let _admin: ReturnType<typeof createClient> | null = null;
function getAdmin(): ReturnType<typeof createClient> | null {
  if (_admin) return _admin;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null; // no service context — template lookup/memory/audit become no-ops
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

// A short, non-reversible hash of the intent/prompt so an audit record references WHICH task without
// ever logging raw content or PII (§11/§13). FNV-1a, hex — same primitive the router uses.
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Best-effort audit into paige_audit_log. NEVER blocks a forge/capture, NEVER contains a secret.
 * Per the paige_audit_log contract, tenant_id is set EXPLICITLY on EVERY insert (nullable column,
 * but we always pass it) so an audit row is never silently un-scoped (§9).
 */
async function audit(
  action: string,
  tenantId: string | null,
  actorUserId: string | null,
  actorRole: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = getAdmin();
    if (!admin) return;
    await admin.from("paige_audit_log").insert({
      tenant_id: tenantId,          // EXPLICIT on every insert (§9) — never omitted
      actor_user_id: actorUserId,
      actor_role: actorRole,
      action,
      target_type: "prompt_forge",
      payload,
    });
  } catch (e) {
    console.error("prompt-forge: audit failed:", (e as Error)?.message);
  }
}

// ── §2 template guard — reuse the EXISTING finance vocab, never a rival list ───────────────────
/**
 * A platform-DEFAULT template (or memory) must never carry finance/credit/lender language (§2).
 * Delegates to the router's financeDefaultPrefilter (the single finance vocab, §18) — this file
 * declares NO finance words of its own. Throws a typed DoctrineViolation('§2', …) on a hit.
 */
export function assertPromptFinanceClean(text: string, isPlatformDefault: boolean): void {
  if (!isPlatformDefault) return; // finance is an allowed per-tenant opt-in offer, never a default
  const phrase = financeDefaultPrefilter(text);
  if (phrase) {
    throw new DoctrineViolation("§2", "finance/credit language is not allowed in platform-default content", {
      phrase,
    });
  }
}

// ── Placeholder substitution ───────────────────────────────────────────────────────────────
// The forge fills a template's {{tokens}} with the tenant's real, present-only brand tokens plus
// the caller's intent and the standing anti-patterns. For an OPTIONAL brand token the tenant has
// not set, we substitute a NEUTRAL, non-bracketed default so the final prompt is coherent and never
// ships a "{{…}}" or "[PLACEHOLDER]" (§15). Required tokens (intent, anti_patterns) always resolve.
const NEUTRAL_DEFAULTS: Record<string, string> = {
  // These are safe, coaching-generic, §2/§3-clean fallbacks — never finance, never a bracket.
  tenant_palette: "the brand's established palette — a calm, credible ground with one disciplined accent reserved for the primary action",
  tenant_voice: "a direct, confident, founder-grade voice — plainspoken and premium, never buzzwordy",
  tenant_target_market: "the practice's ideal clients — the professionals and businesses it serves",
};

interface SubstitutionValues {
  tenant_name: string;
  tenant_palette: string;
  tenant_voice: string;
  tenant_target_market: string;
  user_intent: string;
  anti_patterns: string;
}

/** Build the concrete substitution set from present-only brand tokens + intent, filling absent
 *  optional brand tokens with neutral defaults (never a bracket). */
function resolveValues(brand: BrandTokens, userIntent: string): SubstitutionValues {
  return {
    tenant_name: brand.tenant_name ?? "the practice",
    tenant_palette: brand.tenant_palette ?? NEUTRAL_DEFAULTS.tenant_palette,
    tenant_voice: brand.tenant_voice ?? NEUTRAL_DEFAULTS.tenant_voice,
    tenant_target_market: brand.tenant_target_market ?? NEUTRAL_DEFAULTS.tenant_target_market,
    user_intent: userIntent.trim(),
    anti_patterns: CHEESY_TELLS_AVOID,
  };
}

/** Replace every {{token}} in the body with its resolved value. Any UNKNOWN token is stripped
 *  (replaced with empty) and whitespace is tidied, so a stray placeholder can never ship (§15). */
export function substituteTemplate(body: string, values: SubstitutionValues): string {
  const map = values as unknown as Record<string, string>;
  let out = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
    const v = map[key.toLowerCase()];
    return typeof v === "string" ? v : ""; // unknown token → removed, never left as "{{…}}"
  });
  // Tidy artifacts a removed token may leave (double spaces, orphan " ()", stray leading punctuation).
  out = out.replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:])/g, "$1").trim();
  return out;
}

// ── Template selection ─────────────────────────────────────────────────────────────────────
export interface ForgeTemplate {
  id: string;
  modality: string;
  provider: string;
  template_name: string;
  template_body: string;
  is_platform_default: boolean;
}

/**
 * Pick the best template for a forge: the tenant's OWN authored template wins over the platform
 * default (tenant-authored is native to their practice, §7/§9); within a tier, an exact
 * template_name match wins, else the first enabled row for the modality (+provider if given).
 * Returns null when nothing matches (the forge then falls back to an intent-only brief).
 */
async function pickTemplate(
  tenantId: string,
  modality: Modality,
  provider?: string,
  templateName?: string,
): Promise<ForgeTemplate | null> {
  const admin = getAdmin();
  if (!admin) return null;
  try {
    let q = admin
      .from("paige_prompt_template")
      .select("id, modality, provider, template_name, template_body, is_platform_default, tenant_id, enabled")
      .eq("modality", modality)
      .eq("enabled", true)
      // §9 — this read runs through the SERVICE-ROLE client, which BYPASSES RLS, so the tenant scope
      // MUST be enforced in the query itself: only the caller's OWN rows or platform defaults are
      // eligible. Without this a tenant with no template of their own could resolve to a STRANGER
      // tenant's private template (cross-tenant content leak).
      .or(`tenant_id.eq.${tenantId},is_platform_default.eq.true`);
    if (provider) q = q.eq("provider", provider);
    if (templateName) q = q.eq("template_name", templateName);
    const { data, error } = await q;
    if (error || !Array.isArray(data) || data.length === 0) return null;
    const rows = data as unknown as (ForgeTemplate & { tenant_id: string })[];
    // Rank the caller's OWN authored template first (§7 tenant-authored wins), then the platform
    // default. The .or() above has already removed every other tenant's rows, so nothing else can rank.
    rows.sort((a, b) => {
      const aRank = a.tenant_id === tenantId && !a.is_platform_default ? 0 : a.is_platform_default ? 1 : 2;
      const bRank = b.tenant_id === tenantId && !b.is_platform_default ? 0 : b.is_platform_default ? 1 : 2;
      return aRank - bRank;
    });
    const r = rows[0];
    return {
      id: r.id,
      modality: r.modality,
      provider: r.provider,
      template_name: r.template_name,
      template_body: r.template_body,
      is_platform_default: r.is_platform_default,
    };
  } catch (e) {
    console.error("prompt-forge: template lookup failed:", (e as Error)?.message);
    return null;
  }
}

// ── forge() — the public entry ────────────────────────────────────────────────────────────────
export interface ForgeParams {
  tenantId: string;
  modality: Modality;
  tier: Tier;
  /** The tenant's brief in their own words — REQUIRED. Never pre-classified by a human (§18). */
  userIntent: string;
  provider?: string;      // narrow template selection to a provider lane
  templateName?: string;  // pick a specific template by name (e.g. 'logo-wordmark')
  actorRole?: string;
  actorUserId?: string;
  is_platform_default?: boolean;
  is_customer_send?: boolean;
  is_approval_decision?: boolean;
  brandVoice?: string;    // caller override for the router's §3 post-gen voice pass
  callerFunction?: string;
  /** Extra task fields passed through to callModel (e.g. { aspect: "16:9", size: "1024x1024" }). */
  task?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Persist a memory row on success (default true). Set false for throwaway/preview forges. */
  remember?: boolean;
}

export interface ForgeResult {
  result: ModelResult;
  /** The final, fully-resolved prompt sent to the provider (bracket-free). */
  prompt: string;
  templateId?: string;
  templateName?: string;
  /** The memory row id, present only when a row was actually written (honest capture). */
  memoryId?: string;
}

/**
 * forge — build a doctrine-clean generation prompt from the tenant's DNA template + brand + the
 * standing anti-patterns, run it through the EXISTING callModel seam, and (on success) remember it.
 *
 * Order:
 *   1. §9 gate (throw on missing tenantId) + §17/§2 pre-gen gates — REUSED from model-router-gates.
 *      A violation is audited (tenant_id set EXPLICITLY) then re-thrown; the forge does not proceed.
 *   2. Resolve brand tokens (present-only) and select the template (tenant-authored > platform default).
 *   3. §2: a platform-default forged prompt is re-checked finance-clean before generation.
 *   4. Substitute → final prompt → callModel(modality, tier, task, opts).  ← EXTENDS, never rivals.
 *   5. On a genuine success, captureToMemory() (honest: no row on needs_config/error).
 */
export async function forge(params: ForgeParams): Promise<ForgeResult> {
  const {
    tenantId, modality, tier, userIntent, provider, templateName,
    actorRole, actorUserId, is_platform_default, is_customer_send, is_approval_decision,
    brandVoice, callerFunction, task, metadata,
  } = params;

  const intent = (userIntent ?? "").trim();

  // 1) §9 (scope, throw on missing tenantId) → §17 (send/approval tier) → §2 (finance-in-default).
  //    REUSE the router's gates; audit + re-throw on violation, tenant_id EXPLICIT on the audit row.
  const gateInput: GateInput = {
    modality,
    tier,
    tenantId,
    actorRole,
    is_customer_send,
    is_approval_decision,
    is_platform_default,
    taskText: intent,
  };
  try {
    runPreGenerationGates(gateInput); // §9 → §17 → §2
  } catch (e) {
    if (e instanceof DoctrineViolation) {
      await audit("prompt_forge.doctrine_violation", (tenantId ?? "").trim() || null, actorUserId ?? null, actorRole ?? null, {
        code: e.code,
        modality,
        tier,
        reason: e.message,
        intent_hash: hashText(intent),
        caller_function: callerFunction ?? null,
        ...(e.detail?.phrase ? { phrase: e.detail.phrase } : {}),
      });
    }
    throw e;
  }

  if (!intent) {
    throw new DoctrineViolation("§15", "forge requires a userIntent — Paige builds from the brief, never a blank", {
      modality,
    });
  }

  // 2) Brand tokens (present-only) + template selection.
  const admin = getAdmin();
  const brand: BrandTokens = admin ? await readBrandTokens(admin as never, tenantId) : {};
  const template = await pickTemplate(tenantId, modality, provider, templateName);

  const values = resolveValues(brand, intent);

  // Build the final prompt: from the DNA template if we have one, else an honest intent-only brief
  // (still brand-anchored and anti-pattern-steered) so a missing template degrades, never fabricates.
  let finalPrompt: string;
  if (template) {
    finalPrompt = substituteTemplate(template.template_body, values);
  } else {
    finalPrompt = substituteTemplate(
      `Create a ${modality} for {{tenant_name}}, targeted at {{tenant_target_market}}. ` +
      `Intent: {{user_intent}}. Voice and identity: {{tenant_voice}}; palette: {{tenant_palette}}. ` +
      `Hold a senior-designer bar. Avoid: {{anti_patterns}}.`,
      values,
    );
  }

  // 3) §2 belt: a platform-default forged prompt is re-scanned finance-clean before generation
  //    (the callModel §2 output gate is the suspenders). Reuses the existing finance guard.
  assertPromptFinanceClean(finalPrompt, Boolean(is_platform_default));

  // 4) Call the EXISTING full-modality seam. forge NEVER touches a provider directly.
  const opts: CallOpts = {
    tenantId,
    actorRole,
    actorUserId,
    is_customer_send,
    is_approval_decision,
    is_platform_default,
    brandVoice,
    callerFunction: callerFunction ?? "prompt-forge",
    metadata: {
      forge_template: template?.template_name ?? null,
      forge_template_id: template?.id ?? null,
      ...(metadata ?? {}),
    },
  };
  const callTask = { prompt: finalPrompt, ...(task ?? {}) };
  const result = await callModel(modality, tier, callTask, opts);

  // 5) Honest capture — only writes a row on a genuine success (see captureToMemory).
  let memoryId: string | undefined;
  if (params.remember !== false) {
    memoryId = await captureToMemory({
      tenantId,
      modality,
      provider: result.provider,
      tier,
      userIntent: intent,
      promptText: finalPrompt,
      result,
      templateId: template?.id,
      templateName: template?.template_name,
      actorUserId,
      actorRole,
      is_platform_default,
    });
  }

  return {
    result,
    prompt: finalPrompt,
    templateId: template?.id,
    templateName: template?.template_name,
    memoryId,
  };
}

// ── captureToMemory() — Phase B: remember what worked ─────────────────────────────────────────
export interface CaptureParams {
  tenantId: string;
  modality: Modality;
  provider: string;
  tier: Tier;
  userIntent: string;
  promptText: string;
  result: ModelResult;
  templateId?: string;
  templateName?: string;
  actorUserId?: string;
  actorRole?: string;
  is_platform_default?: boolean;
}

/**
 * Persist a semantic memory of a SUCCESSFUL forge so future forges can retrieve what worked for this
 * tenant. Returns the new row id, or undefined when nothing was written.
 *
 * HONESTY GATE (§13): a row is written ONLY when the provider call genuinely succeeded —
 * result.needs_config is falsy AND real output exists (a content string or an artifact_url). A
 * needs_config or empty result writes NO row and stores NO fabricated artifact_url.
 *
 * §17 EMBEDDING STRUCTURAL GATE: the embedding is produced by voyageEmbedOne() ONLY — the single
 * canonical space (voyage-3 @ 1024). There is NO branch that routes an embedding to a frontier /
 * generation model, and the row is tagged embedding_model='voyage-3', embedding_dim=1024. A
 * dimension mismatch is a hard stop (we never store an off-space vector).
 *
 * §2: for a platform-default capture, the remembered text is re-checked finance-clean via the
 * EXISTING finance guard before it is embedded/stored — no rival vocab.
 */
export async function captureToMemory(p: CaptureParams): Promise<string | undefined> {
  const { tenantId, modality, provider, tier, userIntent, promptText, result } = p;

  // HONEST CAPTURE — nothing to remember unless the call actually produced something.
  const produced = !result.needs_config && (
    (typeof result.content === "string" && result.content.trim().length > 0) ||
    (typeof result.artifact_url === "string" && result.artifact_url.length > 0)
  );
  if (!produced) return undefined;

  const admin = getAdmin();
  if (!admin) return undefined;

  // §2 — a platform-default memory must stay finance-clean (reuse the existing finance guard).
  const rememberText = `${userIntent}\n\n${promptText}`;
  try {
    assertPromptFinanceClean(rememberText, Boolean(p.is_platform_default));
  } catch (e) {
    if (e instanceof DoctrineViolation) {
      await audit("prompt_forge.memory_rejected", tenantId || null, p.actorUserId ?? null, p.actorRole ?? null, {
        code: e.code, modality, provider, reason: e.message,
      });
      return undefined; // do not remember finance language into a platform default
    }
    throw e;
  }

  // §17 structural gate — voyage-3 ONLY. No frontier/generation embedding path exists.
  let embedding: number[];
  try {
    embedding = await voyageEmbedOne(rememberText, { inputType: "document" });
  } catch (e) {
    // An embedding hiccup must not fake a memory — skip the row honestly (§13).
    await audit("prompt_forge.embed_failed", tenantId || null, p.actorUserId ?? null, p.actorRole ?? null, {
      modality, provider, reason: (e as Error)?.message ?? "embed error",
    });
    return undefined;
  }
  if (!Array.isArray(embedding) || embedding.length !== VOYAGE_DIMS) {
    // Off-space vector — never stored (the whole memory space must be comparable).
    await audit("prompt_forge.embed_dim_mismatch", tenantId || null, p.actorUserId ?? null, p.actorRole ?? null, {
      modality, provider, got: Array.isArray(embedding) ? embedding.length : null, expected: VOYAGE_DIMS,
    });
    return undefined;
  }

  try {
    const { data, error } = await admin
      .from("paige_prompt_memory")
      .insert({
        tenant_id: tenantId,                 // EXPLICIT (§9)
        modality,
        provider,
        model: result.model,
        tier,
        template_name: p.templateName ?? null,
        template_id: p.templateId ?? null,
        user_intent: userIntent,
        prompt_text: promptText,
        artifact_url: result.artifact_url ?? null,   // real, produced artifact only (honest)
        deliverable_id: result.deliverable_id ?? null,
        embedding,
        embedding_model: VOYAGE_MODEL,       // 'voyage-3'
        embedding_dim: VOYAGE_DIMS,          // 1024
        cost_estimate_usd: result.cost_estimate_usd ?? null, // LABELED estimate, never billed
        created_by: p.actorUserId ?? null,
        metadata: {
          tokens_in: result.tokens_in ?? null,
          tokens_out: result.tokens_out ?? null,
          latency_ms: result.latency_ms,
        },
      })
      .select("id")
      .single();
    if (error) {
      console.error("prompt-forge: memory insert failed:", error.message);
      return undefined;
    }
    const id = (data as { id?: string } | null)?.id;
    await audit("prompt_forge.remembered", tenantId || null, p.actorUserId ?? null, p.actorRole ?? null, {
      modality, provider, model: result.model, memory_id: id ?? null,
      embedding_model: VOYAGE_MODEL, embedding_dim: VOYAGE_DIMS,
      intent_hash: hashText(userIntent),
    });
    return id;
  } catch (e) {
    console.error("prompt-forge: memory persist failed:", (e as Error)?.message);
    return undefined;
  }
}
