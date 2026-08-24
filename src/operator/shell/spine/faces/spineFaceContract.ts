/**
 * The four spine faces beside Chat — Memory, Team, Skills, Code.
 *
 * BUILD-ORDER Layer 5. Ported from `PAIGE Super Admin Shell v3.dc.html`: `mindVals` L10427–L10620
 * (the face registry, the memory kinds, the skill groups, the agent list) and the bodies at
 * L3897–L3990. Owner, 2026-08-24, sending CD's five reference frames: *"This is what we want it
 * to look like."*
 *
 * WHY THE FACES WERE INVISIBLE, WHICH IS NOT THE SAME AS MISSING. `OperatorSpine` filters its
 * region registry to those with a non-null `content`, and only Chat had one — so the strip drew a
 * single face and the other four sat in the registry, addressable and unreachable. That filter is
 * the right rule (a face whose body is a blank pane is worse than no face), so the fix is to give
 * the four bodies, not to loosen the gate.
 *
 * ─── STRUCTURE BEFORE DATA, AND WHAT IS AND IS NOT A FIXTURE HERE ────────────────────────────
 *
 * NOT PORTED — `P.MEMORY` (five invented memories about a fictional operator's week),
 * `P.MEMORY_PROPOSED` (one invented proposal), and every agent's `now`/`last` line ("Watching 3
 * threads", "Swept 10 checks at 06:30"). Those are CD's illustration of a working console and
 * putting them on screen would be inventing the operator's own history.
 *
 * PORTED — the memory KINDS and their notes, the skill GROUP titles, the agent roster's names and
 * roles, and every foot. Two of those need saying out loud:
 *
 *   · THE AGENT NAMES ARE OURS, NOT CD'S INVENTION. PAIGE · ZION · OATHEN · MASON appear in
 *     `src/lib/paige/vpDepartments.ts` — this platform's own department roster — so they are
 *     vocabulary in the same class as `P.CHANNELS`, and they come over. Their live state does not.
 *
 *   · ONE SKILL CLAIM IN THE PACK IS STALE AGAINST THIS REPO. `P.SKILLS` marks "Read the web" as
 *     `No substrate`, noted *"No fetch seam, and no way to record a citation."* We shipped one:
 *     `browse_public_url` on the `paige-browser` Fly service, with a tenant-scoped
 *     `paige_browser_usage` audit rail. So the pack is describing a gap that has since closed.
 *     Rather than porting a claim that is now false (§13) or silently rewriting CD's copy (§00),
 *     no skill list ships from the pack at all — the face reads its skills, and Layer 6 hands it
 *     the real `paige_skills` rows, which is where that answer belongs anyway. Reported to CD.
 */
import type { ReactNode } from "react";

/* ── Memory ─────────────────────────────────────────────────────────────────────────────────── */

/** `KIND` — `mindVals` L10446–L10450, verbatim. Three kinds, three different promises. */
export const MEMORY_KINDS = [
  {
    kind: "Standing",
    note: "you told her, and it holds until you say otherwise",
    tone: "var(--pg-gold)",
  },
  {
    kind: "Learned",
    note: "she worked it out, and will drop it if you disagree",
    tone: "var(--pg-violet)",
  },
  { kind: "Working", note: "true for this session only", tone: "var(--pg-line-strong)" },
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number]["kind"];

export type MemoryRow = {
  readonly id: string;
  readonly kind: MemoryKind;
  /** The memory itself, in her words or yours. */
  readonly what: string;
  /** Where it came from — "You said it · 2d" / "She inferred it · 3d". */
  readonly from: string;
  /** What it changes. A memory that changes nothing is not worth keeping. */
  readonly acts: string;
  readonly pinned?: boolean;
};

/** A memory she wants but may not take. At ask-first she proposes and the operator rules. */
export type MemoryProposal = {
  readonly what: string;
  readonly from: string;
  readonly acts: string;
};

export const MEMORY_FOOT =
  "A standing memory holds until you retract it; a learned one she will drop the moment you " +
  "disagree. Forgetting is an act and is recorded — nothing leaves quietly.";

/* ── Team ───────────────────────────────────────────────────────────────────────────────────── */

export type AgentRow = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  /** The grant it was given. Clamped against the ceiling before it is shown. */
  readonly grant: string;
  readonly state: "Ready" | "Idle" | "Queued" | "Not started" | string;
  /** What it is doing right now. Absent → an em-dash, never an invented activity. */
  readonly now?: string | null;
  /** What it last did. Absent → an em-dash. */
  readonly last?: string | null;
};

/**
 * `spinGrantNote` — `mindVals` L10588. The rule a new agent is born under, and the reason the
 * form states it before you name the thing: a spun-up agent starts at the floor and can never be
 * raised above PAIGE herself, so composing a team can never widen authority.
 */
export function spinGrantNote(floor: string, paige: string): string {
  return `It starts at ${floor} and can never be raised above PAIGE, who is at ${paige}. Retires when its job closes.`;
}

/* ── Skills ─────────────────────────────────────────────────────────────────────────────────── */

export type SkillRow = {
  readonly name: string;
  readonly note: string;
  /** Whether the substrate to run it exists at operator scope. */
  readonly live: boolean;
};

/** `skillGroups` — `mindVals` L10476–L10484. Grouped by what she can ACTUALLY do. */
export const SKILL_GROUP_LIVE = "She can do this now";
export const SKILL_GROUP_OWED = "Not until Stage 3 builds it";
export const SKILL_GROUP_TAUGHT = "You taught her";

/* ── Code ───────────────────────────────────────────────────────────────────────────────────── */

export type ScratchFile = {
  readonly name: string;
  readonly lang: string;
  readonly size: string;
  readonly when: string;
  readonly summary: string;
  readonly body?: string | null;
};

/**
 * `scratchBody` — `mindVals` L10600–L10603. Both arms, verbatim, and which one shows is decided
 * by the ceiling rather than by a preference: held at or below "Draft only", she reads and does
 * not write.
 */
export const SCRATCH_HELD =
  "// Held at the Trust Compass ceiling.\n// She may read this surface and will not write to it.";
export const SCRATCH_OPEN =
  "// She writes here, runs it, and shows you what it did.\n// No runtime is wired, so nothing executes.";

/* ── Shared ─────────────────────────────────────────────────────────────────────────────────── */

/** `composerPlaceholder` — `mindVals` L10380–L10385. One composer, four prompts. */
export const FACE_PLACEHOLDER: Readonly<Record<string, string>> = {
  chat: "Talk while she works…",
  memory: "Tell her to remember, or to forget…",
  team: "Ask her to delegate something…",
  sandbox: "Ask her to build or find something…",
  code: "Ask her to write something…",
};

/** Every face renders its own honest absence rather than an empty pane. */
export type FaceAbsence = { readonly title: string; readonly body: ReactNode };
