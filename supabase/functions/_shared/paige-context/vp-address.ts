/**
 * VP addressing — "ZION, what about my Q2 pricing?" (Stage 2, per
 * docs/doctrine/paige-c-suite-roster.md "Tenant addressing patterns").
 *
 * The roster's rule: a VP address routes the ONE Paige Harness to that VP's
 * capability domain with eligible scoped context — it does NOT create a separate
 * runtime, memory, or authority. This module is the presentation layer of that
 * rule: it detects the address and produces an additive system block (voice +
 * scope) for the turn. The persona block still leads; authority still resolves
 * through the Spine at execution time; nothing here grants anything.
 *
 * The six VPs are doctrine-locked (roster amendment required to change this list).
 * Dependency-free (no `npm:` / Deno globals) so vitest imports it directly.
 */

export interface VpIdentity {
  readonly slug: string;
  readonly name: string;
  readonly role: string;
  readonly scope: string;
  readonly voice: string;
}

/** The doctrine-locked roster (docs/doctrine/paige-c-suite-roster.md). PAIGE is not
 *  addressable here — she IS the default; addressing one of her VPs is the feature. */
export const VP_ROSTER: readonly VpIdentity[] = [
  { slug: "vera", name: "VERA", role: "VP Trust & Verification", scope: "Identity (KYC), consent, document extraction accuracy, integrity boundaries, regulatory (A2P/TCR), payment status, OTP/2FA, signature status.", voice: "precise — exact words, exact statuses, no hedging" },
  { slug: "nexus", name: "NEXUS", role: "VP Growth", scope: "Content strategy and creation, campaigns, sales sequences, pipeline management, lead scoring, brand voice, competitive positioning.", voice: "energetic and market-aware" },
  { slug: "cura", name: "CURA", role: "VP Client Success", scope: "Client onboarding, retention, at-risk detection, churn prevention, the client portal and client-facing experience.", voice: "warm and relentless about the client's outcome" },
  { slug: "mentor", name: "MENTOR", role: "VP Operations", scope: "Workflows (n8n + native), integrations, infrastructure health, Systems Check, Vibe Studio agent config, deploy health.", voice: "technical and brief" },
  { slug: "merit", name: "MERIT", role: "VP Finance & People", scope: "Money spine, revenue tracking, dunning, refunds, hiring and comp, contracts and IP, Business Vault obligations.", voice: "stewarding and careful" },
  { slug: "zion", name: "ZION", role: "VP Strategy & Vision", scope: "Revenue-stage awareness, scenario modeling, owner analytics with interpretation, strategic Playbook orchestration, positioning.", voice: "elevated and directional" },
] as const;

const NAMES = VP_ROSTER.map((v) => v.name);
const ADDRESS_PATTERN = new RegExp(
  `^(?:hey\\s+|hi\\s+|hello\\s+|yo\\s+)?(${NAMES.join("|")})\\b[\\s,:.!?\\u2014-]*(.*)$`,
  "is",
);

export interface VpAddress {
  readonly vp: VpIdentity;
  /** The message with the address removed ("ZION, what about Q2?" → "what about Q2?"). */
  readonly rest: string;
}

/**
 * Detect a leading VP address in a user message. Case-insensitive ("zion," works),
 * greeting-tolerant ("hey ZION"), and only at the START — "what would Zion do" mid-
 * sentence is conversation ABOUT a VP, not addressing one. Returns null when the
 * message addresses no one (the ordinary case — Paige herself is the default).
 */
export function detectVpAddress(text: string | null | undefined): VpAddress | null {
  if (!text || typeof text !== "string") return null;
  const m = ADDRESS_PATTERN.exec(text.trim());
  if (!m) return null;
  const vp = VP_ROSTER.find((v) => v.name === m[1].toUpperCase());
  if (!vp) return null;
  const rest = (m[2] ?? "").trim();
  if (!rest) {
    // A bare "ZION?" with nothing else is a summons — still an address, rest empty.
    return { vp, rest: "" };
  }
  return { vp, rest };
}

/**
 * The additive system block for an addressed turn. Presentation only: the model is
 * told whose desk this turn sits at and how that VP talks — and explicitly that the
 * authority, tools, and verification rules are unchanged (roster 2026-09-08 correction).
 */
export function buildVpAddressBlock(address: VpAddress, tenantName: string): string {
  return `=== VP ADDRESSING — THIS TURN SITS AT ${address.vp.name}'S DESK ===
${address.vp.name} — ${address.vp.role} for ${tenantName}.
Scope: ${address.vp.scope}
Voice for this reply: ${address.vp.voice}.
The user addressed ${address.vp.name} directly. Answer from ${address.vp.name}'s expertise and perspective; you may speak as ${address.vp.name} ("I've been watching the pipeline…"). If the request is genuinely outside ${address.vp.name}'s scope, answer what you can and say which teammate owns the rest — never invent work outside the roster.
This changes PRESENTATION only: you are still one Paige — the same tools, the same verification rules, the same approval gates apply. No authority changes because a name was said.
=== END VP ADDRESSING ===`;
}
