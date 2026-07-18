// _shared/model-router-gates.ts — Paige Model Router doctrine gates (PURE).
//
// This module is the fail-closed doctrine boundary for the full-modality Model Router.
// It encodes the non-negotiable hard rules (§9 tenant scope, §17 send/approval tier,
// §2 finance-in-defaults, §3 voice) as pure, synchronous assertions so NO caller has to
// remember doctrine — the router runs these before any provider is touched.
//
// PURITY CONTRACT (do not break — the gates are unit-tested offline in plain Node):
//   • No Deno.env, no fetch, no import of claude.ts or any provider client.
//   • No I/O, no clock, no randomness. Same input → same result, always.
//   • Fail-closed by construction: a missing/ambiguous field throws, never silently passes.
//
// The router (model-router.ts) owns the runtime side effects (audit-log on violation,
// the post-generation §3 rewrite loop). This file only decides "is this allowed?" and
// "what's wrong with this text?" — it never logs, never mutates, never calls out.

// ── Shared vocabulary ───────────────────────────────────────────────────────
export type Modality =
  | "text"
  | "image"
  | "image-with-text"
  | "3d"
  | "audio-voice"
  | "doc-render";

export type Tier = "frontier" | "open-fast" | "open-flexible";

export interface GateInput {
  modality: Modality;
  tier: Tier;
  tenantId: string;
  actorRole?: string;
  is_customer_send?: boolean;
  is_approval_decision?: boolean;
  is_platform_default?: boolean;
  taskText?: string;
}

// Roles permitted to author/emit platform DEFAULT content (§9: the operator layer —
// Super Admin / God). Anything is_platform_default must be driven by one of these; a
// tenant role authoring a "platform default" is a §9 seam violation, not a default.
const OPERATOR_ROLES: ReadonlySet<string> = new Set([
  "operator",
  "god",
  "super_admin",
  "superadmin",
  "platform_admin",
]);

// Only the frontier tier may carry a customer send or an approval DECISION (§17). Open
// models never touch a send or a judgment that acts on the coach's behalf — cost is never
// worth a wrong autonomous act or an off-voice message under the coach's brand.
const SEND_APPROVAL_TIER: Tier = "frontier";

/**
 * A doctrine rule was violated. Carries a machine-readable `code` (e.g. "§17") and a
 * structured `detail` so the router can audit-log it precisely and a caller can branch on
 * the code without string-scraping the message. This is a typed, structured error (§11/§13)
 * — never a bare throw.
 */
export class DoctrineViolation extends Error {
  code: string;
  detail: Record<string, unknown>;
  constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
    super(`[${code}] ${message}`);
    this.name = "DoctrineViolation";
    this.code = code;
    this.detail = detail;
    // Preserve prototype chain across the TS/Deno/Node transpile boundary so
    // `instanceof DoctrineViolation` holds in every runtime the gates run in.
    Object.setPrototypeOf(this, DoctrineViolation.prototype);
  }
}

// ── §9 — tenant scope ────────────────────────────────────────────────────────
/**
 * Every model call is tenant-scoped (§9). No anonymous/cross-tenant generation. If the
 * call claims to produce a PLATFORM DEFAULT, an operator role must be driving it — a
 * tenant cannot author the shared/God defaults that ship to everyone.
 */
export function assertTenantScope(i: GateInput): void {
  const tenantId = (i.tenantId ?? "").trim();
  if (!tenantId) {
    throw new DoctrineViolation("§9", "model call requires a tenantId (no anonymous/cross-tenant generation)", {
      modality: i.modality,
      tier: i.tier,
    });
  }
  if (i.is_platform_default) {
    const role = (i.actorRole ?? "").trim().toLowerCase();
    if (!OPERATOR_ROLES.has(role)) {
      throw new DoctrineViolation("§9", "platform-default content requires an operator role (operator/god/super_admin)", {
        actorRole: i.actorRole ?? null,
        modality: i.modality,
      });
    }
  }
}

// ── §17 — send / approval tier ───────────────────────────────────────────────
/**
 * A customer SEND or an approval DECISION must run on the frontier tier — never an open
 * model (§17). Enforced structurally and fail-closed: if either flag is set and the tier
 * is anything but frontier, throw.
 */
export function assertSendApprovalTier(i: GateInput): void {
  // Coerce to boolean, fail-CLOSED: a caller that forwards an unparsed request value
  // (JSON `"is_customer_send":"true"`, or `1`) must still be treated as a send. Strict
  // `=== true` would fail OPEN on those truthy non-booleans and let a send reach an open tier.
  const sensitive = Boolean(i.is_customer_send) || Boolean(i.is_approval_decision);
  if (sensitive && i.tier !== SEND_APPROVAL_TIER) {
    throw new DoctrineViolation("§17", "a customer send or approval decision must route to the frontier tier, never an open model", {
      tier: i.tier,
      is_customer_send: Boolean(i.is_customer_send),
      is_approval_decision: Boolean(i.is_approval_decision),
    });
  }
}

