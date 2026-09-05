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
  tone: "neutral" | "attention" | "positive";
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
};

/**
 * The five KPI tiles.
 *
 * Only ONE of them has a source, and that is the honest answer rather than a disappointing one:
 * a declared handle is a real record this workspace owns and can change. The other four each name
 * one of the five things the panel this replaces explicitly refused to infer — accounts, followers,
 * publishing queue, schedules, placements — and they keep refusing.
 */
export function buildKpis(input: SocialCommandInput): SocialKpi[] {
  return [
    {
      id: "channels",
      label: "Accounts on record",
      glyph: "users",
      figure: {
        state: input.handles.length ? "PARTIAL" : "UNAVAILABLE",
        value: input.handles.length || null,
        note: input.handles.length
          ? "Declared by this workspace. A handle is a record, not a connection."
          : "No account has been recorded for this workspace yet.",
      },
      detail: input.handles.length
        ? `${input.handles.map((h) => h.label).join(" · ")}`
        : "Record the accounts this business posts from so PAIGE can reference them.",
    },
    {
      id: "queue",
      label: "Publishing queue",
      glyph: "clock",
      figure: absent("Nothing in the platform holds a queued post for this workspace."),
      detail: "A queue needs a connected account that can accept a post. None is connected.",
    },
    {
      id: "placements",
      label: "Recorded placements",
      glyph: "spark",
      figure: absent("No supported provider has recorded a placement for this workspace."),
      detail: "Published work appears here once a provider reports where it went live.",
    },
    {
      id: "waiting",
      label: "Waiting on you",
      glyph: "bell",
      figure: {
        state: input.waitingOnYou ? "PARTIAL" : "UNAVAILABLE",
        value: input.waitingOnYou || null,
        note: input.waitingOnYou
          ? "Filed work this workspace's autonomy setting will not run unattended."
          : "Nothing growth-facing is currently held for your decision.",
      },
      detail: "Work PAIGE has prepared and stopped on, from the growth and client desks.",
    },
    {
      id: "captured",
      label: "Captured responses",
      glyph: "doc",
      figure: {
        state: input.capturedSubmissions ? "PARTIAL" : "UNAVAILABLE",
        value: input.capturedSubmissions || null,
        note: input.capturedSubmissions
          ? "Form submissions recorded against this workspace."
          : "No form submission has been recorded for this workspace.",
      },
      // The single most tempting lie on this surface. `growth_form_submissions.source` holds a
      // capture-mechanism label ('paige_form' / 'external:<provider>'), never a marketing channel,
      // so no count here can be attributed to social. Say that rather than implying attribution.
      detail: "Not attributed to a channel — no record ties a response to where it came from.",
    },
  ];
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
      figure: absent("No idea or backlog record exists for this workspace."),
      detail: "Ideas are worked in Vibe Studio and appear here once they become an output.",
      tone: "neutral",
    },
    {
      id: "drafting",
      label: "Drafting",
      figure: absent("Unpublished Vibe Studio work is not reported to this surface."),
      detail: "In-progress drafts stay in Vibe Studio until they are published.",
      tone: "neutral",
    },
    {
      id: "review",
      label: "Held for you",
      figure: {
        state: input.approvalGatedForms ? "PARTIAL" : "UNAVAILABLE",
        value: input.approvalGatedForms || null,
        note: input.approvalGatedForms
          ? "Published forms whose routing is approval-gated."
          : "No published form is currently approval-gated.",
      },
      detail: "Routing that will not dispatch until a person approves it.",
      tone: "attention",
    },
    {
      id: "scheduled",
      label: "Scheduled",
      figure: absent("No schedule is inferred. Nothing records a scheduled post here."),
      detail: "Scheduling needs a connected account. None is connected.",
      tone: "neutral",
    },
    {
      id: "published",
      label: "Published outputs",
      figure: {
        state: input.publishedOutputs ? "PARTIAL" : "UNAVAILABLE",
        value: input.publishedOutputs || null,
        note: input.publishedOutputs
          ? "Published pages, active funnels and active forms in this workspace."
          : "This workspace has no published output yet.",
      },
      // Deliberately NOT called social content. These are pages, funnels and forms; presenting them
      // as posts would be the mislabel that makes an honest number dishonest.
      detail: "Pages, funnels and forms — eligible for placement, not yet placed anywhere.",
      tone: "positive",
    },
    {
      id: "repair",
      label: "Needs repair",
      figure: {
        state: input.formsNeedingRepair ? "PARTIAL" : "UNAVAILABLE",
        value: input.formsNeedingRepair || null,
        note: input.formsNeedingRepair
          ? "Published forms with a recorded failed dispatch."
          : "No form has a recorded failed dispatch.",
      },
      detail: "A recorded delivery outcome that did not succeed.",
      tone: "attention",
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
    reach: absent("No provider is connected, so no audience or performance figure is read."),
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
        "No social account has been recorded for this business, and no output has been published. Recording the accounts you post from is the first thing that makes this surface work — it is what PAIGE references when she drafts for you.",
    };
  }
  return {
    headline: "Here is what is actually on record.",
    body: `${parts.join(", ")}. No account is connected for publishing, so nothing here reports followers, reach, a queue, a schedule, or where anything went live.`,
  };
}
