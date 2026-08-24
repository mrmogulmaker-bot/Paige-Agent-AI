/**
 * The Relationships contract — People, Conversations and Segments, ported as ONE group.
 *
 * BUILD-ORDER Layer 3a. The three share a spine and porting them apart would mean reading it
 * three times and drifting: a THREAD points at a person, a SEGMENT is a saved rule over the
 * People book, and both of them open the record they name. CD draws that seam explicitly —
 * People's Conversations panel opens the console with the thread selected (`go:1`), the thread
 * rail's "Open in People" goes back the other way, and every segment act begins "Open in
 * People". One contract, three surfaces.
 *
 * SOURCES, all in `PAIGE Super Admin Shell v3.dc.html` unless named otherwise:
 *   `peopleVals`  L4854–L5157   markup L616–L736
 *   `convoVals`   L5300–L5525   markup L737–L905
 *   `segVals`     L6393–L6520   markup L296–L385
 *   `paige-ia.js` L638 `P.PERSON_TABS` · L516–L531 `P.CHANNELS` / `P.DM_NETWORKS`
 *
 * ─── STRUCTURE BEFORE DATA, AND CD SAID SO IN WRITING ────────────────────────────────────────
 *
 * `absence-copy.md` authors this slot's absence directly: *"People, Conversations, Segments and
 * Calendar are specified and their contract is fixed. None of the four reads live data yet: the
 * surfaces exist, the joins behind them do not. Nothing here is waiting on a decision — only on
 * the wiring."* That is the finished Layer 3 state for all three, in CD's own words, and it is
 * why every one of them takes its rows as an optional prop that defaults to empty.
 *
 * WHAT IS DELIBERATELY NOT PORTED. `P.PEOPLE`, `P.THREADS` and `P.SEGMENTS` are CD's
 * illustration — records with EINs and billing methods, message bodies, member lists and
 * computed counts. Putting them on an operator's screen would be the fabrication this console
 * was rejected for twice, and §63 additionally forbids using a real account as a stand-in. The
 * pack sanitises its own fixtures ("AUTHORIZED TENANT · 0f3a", "fixture A") which makes the
 * intent unmistakable: they illustrate a shape, they are not data.
 *
 * WHAT IS NOT A FIXTURE AND DOES COME OVER: `PERSON_TABS` (the record's ten faces — vocabulary,
 * the same class as `CAMPAIGN_STATES`), the panel DECKS and FOOTS for the six non-field tabs
 * (authored prose about what each face is and what is missing behind it), the segment/column/
 * chip labels, and every empty-state and foot line. Those are structure.
 *
 * CHANNELS LIVE IN `ComposeOutbound`, NOT HERE (§18). `P.CHANNELS` and `P.DM_NETWORKS` were
 * ported with the composer and are re-exported through it; a second transcription here would be
 * the fork this rule exists to stop.
 */

export type { ComposeChannel, ComposeSnippet } from "@/operator/surfaces/ComposeOutbound";

/* ── People ─────────────────────────────────────────────────────────────────────────────────── */

/** `paige-ia.js` L638 — verbatim, in order. The record's ten faces. */
export const PERSON_TABS = [
  "Identity",
  "Business",
  "Documents",
  "Vault",
  "Portal",
  "Conversations",
  "Deals",
  "Billing",
  "Notes",
  "Activity",
] as const;
export type PersonTab = (typeof PERSON_TABS)[number];

/** The four tabs that read straight off the record; the other six are panels. `peopleVals` L5099. */
export const FIELD_TABS = ["Identity", "Business", "Documents", "Billing"] as const;

/** The segment chips over the book. `peopleVals` L4888. */
export const PEOPLE_SEGMENTS = ["All", "Clients", "Prospects", "People", "Companies"] as const;
export type PeopleSegment = (typeof PEOPLE_SEGMENTS)[number];

/**
 * A field row. `[label, value, masked?]` in the pack; spelled out here because a positional
 * triple is not readable at a call site and this shape crosses a network boundary in Layer 6.
 */
