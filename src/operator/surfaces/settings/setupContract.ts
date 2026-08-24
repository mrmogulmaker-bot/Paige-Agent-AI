/**
 * Setup — the account's first surface, and the only one that reaches every book.
 *
 * BUILD-ORDER Layer 3d. Ported from `PAIGE Super Admin Shell v3.dc.html` `setupVals` (L8915–L9086)
 * and its markup (L2085–L2175), over `paige-ia.js` `P.SETUP` (L2264–L2337). Verified with
 * `npm run pack:keys setupVals` before a line was written: 32 keys, 32 rendered, none dead.
 *
 * CD's framing, from the builder's own comment: *"Each step names who can do it — she does
 * anything that is not a credential or a judgment — and where it lands, because a setup step
 * nobody can trace is a form field."* And on the form fields: *"The field a step actually needs,
 * so it finishes here rather than somewhere you have to go find. A step you cannot complete on
 * the surface is a to-do list."*
 *
 * ─── WHAT PORTS, AND WHAT IS A READ ──────────────────────────────────────────────────────────
 *
 * PORTS — the whole catalogue. Every step's name, who can do it, where it lands, why it matters,
 * and the note some steps carry; the per-step fields, picks and drop targets; the group titles.
 * All of it is authored, all of it is coaching-generic (§2 — there is no vertical anywhere in
 * it), and it names this platform's real destinations. It is the same class of thing as
 * `P.CHANNELS`: vocabulary, not illustration.
 *
 * ONE GROUP IS WORTH READING TWICE. "Money" carries §38 in CD's own words — *"three different
 * relationships and only one of them is ours"*, and on the client-payment step, *"We never hold
 * it and never take a cut — by rule, we are never the merchant of record between you and your
 * client."* That is the money boundary as doctrine states it, authored into the surface. It ports
 * verbatim, and nothing here may soften it.
 *
 * DOES NOT PORT — every step's `state`. `P.SETUP` marks twelve steps `done`, and that is an
 * assertion about what THIS operator has finished: shipping it would tell the owner he has
 * completed things he has not (§13). So `state` is a read. With none, every step is unknown, the
 * progress figures are em-dashes, and the bar sits at zero — the same absence pattern every other
 * ported surface uses. The moment a read exists it fills in, with no second edit.
 *
 * THE WRITES ARE INERT UNTIL THERE IS A WRITE SEAM, and visibly so. `setupVals`'s acts say
 * "saved" and "she did it" — claims about persistence. A Save that only set local state while
 * saying "It lands in the Vault" would be the thing §36 calls a control that looks live and does
 * nothing, and §13 calls a hoped-for outcome. So each act renders with CD's exact label and
 * title, `disabled` until a handler is supplied. That is the same rule the spine's detach control
 * already follows.
 */

/** `MARK` — L9009. One tone per state; never a hex (§11). */
export const SETUP_STATE_TONE = {
  done: "var(--pg-positive)",
  needs: "var(--pg-gold-deep)",
  blocked: "var(--pg-negative)",
  skip: "var(--pg-line-strong)",
} as const;

export type SetupState = keyof typeof SETUP_STATE_TONE;

export type SetupStep = {
  readonly id: string;
  readonly name: string;
  /** `PAIGE` when she can do it herself; `You` when it is a credential or a judgment. */
  readonly who: "PAIGE" | "You";
  /** Where the answer lands. A `·` separates destinations and the surface splits on it. */
  readonly lands: string;
  readonly why?: string;
  /** Whose relationship this is — the money steps are three different ones. */
  readonly note?: string;
};

export type SetupGroup = {
  readonly g: string;
  readonly note: string;
  readonly items: readonly SetupStep[];
};

