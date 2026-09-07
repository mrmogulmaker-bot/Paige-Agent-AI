import type {
  DiscussionNeeded,
  InterviewFocusPath,
  InterviewSession,
  InterviewState,
} from "@/solo/data/paigeIntentfulInterview";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") ?? "offer";
const threadId = "33333333-3333-4333-8333-333333333333";
let revision = 3;

const facts = [
  {
    id: "strategy:annualDirection",
    canonicalOwner: "settings.setup.business_brief" as const,
    fieldKey: "annualDirection",
    label: "Annual direction",
    value: "Build a calmer, referral-led advisory business.",
    provenance: "owner_statement" as const,
    state: "proposed" as const,
  },
  {
    id: "strategy:goals90Day",
    canonicalOwner: "settings.setup.business_brief" as const,
    fieldKey: "goals90Day",
    label: "90-day goals",
    value: "Book six qualified owner conversations.",
    provenance: "owner_statement" as const,
    state: "proposed" as const,
  },
  {
    id: "strategy:successDefinition",
    canonicalOwner: "settings.setup.business_brief" as const,
    fieldKey: "successDefinition",
    label: "Success definition",
    value: "Three right-fit clients choose a paid diagnostic.",
    provenance: "owner_statement" as const,
    state: "proposed" as const,
  },
];

function session(status: InterviewSession["status"], stepKey: string | null): InterviewSession {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    threadId,
    entrySource: "paige_brief",
    focusPath: "strategy",
    status,
    stepKey,
    revision,
    proposedFacts: status === "active" && stepKey === "question_0" ? [] : facts,
    updatedAt: "2026-09-07T12:00:00Z",
  };
}

function initial(): InterviewState {
  if (mode === "offer") return { eligibleForFirstUse: true, session: null };
  if (mode === "paused") return { eligibleForFirstUse: false, session: session("paused", "question_1") };
  if (mode === "recap") return { eligibleForFirstUse: false, session: session("recap", "recap") };
  if (mode === "completed") return { eligibleForFirstUse: false, session: session("completed", "recap") };
  return { eligibleForFirstUse: false, session: session("active", "question_0") };
}

let state = initial();

export const paigeIntentfulInterview = {
  get: async () => state,
  start: async (_threadId: string, _entrySource: "first_use" | "paige_brief", focusPath: InterviewFocusPath) => {
    revision += 1;
    state = { eligibleForFirstUse: false, session: { ...session("active", "question_0"), focusPath, revision } };
    return { id: state.session!.id, threadId, status: state.session!.status, revision };
  },
  update: async (
    current: InterviewSession,
    event: "answer" | "pause" | "resume" | "recap" | "skip" | "end",
    stepKey: string | null,
  ) => {
    revision += 1;
    const nextStatus =
      event === "pause" ? "paused"
      : event === "resume" ? "active"
      : event === "recap" ? "recap"
      : event === "skip" ? "skipped"
      : event === "end" ? "ended"
      : current.status;
    const next = { ...current, status: nextStatus, stepKey, revision, proposedFacts: event === "answer" ? facts : current.proposedFacts };
    state = { eligibleForFirstUse: false, session: next };
    return next;
  },
  confirm: async (_current: InterviewSession, selectedIds: string[]) => ({
    ok: true as const,
    verified: true as const,
    status: "completed" as const,
    revision: ++revision,
    canonicalOwner: "settings.setup.business_brief",
    selectedIds,
    receipt: {
      action: "solo_setup.owner_saved",
      canonicalOwner: "Paige Brief",
      selectedCount: selectedIds.length,
      verifiedAt: "2026-09-07T12:04:00Z",
      railRecorded: true,
    },
  }),
};

const discussion: DiscussionNeeded = {
  id: "55555555-5555-4555-8555-555555555555",
  title: "Decision needed for Convert warm referrals",
  reason: "Missing information is preventing a complete strategic plan.",
  decision: "Which offer promise should this play lead with?",
  sourceRevision: 3,
  surface: "business_game_plan",
};

export const paigeDiscussionNeeded = {
  get: async () => discussion,
  respond: async (_actionId: string, response: "talk_now" | "later" | "dont_ask_again") => ({
    ok: true as const,
    actionId: discussion.id,
    response,
    sourceId: "22222222-2222-4222-8222-222222222222",
  }),
};
