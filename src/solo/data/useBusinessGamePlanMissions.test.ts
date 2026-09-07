// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));
import { toStrategicPlay } from "./useBusinessGamePlanMissions";
import type { BusinessMissionSummary } from "@/types/businessMission";

const base: BusinessMissionSummary = {
  id: "11111111-1111-4111-8111-111111111111", title: "Protect renewal quality",
  state: "proposed", state_reason: null, next_action: null, revision: 1,
  created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z",
  deadline_on: null, desired_outcome: "Renew the right clients.",
  success_definition: "Signed renewals", brief_version: 1,
  closure_outcome: null, outcome_summary: null,
};

describe("Strategic Play presentation", () => {
  it("distinguishes owner drafts from Paige proposals without inventing progress", () => {
    expect(toStrategicPlay({ ...base, request_source: "owner_ui" }).stageLabel).toBe("Draft");
    expect(toStrategicPlay({ ...base, request_source: "paige_chat" }).stageLabel).toBe("Awaiting owner approval");
  });

  it.each([
    ["active", "Active"], ["blocked", "Blocked"], ["paused", "Paused"],
    ["completed", "Complete"], ["stopped", "Archived"],
  ] as const)("maps %s to %s", (state, label) => {
    expect(toStrategicPlay({ ...base, state }).stageLabel).toBe(label);
  });

  it("shows a blocker only when it directly belongs to a blocked play", () => {
    expect(toStrategicPlay({ ...base, state: "active", state_reason: "old note" }).blocker).toBeNull();
    expect(toStrategicPlay({ ...base, state: "blocked", state_reason: "Owner capacity decision" }).blocker).toBe("Owner capacity decision");
  });
});