/** `P.SETUP` — `paige-ia.js` L2264–L2337, verbatim but for the dropped `state` (see docblock). */
export const SETUP_GROUPS: readonly SetupGroup[] = [
  {
    g: "Who you are",
    note: "The record everything else hangs off",
    items: [
      { id: "s1", name: "Legal and trading name", who: "You", lands: "Fleet · Vault",
        why: "Every document, invoice and portal carries it." },
      { id: "s2", name: "Entity type and formation state", who: "You", lands: "Vault",
        why: "Decides which filings and tax forms apply." },
      { id: "s3", name: "EIN", who: "You", lands: "Vault · masked",
        why: "Held masked. Revealing it is recorded." },
      { id: "s4", name: "Registered and trading addresses", who: "PAIGE", lands: "Fleet · Vault",
        why: "She can read them off your formation docs once uploaded." },
      { id: "s5", name: "Brand identity — mark, palette, type", who: "You", lands: "Mind · Identity",
        why: "Goes into her Identity region so anything she writes looks like you." },
    ],
  },
  {
    g: "Documents",
    note: "Uploaded once, reachable everywhere",
    items: [
      { id: "s6", name: "Formation documents", who: "You", lands: "Vault",
        why: "She reads addresses, officers and dates from these." },
      { id: "s7", name: "W-9 or equivalent", who: "You", lands: "Vault" },
      { id: "s8", name: "Master service agreement", who: "PAIGE", lands: "Vault · Relationships",
        why: "She drafted it; you signed it." },
      { id: "s9", name: "Insurance certificates", who: "You", lands: "Vault",
        why: "Only if your clients ask for them." },
      { id: "s10", name: "Operating procedures", who: "PAIGE", lands: "Mind · Knowledge",
        why: "Anything you upload here she can follow. This is how she learns how you work." },
    ],
  },
  {
    g: "Who works here",
    note: "People, seats and the vendors behind them",
    items: [
      { id: "s11", name: "Team seats and roles", who: "You", lands: "Settings · Team" },
      { id: "s12", name: "Vendors and suppliers", who: "PAIGE", lands: "Relationships",
        why: "A vendor is a relationship with money flowing the other way." },
      { id: "s13", name: "Sub-agents and what each one owns", who: "PAIGE", lands: "Spine · Team" },
      { id: "s14", name: "Who signs and who approves", who: "You", lands: "Governance",
        why: "Authority is yours to assign — she will not choose it." },
    ],
  },
  {
    /** §38, in CD's own words. Nothing here may be softened. */
    g: "Money",
    note: "Three different relationships — and only one of them is ours",
    items: [
      { id: "s15", name: "What you pay us", who: "You", lands: "Settings · Platform",
        why: "A card on the platform account. Needs the money spine, which is deferred.",
        note: "Ours. This is the only money relationship where we are the merchant." },
      { id: "s16", name: "What your clients pay you", who: "You", lands: "Settings · Integrations",
        why: "Connect your own processor. We never hold it and never take a cut — by rule, we are never the merchant of record between you and your client.",
        note: "Yours. Bring your own — Stripe, Square, PayPal or an invoice you send yourself." },
      { id: "s17", name: "What the marketplace pays you", who: "You", lands: "Marketplace · Publisher",
        why: "Only if you publish. Needs Stripe Connect — without it the marketplace cannot pay a publisher.",
        note: "Third relationship. Platform to publisher, separate from both of the above." },
      { id: "s17a", name: "Plan and what it includes", who: "PAIGE", lands: "Settings · Platform",
        why: "No plan record exists yet." },
    ],
  },
  {
    g: "How she reaches people",
    note: "Every channel she may speak on",
    items: [
      { id: "s18", name: "Email sending domain", who: "You", lands: "Integrations" },
      { id: "s19", name: "Phone number", who: "You", lands: "Integrations",
        why: "Twilio Voice still points at a demo webhook." },
      { id: "s20", name: "Calendar source", who: "You", lands: "Relationships · Calendar",
        why: "Nothing is connected, so no booking type can actually book." },
      { id: "s21", name: "Social accounts", who: "You", lands: "Campaigns · Social",
        why: "LinkedIn, Meta and X have no seam yet." },
      { id: "s22", name: "Quiet hours and protected focus", who: "PAIGE", lands: "Calendar · Automations" },
    ],
  },
  {
    g: "How she works for you",
    note: "The room you give her, and what she watches",
    items: [
      { id: "s23", name: "Trust Compass ceiling", who: "You", lands: "Governance",
        why: "Everything else is clamped by it." },
      { id: "s24", name: "Standing instructions", who: "PAIGE", lands: "Mind · Judgment",
        why: "What you have told her never to do without asking." },
      { id: "s25", name: "First automations", who: "PAIGE", lands: "Automations" },
      { id: "s26", name: "Alert rules", who: "PAIGE", lands: "Alerts" },
    ],
  },
  {
    g: "Where you came from",
    note: "Attribution, so the platform knows its own story",
    items: [
      { id: "s27", name: "How this account arrived", who: "PAIGE", lands: "Campaigns · Analytics",
        why: "Campaign, marketplace listing, referral or direct. Nothing records it yet." },
      { id: "s28", name: "Marketplace publisher profile", who: "You", lands: "Marketplace · Publishers",
        why: "Only needed if you intend to sell here." },
      { id: "s29", name: "What you want measured", who: "PAIGE", lands: "Analytics",
        why: "She will read across the books, but you decide what counts as good." },
    ],
  },
];

