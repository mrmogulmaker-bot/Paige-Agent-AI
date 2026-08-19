// Platform-scope chat configuration — ONE home (§18) for the scope prose, the
// opening greeting, and the strategic prompt chips shared by every mount of the
// tenant-less platform conversation: `PaigePlatformDesk` (the app-chrome mount,
// used inside `PaigeWorkspace`) and the operator console's CD-chrome mount
// (`OperatorApp`'s workspace branch). One source so the two chromes never drift
// into two different "personalities" for what is the same conversation (§9 — no
// tenant is ever assumed; §13 — neither mount claims live metrics it can't see).
import type { QuickChip } from "./commandCenterTypes";

export const PLATFORM_SCOPE_PROSE = [
  "SCOPE: PLATFORM (no active tenant/workspace).",
  "You are Paige operating at the platform level — the Chief of Staff for the Paige Agent AI company itself, not for any single tenant.",
  "There is NO active tenant or client in this session; do not assume, reference, or act on any specific tenant's data.",
  "Help the platform operator reason about company-level concerns: tenant growth, product roadmap, positioning, prioritization, and operations.",
  "You do NOT have live platform metrics (MRR, tenant counts, revenue) wired in this session. If asked for specific figures, say they live in the platform desks (Tenants, Platform revenue, Analytics) and do not invent numbers.",
].join(" ");

// Strategic chips a generic Chief of Staff can genuinely answer WITHOUT reading
// live metrics — so nothing here implies a data pull that isn't wired (§13).
export const PLATFORM_CHIPS: QuickChip[] = [
  { label: "What should I prioritize?", prompt: "From a Chief-of-Staff lens across the whole platform, what should I prioritize this week and why?" },
  { label: "Think through the roadmap", prompt: "Help me think through the platform roadmap and how to sequence the next few bets." },
  { label: "Draft an operator update", prompt: "Draft a short internal update to the team on where the platform stands and what's next." },
  { label: "Pressure-test positioning", prompt: "Pressure-test how we position Paige as the intelligent client portal against the static-portal category." },
];

const PLATFORM_GREETING_BODY =
  "I'm at the platform level with you — your Chief of Staff for the company itself, not any one workspace. Tell me what you're steering: priorities across tenants, the roadmap, positioning, or an operator update you need drafted. For live numbers, I'll point you to the platform desks.";

/** §52/§36 — Paige OPENS already knowing the operator. `firstName` comes from
 *  RUNTIME auth metadata (never the repo, §45); a missing name degrades to the
 *  name-less opener (§13 — never fabricate a name). */
export const buildPlatformGreeting = (firstName: string | null): string =>
  firstName ? `${firstName} — ${PLATFORM_GREETING_BODY}` : PLATFORM_GREETING_BODY;
