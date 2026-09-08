import type { TruthfulAvailability } from "./contract";

export type PaigeLiveEntryMode = "embedded" | "existing-popout" | "requested-popout";

export type PaigeLiveStartResult = Readonly<{
  ok: false;
  sessionId: string | null;
  availability: TruthfulAvailability;
  code: string;
  explanation: string;
  profile?: Readonly<{ name: string; revision: string }>;
}>;

export type PaigeLiveTransition = "hold" | "resume" | "minimize" | "restore" | "retry" | "end";

async function authToken(): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("session_expired");
  return token;
}

async function callControlPlane(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await authToken();
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-live-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.code === "string" ? payload.code : "control_plane_unavailable");
  return payload;
}

export async function startPaigeLiveConversation(input: Readonly<{
  threadId: string;
  contextEpoch: string;
  entryMode: PaigeLiveEntryMode;
}>): Promise<PaigeLiveStartResult> {
  const payload = await callControlPlane({ action: "start", thread_id: input.threadId, context_epoch: input.contextEpoch, entry_mode: input.entryMode });
  return {
    ok: false,
    sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
    availability: (payload.availability as TruthfulAvailability | undefined) ?? "UNAVAILABLE",
    code: typeof payload.code === "string" ? payload.code : "provider_unavailable",
    explanation: typeof payload.explanation === "string"
      ? payload.explanation
      : "Live audio is not available yet. You can keep working with Paige in this conversation.",
    ...(payload.profile && typeof payload.profile === "object" ? { profile: payload.profile as { name: string; revision: string } } : {}),
  };
}

export async function transitionPaigeLiveConversation(sessionId: string, transition: PaigeLiveTransition, scope: Readonly<{ threadId: string; contextEpoch: string }>): Promise<void> {
  await callControlPlane({ action: "transition", session_id: sessionId, transition, thread_id: scope.threadId, context_epoch: scope.contextEpoch });
}