export type PersonField = {
  readonly k: string;
  readonly v: string;
  /** A masked value renders its digits as bullets until revealed, and the reveal is logged. */
  readonly masked?: boolean;
  /** Where the value came from. `peopleVals` L5100 `SOURCES` — a claim about someone carries its provenance. */
  readonly source?: string | null;
  /** Her proposed correction, held for a human word. `peopleVals` L5109 `PROPOSALS`. */
  readonly proposal?: { readonly to: string; readonly why: string } | null;
};

export type PersonRecord = {
  readonly id: string;
  readonly kind: "Person" | "Company";
  readonly name: string;
  readonly sub: string;
  readonly life: string;
  readonly owner: string;
  readonly touch: string;
  readonly portal: string;
  readonly vault: string;
  /** An image on file. Absent → a monogram derived from the record's own name, never a generated face. */
  readonly image?: string | null;
  readonly identity?: readonly PersonField[];
  readonly business?: readonly PersonField[];
  readonly docs?: readonly PersonField[];
  readonly billing?: readonly PersonField[];
};

/**
 * `peopleVals` L4899 — a company reads as a plate, a person as a disc, so the two are
 * distinguishable before you read a word, and a record with no image gets a monogram from its
 * own name. Transcribed exactly, including the `·` split: the pack's names carry a qualifier
 * ahead of the name proper and the monogram is taken from the last part.
 */
export function monogram(name: string): string {
  const parts = String(name)
    .split("·")
    .map((x) => x.trim())
    .filter(Boolean);
  const seg = parts.length > 1 ? parts[parts.length - 1] : parts[0] || "?";
  const w = seg.split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : seg.slice(0, 2)).toUpperCase();
}

/** `peopleVals` L4896 — lifecycle decides the tone, and the record's mark borrows it. */
export function lifecycleTone(life: string): string {
  if (/at risk/.test(life)) return "var(--pg-warning)";
  if (/Prospect/.test(life)) return "var(--pg-violet)";
  if (/Partner/.test(life)) return "var(--pg-faint)";
  if (/Internal/.test(life)) return "var(--pg-faint)";
  return "var(--pg-positive)";
}

/** `peopleVals` L4877 — which records a chip admits. The rule, not a stored list. */
export function inSegment(record: PersonRecord, seg: PeopleSegment): boolean {
  switch (seg) {
    case "All":
      return true;
    case "Clients":
      return /Client/.test(record.life);
    case "Prospects":
      return /Prospect|Partner/.test(record.life);
    case "People":
      return record.kind === "Person";
    case "Companies":
      return record.kind === "Company";
  }
}

/**
 * The six non-field faces. Deck and foot are AUTHORED PROSE about what each face is and what is
 * missing behind it — structure, lifted verbatim from `peopleVals` L5054–L5091. The ROWS in the
 * pack are fixtures (vault items, portal states, named deals) and do not come over; each panel
 * renders its deck, its foot, and whatever rows a read supplies.
 */
export const PERSON_PANELS: Readonly<Record<string, { readonly deck: string; readonly foot: string }>> = {
  Vault: {
    deck:
      "The Vault is shared. We read and write it on their behalf because we manage the relationship — so every touch is attributed to the operator who made it, and they see the same log.",
    foot:
      "Stage 3: the Vault exists as a surface but has no per-item audit attribution yet. Shared access without attribution is the one thing this model cannot ship without.",
  },
  Portal: {
    deck:
      "A smart portal is one where they get their own PAIGE, acting inside their workspace under the autonomy we grant. A static portal shows them records; a smart one does work for them, bounded by the same ceiling that binds ours.",
    foot:
      "Stage 3: portal identity and impersonation exist. The per-tenant autonomy grant that makes a portal smart does not — it needs the Trust Compass extended to a second actor.",
  },
  Conversations: {
    deck:
      "Every thread with this record, across every channel. Opening one moves you to the console with the thread selected.",
    foot: "The thread and the record are one object seen two ways.",
  },
  Deals: {
    deck:
      "What is open on this record. A deal points at the record, so a prospect can carry one before they are ever a tenant.",
    foot:
      "Open ruling: whether a deal points at a tenant, a relationship, or a nullable pair with exactly one set.",
  },
  Notes: {
    deck:
      "What she has learned, kept separately from what we were told. A note is her inference; a field is a fact on the record.",
    foot: "Stage 3: notes have no store. She can hold them in a session and cannot yet keep them.",
  },
  Activity: {
    deck:
      "Everything that happened to this record, including every reveal of a masked field and every act taken on their behalf.",
    foot: "Reads paige_audit_log filtered to this record. Live for scope entry and acts; reveals are Stage 3.",
  },
};

