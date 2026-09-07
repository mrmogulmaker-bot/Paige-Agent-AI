import { supabase } from "@/integrations/supabase/client";

export type InterviewFocusPath = "business_foundation" | "strategy" | "offers_clients" | "operations";
export type InterviewStatus = "active" | "paused" | "recap" | "completed" | "skipped" | "ended";

export type InterviewFact = {
  id: string;
  canonicalOwner: "settings.setup.business_brief";
  fieldKey: string;
  label: string;
  value: string;
  provenance: "owner_statement";
  state: "proposed" | "confirmed" | "declined";
};

export type InterviewSession = {
  id: string;
  threadId: string;
  entrySource: "first_use" | "paige_brief";
  focusPath: InterviewFocusPath;
  status: InterviewStatus;
  stepKey: string | null;
  revision: number;
  proposedFacts: InterviewFact[];
  updatedAt: string;
};

export type InterviewState = {
  eligibleForFirstUse: boolean;
  session: InterviewSession | null;
};

export type DiscussionNeeded = {
  id: string;
  title: string;
  reason: string;
  decision: string;
  sourceRevision: number;
  surface: "business_game_plan";
};

const db = supabase as unknown as {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message || "The request could not be verified.");
  return data as T;
}

export const paigeIntentfulInterview = {
  get: (threadId: string | null = null) =>
    rpc<InterviewState>("get_paige_intentful_interview", { p_thread_id: threadId }),
  start: (threadId: string, entrySource: "first_use" | "paige_brief", focusPath: InterviewFocusPath) =>
    rpc<{ id: string; threadId: string; status: InterviewStatus; revision: number }>("start_paige_intentful_interview", {
      p_thread_id: threadId,
      p_entry_source: entrySource,
      p_focus_path: focusPath,
    }),
  update: (session: InterviewSession, event: "answer" | "pause" | "resume" | "recap" | "skip" | "end", stepKey: string | null, fact?: {
    id: string;
    fieldKey: string;
    label: string;
    value: string;
  }) =>
    rpc<InterviewSession>("update_paige_intentful_interview", {
      p_session_id: session.id,
      p_expected_revision: session.revision,
      p_event: event,
      p_step_key: stepKey,
      p_fact: fact ?? null,
    }),
  confirm: (session: InterviewSession, selectedIds: string[]) =>
    rpc<{ ok: true; verified: true; status: "completed"; revision: number; canonicalOwner: string; selectedIds: string[]; receipt: Record<string, unknown> }>(
      "confirm_paige_intentful_interview_facts",
      { p_session_id: session.id, p_expected_revision: session.revision, p_selected_ids: selectedIds },
    ),
};

export const paigeDiscussionNeeded = {
  get: (missionId: string) => rpc<DiscussionNeeded | null>("get_business_mission_discussion", { p_mission_id: missionId }),
  respond: (actionId: string, response: "talk_now" | "later" | "dont_ask_again") =>
    rpc<{ ok: true; actionId: string; response: string; sourceId: string }>("respond_to_business_mission_discussion", {
      p_action_id: actionId,
      p_response: response,
    }),
};
