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
  /** `repo` — L10290. Which binding this file lives in. Absent → scratch, and it says so. */
  readonly repo?: string;
  /** `at` — the branch it sits on inside that repo, when it differs from the repo's default. */
  readonly at?: string;
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

/* ── Code · the full `codeVals` vocabulary (L10256–L10424) ──────────────────────────────────── */

/**
 * BUILD-ORDER Layer 5b. Layer 5 shipped the Code face as a file line plus a scratch pre-block,
 * and the tier matrix named that as the honest remainder: *"the Code face is materially thinner
 * than CD's frame."* This is the rest of it — `codeVals` (L10256–L10424) and its markup block
 * (L4015–L4120), ported whole.
 *
 * TWO PACK KEYS TURN OUT TO BE DEAD, and that is why `SCRATCH_HELD`/`SCRATCH_OPEN` no longer
 * render. `scratchBody` (L10583) and `sandboxActs` (L10589) are computed in `mindVals` and
 * appear at NO render site anywhere in the 11,358-line shell — grepped, both have exactly one
 * hit, their own assignment. Layer 5 drew `scratchBody` on the Code face because it reads like
 * code and sat next to the code keys; the pack draws a tokenized editor there instead. The two
 * constants stay exported (they are CD's words and cost nothing) and are recorded as pack
 * finding #10, but nothing renders them. Reported to CD rather than resolved here (§00).
 *
 * WHAT IS REAL ON THIS FACE, WHICH IS MORE THAN ON ANY OTHER. The scratch buffer is genuine
 * session state: `+` creates a file, the editor edits it, ⌘S saves the buffer, Revert drops it,
 * × closes it. The pack itself scopes that honestly — *"Scratch files live for this session"* —
 * so a session-local buffer is the whole capability, not a stand-in for a persisted one. The
 * ceiling is a real read (`usePlatformTrust`), so the held/open arms, the review act and the
 * foot are all decided by the platform's actual rung.
 *
 * WHAT IS NOT. `P.SANDBOX.files` (three invented files with invented bodies, sizes and
 * timestamps), `P.SANDBOX.reviews` (two invented pull requests) and `P.REPOS` (four repo rows
 * with ceilings). Those are CD's illustration of a connected console. `paige-writes-code.md` §5
 * puts the GitHub provider at `planned` — nothing binds a repo yet — so the repo strip renders
 * its unbound arm and the review block renders not at all, which is the pack's OWN conditional
 * (`sc-if onRepo`), not a stand-in. Both fill in when a binding is read.
 */

/** `LADDER` — L10289, the grant scale the review act is derived from. */
export const CODE_LADDER = [
  "Observe",
  "Draft only",
  "Ask first",
  "Act and report",
  "Autonomous",
] as const;

export type CodeRepo = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** The repo's own ceiling, clamped against the compass before it is shown. */
  readonly ceiling: string;
  readonly branch: string;
  readonly protected?: boolean;
  /** `may` — what she is allowed to do in this repository, in CD's words. */
  readonly may: string;
};

export type CodeReview = {
  readonly repo: string;
  readonly title: string;
  readonly at: string;
  readonly state: string;
  /** The grant it was opened UNDER — a PR is an act, and an act has a ceiling behind it. */
  readonly under: string;
  readonly note: string;
};

export type CodeRun = {
  readonly when: string;
  readonly what: string;
  readonly state: string;
  readonly tone: string;
};

/**
 * `reviewAct` — L10293–L10298, all four arms verbatim. Merge is on none of them, and that is
 * the design rather than an omission: `paige-writes-code.md` §1 — *"auto-merge is
 * unrepresentable here… No level of the compass grants it, so no branch of the UI produces a
 * merge control."*
 */
export function reviewActFor(
  ceilingLabel: string | null,
): { readonly label: string; readonly title: string } | null {
  if (ceilingLabel === null) return null;
  const at = (CODE_LADDER as readonly string[]).indexOf(ceilingLabel);
  if (at < 0) return null;
  if (at >= 3) {
    return { label: "Push", title: "Commits and pushes to her own repository, then tells you" };
  }
  if (at === 2) return { label: "Open a review", title: "She opens it and waits — merging is yours" };
  if (at === 1) {
    return {
      label: "Open a review — yours",
      title: "At Draft only she writes the branch; you open the review",
    };
  }
  return { label: "Held at Observe", title: "She reads this repository and writes nothing to it" };
}

/** `mergeNote` — L10318. The invariant, in words, closing the review block. */
export const CODE_MERGE_NOTE = "No ceiling grants a merge. That act is yours at every level.";

/** The unbound arm of the repo strip — L10302/L10306. */
export const CODE_NO_REPO_NAME = "Not in a repository";
export const CODE_NO_REPO_NOTE = "Scratch only — this file is dropped at session end.";

/** The `noFiles` arm — L10261–L10263. Every file closed is a state, not an error. */
export const CODE_NO_FILES = {
  meta: "No file open",
  note: "Open a scratch file to give her somewhere to write.",
  foot: "Every file was closed. Scratch files live for the session only.",
} as const;

/** `runState` / `outputBody` — L10377–L10383. Three phases, and none of them succeeds. */
export type CodeRunPhase = "idle" | "queued" | "refused";

export const CODE_RUN_STATE: Readonly<Record<CodeRunPhase, string>> = {
  idle: "Never run",
  queued: "Queued…",
  refused: "Refused — no runtime",
};

