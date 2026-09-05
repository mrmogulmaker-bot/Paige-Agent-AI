/**
 * social-truth — the projection layer behind Campaigns › Social.
 *
 * Named for `marketplace-truth.ts`, the repo's existing model-beside-a-surface pair, and named
 * DISTINCTLY from `social-command.tsx` on purpose: a model at `social-command.ts` beside a surface
 * at `social-command.tsx` makes `import ... from "./social-command"` resolve to the model, which is
 * exactly the undefined-component failure that caught this.
 *
 * WHY IT IS A SEPARATE, PURE MODULE. The surface it feeds is a dashboard: a hero brief, five KPI
 * tiles, mission rows, an intelligence feed, a six-stage pipeline and per-channel cards. That is
 * precisely the shape that has cost this repo the most — `src/solo/compass.tsx:8-38` records ten
 * invented departments, a hardcoded confidence percent and a fabricated week-over-week trend being
 * torn out of exactly this kind of layout. So every figure this surface can show is decided HERE,
 * in functions a test can call without a browser, and each one carries the state that says whether
 * a real tenant-scoped record produced it.
 *
 * THE RULE THIS FILE ENFORCES: a module with no source renders its absence, never a plausible
 * number. `null` is the value; the note says why. There is no default, no placeholder, no seed.
 *
 * §38 CAPTURE-ONLY. Declared handles are what the business SAYS its accounts are. They are not a
 * connection, and nothing here may present them as one — no follower count, no reach, no schedule,
 * no placement is derivable from a handle, and each of those absences is stated rather than filled.
 */

/** The four labels the Campaigns surface already speaks (`growth2.tsx` TruthTag). */
export type SocialTruthState = "LIVE" | "PARTIAL" | "PROPOSED" | "UNAVAILABLE";

/**
 * A displayable figure and the honest account of where it came from.
 * `value === null` means no tenant-scoped record produced it, and `note` says so in the owner's
 * language rather than a schema's.
 */
export type SocialValue<T> = { state: SocialTruthState; value: T | null; note: string };

/**
 * The absence of a figure.
 *
 * Typed `SocialValue<number>` rather than `SocialValue<never>` deliberately: this project runs with
 * `strictNullChecks` off, so `never | null` collapses to `never` and the honest `value: null` stops
 * type-checking. Every figure on this surface is a count, so the concrete type is also the true one.
 */
const absent = (note: string): SocialValue<number> => ({ state: "UNAVAILABLE", value: null, note });

/**
 * The networks this workspace can record.
 *
 * The set is the UNION of the two places the platform already names networks in tenant-visible
 * text: the Systems Check registry question (`supabase/migrations/20260816000000_systems_check_layer1.sql:255`
 * — Instagram, Facebook, LinkedIn, TikTok, X) and the channels the Social surface shows (which adds
 * YouTube). Keeping them a union rather than picking one avoids a surface and a check disagreeing
 * about which networks exist. The same list is the allow-list in `record_social_handles`; widening
 * one without the other lets a handle be typed here and refused by the server.
 */
export const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", hint: "@yourbusiness" },
  { key: "facebook", label: "Facebook", hint: "facebook.com/yourbusiness" },
  { key: "linkedin", label: "LinkedIn", hint: "linkedin.com/company/yourbusiness" },
  { key: "youtube", label: "YouTube", hint: "@yourbusiness" },
  { key: "tiktok", label: "TikTok", hint: "@yourbusiness" },
  { key: "x", label: "X", hint: "@yourbusiness" },
] as const;

export type SocialNetworkKey = (typeof SOCIAL_NETWORKS)[number]["key"];

export type SocialHandle = { network: SocialNetworkKey; label: string; handle: string };

const NETWORK_LABEL: Record<string, string> = Object.fromEntries(
  SOCIAL_NETWORKS.map((n) => [n.key, n.label]),
);