// ── §2 — no finance/credit language in platform DEFAULTS ─────────────────────
// Word-boundaried, case-insensitive, and tolerant of the soft variants people actually
// type (spacing/punctuation in "credit repair", "A.I."-style dotting is handled by the
// voice regex, not here). Finance/credit is an allowed per-tenant OPT-IN offer — this
// prefilter only fires when the content is a PLATFORM DEFAULT (checked by the caller).
//
// Each alternative is a distinct finance/credit tell; the surrounding \b anchors keep
// them from matching inside unrelated words (e.g. "creditable" is intentionally NOT a hit
// because we anchor on the whole finance phrasing, and "loanword" won't match \bloan\b?
// — it would, so \bloan\b is deliberately paired with common finance context below).
const FINANCE_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "credit repair", re: /\bcredit[\s-]*repair(?:ing|s)?\b/i },
  { label: "credit score", re: /\bcredit[\s-]*scores?\b/i },
  { label: "credit", re: /\bcredit\b/i },
  { label: "funding", re: /\bfunding\b/i },
  { label: "fundable", re: /\bfundab(?:le|ility)\b/i },
  { label: "lender", re: /\blenders?\b/i },
  { label: "lending", re: /\blending\b/i },
  { label: "loan", re: /\bloans?\b/i },
  { label: "financing", re: /\bfinanc(?:e|es|ing)\b/i },
  { label: "readiness score", re: /\breadiness[\s-]*scores?\b/i },
  { label: "funding readiness", re: /\bfunding[\s-]*readiness\b/i },
  { label: "tradeline", re: /\btrade[\s-]*lines?\b/i },
  { label: "CROA", re: /\bCROA\b/i },
  { label: "FCRA", re: /\bFCRA\b/i },
  { label: "underwriting", re: /\bunder[\s-]*writing\b/i },
  { label: "APR", re: /\bAPR\b/i },
  { label: "business credit", re: /\bbusiness[\s-]*credit\b/i },
];

/**
 * Return the first finance/credit phrase found in `text`, or null if clean. Pure and
 * side-effect-free — usable as a standalone prefilter anywhere a §2 check is needed.
 */
export function financeDefaultPrefilter(text: string): string | null {
  const t = text ?? "";
  if (!t) return null;
  for (const { label, re } of FINANCE_PATTERNS) {
    if (re.test(t)) return label;
  }
  return null;
}

/**
 * §2: platform DEFAULTS must never carry finance/credit language. If this call is a
 * platform default and its task text trips the finance prefilter, throw with the matched
 * phrase in `detail` so the router can audit exactly what was caught. (Non-default calls —
 * a tenant that opted into a funding preset — pass untouched; finance is an opt-in offer,
 * never a default.)
 */
export function assertNoFinanceInDefault(i: GateInput): void {
  if (!i.is_platform_default) return;
  const phrase = financeDefaultPrefilter(i.taskText ?? "");
  if (phrase) {
    throw new DoctrineViolation("§2", "finance/credit language is not allowed in platform-default content", {
      phrase,
      modality: i.modality,
    });
  }
}

// ── §3 — voice ───────────────────────────────────────────────────────────────
// The banned-voice tells and their soft variants. Case-insensitive, word-boundaried, and
// tolerant of the real-world dodges: "A.I.-powered" / "AI powered" / "AI-driven",
// "streamline(s|d|ing)", "seamless(ly)", "empower(s|ed|ing|ment)". Returns EVERY distinct
// canonical tell present (deduped), so the router can decide rewrite-vs-throw on count.
const VOICE_PATTERNS: { label: string; re: RegExp }[] = [
  // "AI-powered" and its dotted/spaced/driven variants.
  { label: "AI-powered", re: /\bA\.?\s*I\.?[\s-]*(?:powered|driven|enabled|based)\b/i },
  { label: "AI-powered", re: /\bartificial[\s-]+intelligence[\s-]*(?:powered|driven|enabled)\b/i },
  { label: "streamline", re: /\bstream[\s-]*lines?\b/i },
  { label: "streamline", re: /\bstream[\s-]*lin(?:ed|ing)\b/i },
  { label: "seamless", re: /\bseamless(?:ly)?\b/i },
  { label: "empower", re: /\bempower(?:s|ed|ing|ment)?\b/i },
];

/**
 * §3: return the distinct banned-voice tells present in `text` (canonical labels, deduped),
 * or [] if the copy is clean. Pure — the router owns the rewrite/throw decision.
 */
export function voiceViolations(text: string): string[] {
  const t = text ?? "";
  if (!t) return [];
  const hits = new Set<string>();
  for (const { label, re } of VOICE_PATTERNS) {
    if (re.test(t)) hits.add(label);
  }
  return [...hits];
}

// ── Orchestration ────────────────────────────────────────────────────────────
/**
 * Run the PRE-generation gates in doctrine order — §9 (scope) → §17 (send/approval tier)
 * → §2 (finance-in-default). Voice (§3) is a POST-generation check on model output and is
 * run by the router after the provider returns, so it is intentionally NOT here.
 *
 * Fail-closed: the first violated rule throws a DoctrineViolation; nothing downstream runs.
 */
export function runPreGenerationGates(i: GateInput): void {
  assertTenantScope(i);       // §9
  assertSendApprovalTier(i);  // §17
  assertNoFinanceInDefault(i); // §2
}