export const CODE_RUN_OUTPUT: Readonly<Record<CodeRunPhase, string>> = {
  idle: "Nothing has run in this session. Output appears here once a runtime exists.",
  queued: "Requesting a runtime…",
  refused:
    "No runtime is provisioned, so nothing executed. The request resolved, was refused, and the " +
    "refusal is on the record — that is what a run looks like until Stage 3 wires a container.",
};

/**
 * `IA.SANDBOX.limits` — `paige-ia.js` L2717–L2723. Every value is an honest statement of what
 * is not provisioned, which is why the list ports where the file rows do not.
 *
 * ONE FIGURE IS DERIVED RATHER THAN TRANSCRIBED. CD's Repositories row reads `3 bound · merge
 * withheld at every ceiling` — the 3 counts `P.REPOS` fixtures. The clause is CD's and comes
 * over; the count comes from the repos actually read, and an em-dash where none has been.
 */
export function codeLimits(repoCount: number | null): readonly (readonly [string, string])[] {
  return [
    ["Runtime", "not provisioned"],
    ["Memory ceiling", "not provisioned"],
    ["Wall clock", "not provisioned"],
    ["Network egress", "denied by default"],
    ["Filesystem", "scratch only, dropped at session end"],
    [
      "Repositories",
      `${repoCount === null || repoCount === 0 ? "—" : String(repoCount)} bound · merge withheld at every ceiling`,
    ],
  ];
}

/** `codeFoot` — L10420–L10423, both arms. The grant is the clamped one, or an em-dash. */
export function codeFoot(held: boolean, grant: string | null): string {
  if (held) return "Held at the ceiling. She reads this surface and writes nothing to it.";
  return (
    `You can run this yourself; her own grant is ${grant === null ? "—" : grant.toLowerCase()}, ` +
    "so she holds a run for your word. Scratch files live for this session. Representative — no " +
    "execution substrate exists at any tier."
  );
}

/** `newScratch` — L7000–L7006. The seed file, verbatim, including its own note and body. */
export function newScratchFile(n: number): ScratchFile {
  return {
    name: `scratch_${n}.py`,
    lang: "Python",
    size: "0 B",
    when: "now",
    summary: "Empty — ask her to write into it, or edit it yourself",
    body: "# Empty scratch file.\n# Ask her in the composer, or press Edit.",
  };
}

/** The pack's `announcement` strings for this face — L7000–L7020, L10334, L10404–L10417. */
export const CODE_SAID = {
  created: "Scratch file created. It lives for this session only.",
  saved: "Buffer saved for this session. Nothing is persisted — Stage 3 owns the write.",
  reverted: "Buffer dropped. The file is unchanged.",
  runHeld: "Held at the ceiling. She may read this file and will not run it.",
  refused: "Refused — no runtime is provisioned. The refusal is on the record.",
  editHeld: "Held at the ceiling. She reads this file and writes nothing.",
  askHer: "Ask her in the composer. She writes the code and holds the run for your word.",
  closed: (name: string) => `${name} closed.`,
} as const;

/**
 * `Component.KW` — L6972–L6976, and `tokenize` — L6977–L6998. CD's own comment bounds the
 * ambition: *"Three token classes, which is as far as a design surface should go: what is a
 * comment, what is a literal, what is a keyword. Anything richer belongs to a real editor."*
 *
 * Pure, and therefore directly testable — which matters here because a tokenizer that throws
 * blanks the whole face, and a jsdom render would not tell us apart from one that rendered.
 */
const CODE_KW: Readonly<Record<string, RegExp>> = {
  Python:
    /^(def|return|if|not|in|for|import|from|class|else|elif|None|True|False|and|or|while|try|except|with|as|lambda|yield)$/,
  SQL: /^(select|from|join|on|where|and|or|order|by|desc|asc|as|group|having|limit|insert|update|set|null|not)$/i,
  Markdown: /^$/,
};

export type CodeToken = { readonly t: string; readonly c: "cm" | "st" | "kw" | "" };

export function tokenizeCode(line: string, lang: string): readonly CodeToken[] {
  const cm = lang === "Python" ? "#" : lang === "SQL" ? "--" : null;
  const out: CodeToken[] = [];
  let rest = line;
  if (cm) {
    const at = rest.indexOf(cm);
    // A marker inside a string is not a comment; good enough for a read view (CD's own note).
    const q = rest.indexOf('"');
    const q2 = rest.indexOf("'");
    const firstQ = Math.min(q < 0 ? 1e9 : q, q2 < 0 ? 1e9 : q2);
    if (at >= 0 && at < firstQ) {
      out.push({ t: rest.slice(at), c: "cm" });
      rest = rest.slice(0, at);
    }
  }
  const kw = CODE_KW[lang] ?? CODE_KW.Markdown;
  const head: CodeToken[] = [];
  for (const p of rest.split(/("[^"]*"|'[^']*'|\b)/)) {
    if (!p) continue;
    if (/^["'].*["']$/.test(p)) head.push({ t: p, c: "st" });
    else if (p.trim() && kw.test(p.trim())) head.push({ t: p, c: "kw" });
    else head.push({ t: p, c: "" });
  }
  return head.concat(out);
}

/** `TOK` — L10283. Three classes, three tokens; never a hex (§11). */
export const CODE_TOKEN_TONE: Readonly<Record<CodeToken["c"], string>> = {
  cm: "var(--pg-faint)",
  st: "var(--pg-positive)",
  kw: "var(--pg-gold-deep)",
  "": "var(--pg-ink-2)",
};