/**
 * Read declared handles off `tenants.features`.
 *
 * THE SHAPE IS LOAD-BEARING, NOT STYLISTIC. `social_handles_captured.ts:21-23` counts an object's
 * values with `hasText`, which is true only of a non-empty STRING. A nested value — the natural
 * rich shape `{instagram:{handle,url}}` — counts as zero there, so a surface that stored it would
 * show handles on record while the Systems Check reported none, on the very check this surface
 * exists to make completable. So: flat object of strings. The array forms are accepted on read
 * only because the runner accepts them and a row written before this surface existed may use one.
 */
export function readSocialHandles(features: unknown): SocialHandle[] {
  const raw = (features as Record<string, unknown> | null | undefined)?.social_handles;
  if (!raw) return [];
  const out: SocialHandle[] = [];
  const push = (network: string, handle: unknown) => {
    if (typeof handle !== "string" || !handle.trim()) return;
    const key = network.trim().toLowerCase();
    if (!NETWORK_LABEL[key]) return;
    if (out.some((entry) => entry.network === key)) return;
    out.push({ network: key as SocialNetworkKey, label: NETWORK_LABEL[key], handle: handle.trim() });
  };
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === "string") continue; // a bare handle names no network; it cannot be placed
      if (entry && typeof entry === "object") {
        const row = entry as { network?: unknown; handle?: unknown };
        if (typeof row.network === "string") push(row.network, row.handle);
      }
    }
  } else if (typeof raw === "object") {
    for (const [network, handle] of Object.entries(raw as Record<string, unknown>)) push(network, handle);
  }
  return out.sort(
    (a, b) =>
      SOCIAL_NETWORKS.findIndex((n) => n.key === a.network) -
      SOCIAL_NETWORKS.findIndex((n) => n.key === b.network),
  );
}

/** What the form sends. Empty strings are dropped rather than stored — see `toHandlePayload`. */
export function toHandlePayload(draft: Record<string, string>): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const network of SOCIAL_NETWORKS) {
    const value = (draft[network.key] ?? "").trim();
    // A cleared field is an OMISSION, not a stored blank. `hasText` ignores "" anyway, so a stored
    // empty string would be a key the check cannot count and a person can still see — the two must
    // never disagree about how many accounts are on record.
    if (value) payload[network.key] = value;
  }
  return payload;
}

/* ─────────────────────────── the modules ─────────────────────────── */

export type SocialKpi = {
  id: string;
  label: string;
  glyph: string;
  figure: SocialValue<number>;
  /** What the figure counts, or — when there is none — what would have to exist for there to be one. */
  detail: string;
};

export type SocialPipelineStage = {
  id: string;
  label: string;
  figure: SocialValue<number>;
  detail: string;
  /** Which accent the stage carries. Semantic, never decorative. */
  tone: "neutral" | "attention" | "positive" | "failing";
};

export type SocialChannelCard = {
  network: string;
  label: string;
  handle: string;
  reach: SocialValue<number>;
  detail: string;
};

export type SocialInsight = {
  id: string;
  title: string;
  summary: string | null;
  /** The desk that filed it, in the platform's own words. */
  department: string;
  createdAt: string;
  rationale: string | null;
};

export type SocialGovernanceRow = { label: string; lane: "auto" | "confirm" | "off"; copy: string };

export const LANE_COPY: Record<"auto" | "confirm" | "off", string> = {
  auto: "Runs automatically",
  confirm: "Drafts for you",
  off: "Always your call",
};

/** Inputs the surface has actually read. Every field is a real tenant-scoped read or an absence. */
export type SocialCommandInput = {
  handles: SocialHandle[];
  /** Published pages + active funnels + active forms, from `useSoloCampaigns`. */
  publishedOutputs: number;
  /** Forms whose routing is approval-gated — work genuinely held for a person. */
  approvalGatedForms: number;
  /** Forms carrying a recorded failed dispatch. */
  formsNeedingRepair: number;
  /** Rows in `growth_form_submissions` for this workspace. */
  capturedSubmissions: number;
  /** Filed actions in `confirm` that name a growth-facing desk. */
  waitingOnYou: number;
  /**
   * The read that produces `waitingOnYou` FAILED.
   *
   * Without this the tile cannot tell "nothing is waiting" from "I could not look", because both
   * arrive as a count of zero — and it asserted the first. The PAIGE sees panel beside it has always
   * drawn that distinction (`useSoloPendingActions` returns `error` precisely so a failed read is
   * not read as an empty one); the tile did not, so the same surface said two different things about
   * the same read. A failed read is not an empty result (§13).
   */
  waitingUnknown?: boolean;
};