/**
 * THREE `why` LINES WERE DROPPED, and saying which is the point of saying anything.
 *
 * `P.SETUP` gives the Trust Compass step *"Currently ask first"*, First automations *"She proposed
 * twelve; eight are running"*, and Alert rules *"Twelve watching, four need you"*. Each states a
 * live figure about THIS account — a rung, a count of running automations, a count of alerts — and
 * none has a read behind it here. Carrying them would put four fabricated numbers on the operator's
 * first surface (§13). The steps keep their names, their owner and where they land; the figures
 * come back as reads at Layer 6, from `usePlatformTrust` and the automations and alert tables that
 * already exist. `Trust Compass ceiling` keeps the half of its line that is a rule rather than a
 * reading — *"Everything else is clamped by it."*
 */

/** `FIELDS` — L8931–L8939. What a step needs, so it can be finished here. */
export const SETUP_FIELDS: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  "Legal and trading name": [
    ["Legal name", "As it appears on your formation documents"],
    ["Trading name", "What clients call you, if different"],
  ],
  EIN: [["EIN", "00-0000000"]],
  "Registered and trading addresses": [
    ["Registered address", "Where the entity is registered"],
    ["Trading address", "Where you actually work"],
  ],
  "Email domain": [["Domain", "yourcompany.com"]],
  "Phone number": [["Number", "+1 000 000 0000"]],
  "Standing instructions": [["Tell her once", "Never quote before legal signs off"]],
};

/** `PICKS` — L8940–L8946. A closed set answers itself. */
export const SETUP_PICKS: Readonly<Record<string, readonly string[]>> = {
  "Entity type": ["LLC", "C-corp", "S-corp", "Partnership", "Sole proprietor"],
  "Trust Compass ceiling": ["Observe", "Draft only", "Ask first", "Act and report", "Autonomous"],
  "Quiet hours": ["None", "18:00–08:00", "20:00–07:00", "Weekends too"],
  "Who signs": ["Only you", "You and one other", "Anyone with a seat"],
  "What you want measured": ["Revenue", "Retention", "Response time", "All three"],
};

/** `DROPS` — L8947–L8954. A step that wants a document says which one. */
export const SETUP_DROPS: Readonly<Record<string, string>> = {
  "Formation documents": "Articles, operating agreement, any amendments",
  "W-9": "The current year",
  "Master service agreement": "The version you actually send",
  "Insurance certificates": "Whatever your clients ask you for",
  "Operating procedures": "Anything you would hand a new hire — she follows it",
  "Brand identity": "Logo, colours, the typeface you use",
};

export const SETUP_STEPS: readonly SetupStep[] = SETUP_GROUPS.flatMap((g) => g.items);

/** `stKicker` — L9046. The group, then whose step it is, in CD's three arms. */
export function setupKicker(group: string, who: SetupStep["who"]): string {
  return `${group} · ${who === "PAIGE" ? "she can do this" : "only you can do this"}`;
}

/** `stWhy` — L9051. The note leads where a step has one; the fallback is CD's. */
export function setupWhy(step: SetupStep): string {
  return (
    (step.note ? `${step.note} ` : "") +
    (step.why ?? "Set this and she can use it everywhere it applies.")
  );
}

/** `stLands` — L9070. `Lands in X · Y` splits into one chip per destination. */
export function setupLands(lands: string): readonly string[] {
  return `Lands in ${lands}`.split("·").map((x) => x.trim());
}

/**
 * `setLine` / `setPct` / `setRailMeta` — L9027, L9042, L9073. Every figure is a count over the
 * step states, so with no state read every one of them is an em-dash in the authored sentence.
 */
export const SETUP_ABSENCE = {
  pct: "—% set up",
  line: "— done · — left · — waiting on something we have not built",
  railMeta: `— / ${SETUP_STEPS.length}`,
  /** `setDoAllLabel` — L9038, the arm CD writes when she has nothing outstanding. */
  doAll: "Nothing left for her",
} as const;

export const SETUP_RAIL_TITLE = "Everything else";