/** A row inside one of the six panels. Supplied by a read; never invented. */
export type PersonPanelRow = {
  readonly name: string;
  readonly detail: string;
  readonly status: string;
  readonly tone?: string;
};

/* ── Conversations ──────────────────────────────────────────────────────────────────────────── */

export type ThreadMessage = {
  readonly dir: "in" | "out";
  readonly when: string;
  readonly body: string;
  /** Who sent it. `convoVals` L5356 — an outbound message names its author, PAIGE or a person. */
  readonly by?: string | null;
  /** A call record renders italic and faint rather than as a message. */
  readonly call?: boolean;
};

export type ThreadRow = {
  readonly id: string;
  readonly who: string;
  readonly channel: string;
  /** Which network a DM arrived on — a property of the thread, the way a phone number is. */
  readonly network?: string | null;
  readonly unread: number;
  readonly when: string;
  readonly preview: string;
  readonly phone?: string;
  readonly email?: string;
  readonly stage?: string;
  readonly owner?: string;
  readonly state?: string;
  readonly msgs?: readonly ThreadMessage[];
  /** Her reply, held. Absent → she is watching rather than holding something. */
  readonly draft?: string | null;
};

/* ── Segments ───────────────────────────────────────────────────────────────────────────────── */

/** `[operator, value]` in the pack — a clause renders as words, never as a filter object. */
export type SegmentClause = readonly [string, string];

export type SegmentRow = {
  readonly id: string;
  readonly name: string;
  readonly clauses: readonly SegmentClause[];
  /** Why the segment exists, in her words. */
  readonly why: string;
  /**
   * How many match, and out of how many. `null` when she CANNOT size it — `segVals` L6438:
   * an unsized segment shows no count rather than a plausible one.
   */
  readonly count: number | null;
  readonly of?: number | null;
  /** Whether the clauses can be resolved against what the platform actually stores. */
  readonly live: boolean;
  /** What is missing when `live` is false — named, so the absence is a reason not a shrug. */
  readonly computed?: string;
  readonly members?: readonly (readonly [string, string])[];
  readonly used?: readonly (readonly [string, string])[];
};

/** `segVals` L6399 — the rule said back as a sentence, which is the form she reasons over. */
export function segmentSentence(clauses: readonly SegmentClause[]): string {
  return clauses.map((c) => `${c[0]} ${c[1]}`).join(", and ");
}

/* ── The slot's absence ─────────────────────────────────────────────────────────────────────── */

/**
 * `absence-copy.md` §Relationships — lifted verbatim, and it is the same object the slot itself
 * carries in `operatorIA.ts`. CD's note on why it reads this way: *"it distinguishes unwired from
 * undecided. An operator seeing an empty slot assumes the work is unresolved; this says the
 * design is settled and the seam is the only gap, so nobody re-opens a closed question."*
 */
export const RELATIONSHIPS_ABSENCE = {
  title: "Drawn, not wired",
  body:
    "People, Conversations, Segments and Calendar are specified and their contract is fixed. " +
    "None of the four reads live data yet: the surfaces exist, the joins behind them do not. " +
    "Nothing here is waiting on a decision — only on the wiring.",
} as const;

/** `peopleVals` L5122 · `segVals` L6519 — the foot each surface closes on. */
export const PEOPLE_FOOT =
  "A record is a person or a company, and a person can point at one. The book is the same object " +
  "the console and the segments read — opening a thread and opening a record reach the same row.";

export const SEGMENTS_FOOT =
  "A segment is a rule, not a saved list — membership is resolved when it is read, so a record " +
  "that stops matching leaves on its own. Counts are computed over the records in the book; " +
  "nothing here is read from a live database.";

export const SEGMENTS_DECK =
  "A segment is a saved view of the book, kept as words she can read back.";