/**
 * The five KPI tiles.
 *
 * Only ONE of them has a source, and that is the honest answer rather than a disappointing one:
 * a declared handle is a real record this workspace owns and can change. The other four each name
 * one of the five things the panel this replaces explicitly refused to infer — accounts, followers,
 * publishing queue, schedules, placements — and they keep refusing.
 */
/**
 * The order the five tiles are READ in, which is not the order they are defined in.
 *
 * A command surface leads with what can be acted on. The first three tiles can each carry a real
 * figure; the last two are structural absences and sit together so they read as one row of things
 * not yet possible rather than as two failures scattered through the strip. Nothing is hidden
 * (§58) and nothing about any tile's state, value or note changes — this is the reading order only.
 */
const KPI_ORDER = ["waiting", "channels", "captured", "queue", "placements"] as const;

export function buildKpis(input: SocialCommandInput): SocialKpi[] {
  const tiles: SocialKpi[] = [
    {
      id: "channels",
      label: "Accounts on record",
      glyph: "users",
      figure: {
        state: input.handles.length ? "PARTIAL" : "UNAVAILABLE",
        value: input.handles.length || null,
        note: input.handles.length
          ? "You told PAIGE these are yours. That is a record, not a connection."
          : "You have not told PAIGE which accounts are yours yet.",
      },
      detail: input.handles.length
        ? `${input.handles.map((h) => h.label).join(" · ")}`
        : "Name the accounts you post from — PAIGE works from them every time she drafts for you.",
    },
    {
      id: "queue",
      label: "Publishing queue",
      glyph: "clock",
      figure: absent("No account is connected to publish through, so nothing can be queued for you."),
      detail: "Connecting an account is what turns this on. No social account can be connected yet.",
    },
    {
      id: "placements",
      label: "Recorded placements",
      glyph: "spark",
      figure: absent("No supported provider has told PAIGE where any of your work went live."),
      detail: "A connection is what turns this on. No social account can be connected yet.",
    },
    {
      id: "waiting",
      label: "Waiting on you",
      glyph: "bell",
      figure: {
        state: input.waitingOnYou ? "PARTIAL" : "UNAVAILABLE",
        value: input.waitingUnknown ? null : input.waitingOnYou || null,
        note: input.waitingUnknown
          ? "This could not be read, so nothing is claimed either way."
          : input.waitingOnYou
            ? "PAIGE prepared it and stopped. The default for these desks is to draft, not to send."
            : "Nothing is waiting on your decision right now.",
      },
      detail: "Drafts PAIGE has ready for your call, from marketing, sales, client and owner work.",
    },
    {
      id: "captured",
      label: "Captured responses",
      glyph: "doc",
      figure: {
        state: input.capturedSubmissions ? "PARTIAL" : "UNAVAILABLE",
        value: input.capturedSubmissions || null,
        note: input.capturedSubmissions
          ? "Responses recorded on your forms."
          : "No form of yours has a recorded response yet.",
      },
      // The single most tempting lie on this surface. `growth_form_submissions.source` holds a
      // capture-mechanism label ('paige_form' / 'external:<provider>'), never a marketing channel,
      // so no count here can be attributed to social. Say that rather than implying attribution.
      detail: "Nothing records where a response came from, so none of these is credited to social.",
    },
  ];
  return KPI_ORDER.map((id) => tiles.find((tile) => tile.id === id)!);
}

/**
 * The six pipeline stages.
 *
 * Two of them are real, and they are the two this workspace's own records can answer: work held
 * for approval, and work already published. The other four name a store the platform does not have,
 * and the stage says which one rather than showing a zero that reads like an empty inbox.
 */
