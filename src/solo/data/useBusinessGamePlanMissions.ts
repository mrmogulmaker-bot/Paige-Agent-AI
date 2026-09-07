import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BusinessMissionDetail, BusinessMissionSummary } from "@/types/businessMission";

export type StrategicPlayStage = "Draft" | "Awaiting owner approval" | "Active" | "Blocked" | "Paused" | "Complete" | "Archived";
export type StrategicPlay = BusinessMissionSummary & {
  stageLabel: StrategicPlayStage;
  horizonLabel: string;
  nextOwner: string;
  blocker: string | null;
};

export type MissionActionResult = {
  ok: boolean;
  verified: boolean;
  railRecorded: boolean;
  code?: string;
  missionId?: string;
};

type MissionRpcResponse = { data: unknown; error: { message?: string } | null };
const missionRpc = (name: string, args: Record<string, unknown>): PromiseLike<MissionRpcResponse> =>
  (supabase.rpc as unknown as (
    rpcName: string,
    rpcArgs: Record<string, unknown>,
  ) => PromiseLike<MissionRpcResponse>)(name, args);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function codeFrom(error: unknown, fallback: string): string {
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  for (const code of [
    "MISSION_OWNER_REQUIRED", "MISSION_UNAUTHENTICATED", "ACTIVE_ACCOUNT_CHANGED",
    "MISSION_NOT_FOUND", "MISSION_REVISION_CONFLICT", "MISSION_INVALID_TRANSITION",
    "MISSION_OUTCOME_REQUIRED", "MISSION_BAD_OUTCOME", "MISSION_CLOSED",
  ]) if (message.includes(code)) return code;
  return fallback;
}

export function toStrategicPlay(mission: BusinessMissionSummary & { request_source?: "owner_ui" | "paige_chat" }): StrategicPlay {
  const stageLabel: StrategicPlayStage =
    mission.state === "proposed"
      ? mission.request_source === "paige_chat" ? "Awaiting owner approval" : "Draft"
      : mission.state === "active" ? "Active"
      : mission.state === "blocked" ? "Blocked"
      : mission.state === "paused" ? "Paused"
      : mission.state === "completed" ? "Complete"
      : "Archived";
  return {
    ...mission,
    stageLabel,
    horizonLabel: mission.deadline_on
      ? new Date(mission.deadline_on + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      : "Open horizon",
    // The shipped Mission contract is owner-only. This describes record authority,
    // not who is performing unrecorded business work.
    nextOwner: "Owner",
    blocker: mission.state === "blocked" ? text(mission.state_reason) : null,
  };
}

export function useBusinessGamePlanMissions(workspaceId?: string | null) {
  const [items, setItems] = useState<StrategicPlay[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const epochRef = useRef(0);
  const workspaceRef = useRef(workspaceId ?? null);
  workspaceRef.current = workspaceId ?? null;

  const refresh = useCallback(async () => {
    const expectedWorkspace = workspaceId ?? null;
    const epoch = ++epochRef.current;
    if (!expectedWorkspace) {
      setItems([]);
      setStatus("loading");
      return;
    }
    setStatus((current) => current === "ready" ? current : "loading");
    const { data, error } = await missionRpc("list_business_missions", { p_limit: 100 });
    if (epoch !== epochRef.current || workspaceRef.current !== expectedWorkspace) return;
    if (error) {
      const code = codeFrom(error, "MISSION_LIST_FAILED");
      setItems([]);
      setErrorCode(code);
      setStatus(code === "MISSION_OWNER_REQUIRED" || code === "MISSION_UNAUTHENTICATED" ? "forbidden" : "error");
      return;
    }
    const envelope = data && typeof data === "object" ? data as Record<string, unknown> : null;
    if (!envelope || envelope.resolved_tenant_id !== expectedWorkspace || !Array.isArray(envelope.missions)) {
      setItems([]);
      setErrorCode("ACTIVE_ACCOUNT_CHANGED");
      setStatus("error");
      return;
    }
    setItems((envelope.missions as BusinessMissionSummary[]).map(toStrategicPlay));
    setErrorCode(null);
    setStatus("ready");
  }, [workspaceId]);

  useEffect(() => {
    setItems([]);
    setErrorCode(null);
    setStatus("loading");
    void refresh();
    return () => { epochRef.current += 1; };
  }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const missionId = (event as CustomEvent<{ missionId?: string }>).detail?.missionId;
      if (!missionId || items.some((item) => item.id === missionId)) void refresh();
    };
    window.addEventListener("business-mission:refresh", handler);
    return () => window.removeEventListener("business-mission:refresh", handler);
  }, [items, refresh]);

  const getDetail = useCallback(async (missionId: string): Promise<BusinessMissionDetail> => {
    const expectedWorkspace = workspaceRef.current;
    if (!expectedWorkspace) throw new Error("ACTIVE_ACCOUNT_CHANGED");
    const { data, error } = await missionRpc("get_business_mission", { p_mission_id: missionId });
    if (workspaceRef.current !== expectedWorkspace) throw new Error("ACTIVE_ACCOUNT_CHANGED");
    if (error) throw new Error(codeFrom(error, "MISSION_READ_FAILED"));
    const detail = data as BusinessMissionDetail;
    if (!detail?.mission || detail.mission.id !== missionId || !detail.brief) throw new Error("MISSION_READBACK_INVALID");
    return detail;
  }, []);

  const mutate = useCallback(async (
    tool: "mission_create" | "mission_revise" | "mission_transition",
    args: Record<string, unknown>,
  ): Promise<MissionActionResult> => {
    const expectedWorkspace = workspaceRef.current;
    if (!expectedWorkspace) return { ok: false, verified: false, railRecorded: false, code: "ACTIVE_ACCOUNT_CHANGED" };
    const { data, error } = await supabase.functions.invoke("business-mission-action", { body: { tool, args } });
    if (workspaceRef.current !== expectedWorkspace) return { ok: false, verified: false, railRecorded: false, code: "ACTIVE_ACCOUNT_CHANGED" };
    if (error) return { ok: false, verified: false, railRecorded: false, code: codeFrom(error, "MISSION_ACTION_FAILED") };
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const ok = result.success === true && result.verified === true;
    const mission = result.mission && typeof result.mission === "object" ? result.mission as Record<string, unknown> : null;
    await refresh();
    return {
      ok,
      verified: result.verified === true,
      railRecorded: result.railRecorded === true,
      code: text(result.code) ?? undefined,
      missionId: text(mission?.sourceRef) ?? undefined,
    };
  }, [refresh]);

  return { items, status, errorCode, refresh, getDetail, mutate };
}
