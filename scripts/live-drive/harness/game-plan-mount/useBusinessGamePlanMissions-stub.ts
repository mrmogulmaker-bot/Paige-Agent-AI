/**
 * Render-only provider stub for the canonical Mission-backed Plan in Motion.
 * The real component, cards, drawer, state labels, actions and CSS render unchanged.
 * These fictional records prove state rendering and geometry only, never persistence,
 * tenant authorization, production data, Rail delivery, Mind, or Memory.
 */
import type { BusinessMissionDetail, BusinessMissionSummary, MissionState } from "@/types/businessMission";

const mode = () => new URLSearchParams(window.location.search).get("mode") || "active";
const stateFor = (value: string): MissionState =>
  value === "draft" || value === "proposal" ? "proposed"
  : value === "complete" ? "completed"
  : value === "archived" ? "stopped"
  : value === "paused" || value === "blocked" ? value
  : "active";

function summary(value: string): BusinessMissionSummary & { request_source: "owner_ui" | "paige_chat" } {
  const state = stateFor(value);
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: value === "proposal" ? "Paige proposal: referral follow-through" : "Convert warm referrals",
    state,
    state_reason: state === "blocked" ? "Owner decision on the offer promise is required before outreach." : null,
    next_action: state === "completed" || state === "stopped" ? "Review the recorded outcome." : "Review the three warm introductions and choose the first follow-up.",
    revision: 3,
    created_at: "2026-09-01T12:00:00Z",
    updated_at: "2026-09-06T18:00:00Z",
    deadline_on: "2026-09-30",
    desired_outcome: "Turn three warm introductions into two qualified owner conversations.",
    success_definition: "Two qualified conversations are booked and recorded.",
    brief_version: 2,
    closure_outcome: state === "completed" || state === "stopped" ? "partly_achieved" : null,
    outcome_summary: state === "completed" || state === "stopped" ? "One qualified conversation was booked; two introductions need a revised approach." : null,
    request_source: value === "proposal" ? "paige_chat" : "owner_ui",
  };
}

function play(value: string) {
  const mission = summary(value);
  return {
    ...mission,
    stageLabel:
      mission.state === "proposed" ? (mission.request_source === "paige_chat" ? "Awaiting owner approval" : "Draft")
      : mission.state === "active" ? "Active"
      : mission.state === "blocked" ? "Blocked"
      : mission.state === "paused" ? "Paused"
      : mission.state === "completed" ? "Complete"
      : "Archived",
    horizonLabel: "Sep 30, 2026",
    nextOwner: "Owner",
    blocker: mission.state === "blocked" ? mission.state_reason : null,
  };
}

function detail(value: string): BusinessMissionDetail {
  const mission = summary(value);
  return {
    mission: { ...mission, outcome_unknowns: null, request_source: mission.request_source, request_thread_id: mission.request_source === "paige_chat" ? "33333333-3333-4333-8333-333333333333" : null },
    brief: {
      id: "44444444-4444-4444-8444-444444444444",
      version: 2,
      desired_outcome: mission.desired_outcome,
      deadline_on: mission.deadline_on,
      baseline: "Three warm introductions are open.",
      strategy: "Lead with a short written diagnostic and ask for a focused conversation.",
      constraints: ["No bulk outreach", "No promise of results"],
      success_definition: mission.success_definition,
      owner_authority: "Owner approves positioning and any external send.",
      assumptions: [],
      missing_information: [],
      revision_reason: "Clarified the next owner decision.",
      created_at: "2026-09-06T18:00:00Z",
    },
  };
}

export function useBusinessGamePlanMissions(_workspaceId?: string | null) {
  const value = mode();
  const status = value === "loading" ? "loading" : value === "error" ? "error" : value === "forbidden" ? "forbidden" : "ready";
  const items = status === "ready" && value !== "empty" ? [play(value)] : [];
  return {
    items,
    status,
    errorCode: value === "error" ? "MISSION_LIST_FAILED" : value === "forbidden" ? "MISSION_OWNER_REQUIRED" : null,
    refresh: async () => {},
    getDetail: async () => detail(value),
    mutate: async () => ({ ok: true, verified: true, railRecorded: true, missionId: "22222222-2222-4222-8222-222222222222" }),
  };
}