export function buildPipeline(input: SocialCommandInput): SocialPipelineStage[] {
  return [
    {
      id: "ideas",
      label: "Ideas",
      figure: absent("Nothing here holds an idea list for you."),
      detail: "Work an idea up in Vibe Studio and it lands here the moment you publish it.",
      tone: "neutral",
    },
    {
      id: "drafting",
      label: "Drafting",
      figure: absent("Vibe Studio does not tell this page what you have in progress."),
      detail: "Your drafts stay in Vibe Studio until you publish them, then they show up here.",
      tone: "neutral",
    },
    {
      id: "review",
      label: "Held for you",
      figure: {
        state: input.approvalGatedForms ? "PARTIAL" : "UNAVAILABLE",
        value: input.approvalGatedForms || null,
        note: input.approvalGatedForms
          ? "Published forms set to wait for a person before anything is sent."
          : "No form of yours is waiting on an approval.",
      },
      detail: "Nothing goes out from these until you approve it.",
      tone: "attention",
    },
    {
      id: "scheduled",
      label: "Scheduled",
      figure: absent("No schedule is inferred. Nothing here holds a scheduled post for you."),
      detail: "Connect an account and PAIGE can hold a post for a date. None can be connected yet.",
      tone: "neutral",
    },
    {
      id: "published",
      label: "Published outputs",
      figure: {
        state: input.publishedOutputs ? "PARTIAL" : "UNAVAILABLE",
        value: input.publishedOutputs || null,
        note: input.publishedOutputs
          ? "Your published pages, active funnels and active forms."
          : "You have not published anything yet.",
      },
      // Deliberately NOT called social content. These are pages, funnels and forms; presenting them
      // as posts would be the mislabel that makes an honest number dishonest.
      detail: "Your pages, funnels and forms — ready to be placed, not yet placed anywhere.",
      tone: "positive",
    },
    {
      id: "repair",
      label: "Needs repair",
      figure: {
        state: input.formsNeedingRepair ? "PARTIAL" : "UNAVAILABLE",
        value: input.formsNeedingRepair || null,
        note: input.formsNeedingRepair
          ? "Your published forms with a delivery that did not succeed."
          : "Every recorded delivery of yours succeeded.",
      },
      detail: "A response was captured and could not be delivered where you routed it.",
      tone: "failing",
    },
  ];
}

/**
 * One card per declared account.
 *
 * A handle proves the account exists and is this business's. It proves nothing about audience or
 * performance, so `reach` is absent on every card, always — there is no branch in which a declared
 * handle produces a number. That is the point: the card is a record, drawn as a record.
 */
export function buildChannels(handles: SocialHandle[]): SocialChannelCard[] {
  return handles.map((handle) => ({
    network: handle.network,
    label: handle.label,
    handle: handle.handle,
    reach: absent("No provider is connected to this account, so no audience or performance number reaches you."),
    detail: "On record",
  }));
}

/** The desks whose filed work belongs on a growth surface. Slugs are the seeded §16 department set. */
const GROWTH_DESKS = new Set(["marketing", "sales", "client_experience", "owner_ops"]);

export function isGrowthDesk(department: string): boolean {
  return GROWTH_DESKS.has(department.trim().toLowerCase().replace(/\s+/g, "_"));
}

/**
 * The executive brief line.
 *
 * Composed only from figures already proven above. It never characterises momentum, engagement or
 * opportunity, because nothing measures any of those for this workspace — the line states what is
 * on record and what is not, in that order, and stops.
 */
export function buildBrief(input: SocialCommandInput): { headline: string; body: string } {
  const parts: string[] = [];
  if (input.handles.length) {
    parts.push(
      `${input.handles.length} account${input.handles.length === 1 ? "" : "s"} on record (${input.handles
        .map((h) => h.label)
        .join(", ")})`,
    );
  }
  if (input.publishedOutputs) {
    parts.push(`${input.publishedOutputs} published output${input.publishedOutputs === 1 ? "" : "s"}`);
  }
  if (input.waitingOnYou) {
    parts.push(`${input.waitingOnYou} item${input.waitingOnYou === 1 ? "" : "s"} waiting on your decision`);
  }

  if (!parts.length) {
    return {
      headline: "Nothing is on record yet.",
      body:
        "PAIGE does not know which accounts are yours, and you have not published anything for her to work with. Name the accounts you post from and she has something to draft against — that is the whole of what this page needs from you today.",
    };
  }
  return {
    headline: "PAIGE is working from what you have given her.",
    body: `${parts.join(", ")}. No account is connected for publishing, so nothing here reports followers, reach, a queue, a schedule, or where anything went live.`,
  };
}

/* ─────────────────────────── the next move ─────────────────────────── */

/**
 * The one thing to do next, and the control that does it.
 *
 * WHY THIS EXISTS. The surface could already answer what is happening, what is working, what needs
 * attention, what PAIGE is holding, and what it has produced. It could not answer the sixth
 * question a person actually opens it for — *what should I do?* — and a page that reports five
 * answers and withholds the sixth is a status console however honest the five are.
 *
 * IT INVENTS NOTHING. Every branch is keyed on a field already on `SocialCommandInput`, and every
 * destination is a control that already exists. There is no scoring, no confidence, no ranking
 * model — just a fixed precedence over facts, so the same inputs always yield the same move and a
 * reader can check it by hand. The ladder is TOTAL: the last branch has no condition.
 *
 * IT IS DELIBERATELY NOT EXHAUSTIVE. `capturedSubmissions` drives no branch, because any move
 * derived from it would be an attribution claim — and this file already records why that is the
 * single most tempting lie available here (see the `captured` tile). A ladder that declines the
 * move it cannot justify is the point.
 */
export type SocialNextAction =
  | { kind: "record"; label: string }
  | { kind: "studio"; label: string }
  | { kind: "compass"; label: string }
  | { kind: "pipeline"; label: string }
  | { kind: "paige"; label: string };

export type SocialNextMove = {
  /** Why this is the move, in one line. */
  headline: string;
  /** What doing it changes. */
  detail: string;
  action: SocialNextAction;
};

export function buildNextMove(input: SocialCommandInput): SocialNextMove {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // 1. A response was captured and did not reach you. Everything else can wait behind that.
  if (input.formsNeedingRepair > 0) {
    return {
      headline: `${plural(input.formsNeedingRepair, "form is", "forms are")} not delivering.`,
      detail:
        "A response came in and could not be delivered where you routed it. The recorded outcomes are under Pipeline, with the form that produced them.",
      action: { kind: "pipeline", label: "Open Pipeline" },
    };
  }

  // 2. Work she has finished and is not permitted to send on her own. It is yours to release.
  if (input.waitingOnYou > 0 && !input.waitingUnknown) {
    return {
      headline: `PAIGE is holding ${plural(input.waitingOnYou, "draft", "drafts")} for your call.`,
      detail:
        "She has prepared them and stopped, because the default for these desks is to draft rather than send. Trust Compass is where you clear them.",
      action: { kind: "compass", label: "Open Trust Compass" },
    };
  }

  // 3. First use. She cannot reference an account she has never been told about, and this is the
  //    one thing on this page a person can finish today.
  if (input.handles.length === 0) {
    return {
      headline: "PAIGE does not know which accounts are yours.",
      detail:
        "Name the accounts you post from and she works from them every time she drafts. It is also what the social accounts item on your Systems Check is asking for.",
      action: { kind: "record", label: "Record accounts" },
    };
  }

  // 4. She knows where you post and has nothing of yours to put there.
  if (input.publishedOutputs === 0) {
    return {
      headline: "There is nothing published to put in front of anyone.",
      detail:
        "Build a page, funnel or form in Vibe Studio. It appears here under Published outputs the moment you publish it.",
      action: { kind: "studio", label: "Open Vibe Studio" },
    };
  }

  // 5. Nothing is broken and nothing is waiting. The honest move is the conversation, because the
  //    surface itself has no further act to offer until a provider connection exists.
  return {
    headline: "Nothing is waiting on you here.",
    detail:
      "Your accounts are on record and your published work is up to date. Ask PAIGE what to make next — she drafts against the accounts you have named.",
    action: { kind: "paige", label: "Ask PAIGE" },
  };
}
