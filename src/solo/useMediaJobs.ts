// useMediaJobs — the real data hook behind the canonical Vibe Studio.
//
// The ONE client of the paige-media edge seam: capabilities truth, the job list
// (RLS tenant-scoped read + realtime), asset previews for finished jobs (the
// marketing_content library — the one asset home), and the governed actions
// (submit / approve / decline / cancel). No provider is ever called from the
// browser; every estimate, budget decision, and approval boundary lives
// server-side in the seam.
//
// Truth rules (AGENTS.md): job states render exactly what the seam reports —
// "succeeded" appears only when the server marked it, needs_config/budget
// denials surface the server's own explanation, and nothing here fabricates
// progress, cost, or capability.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export interface MediaModelInfo {
  id: string;
  label: string;
  mode: "image" | "image_edit" | "video";
  tier: "standard" | "premium";
  estCostPerUnitUsd: number;
  unit: "image" | "second";
}

export interface MediaCapabilities {
  providers: Array<{
    provider: string;
    execution: "async" | "sync";
    configured: boolean;
    models: MediaModelInfo[];
    license: { licenseClass: string; commercialUse: string; disclosure: string };
    retention: { policy: string; copyDeadline: string };
  }>;
  music: { available: boolean; status: string; note: string };
  video: {
    available: boolean;
    enabled: boolean;
    provider_configured: boolean;
    provider_ceiling_set: boolean;
    completed_today: number;
    daily_limit: number;
    note: string;
  };
  budget: {
    ceiling_set: boolean;
    ceiling_usd: number | null;
    accrued_today_usd: number | null;
    draft_allowance_usd: number;
  };
}

export interface MediaJob {
  id: string;
  mode: string;
  provider: string;
  model: string;
  params: Record<string, unknown> | null;
  state: string;
  approval_state: string;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  error: string | null;
  content_id: string | null;
  video_seconds: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface MediaAsset {
  id: string;
  kind: string;
  title: string;
  image_url: string | null;
  meta: Record<string, unknown> | null;
}

// String-literal discriminant (not boolean): this repo compiles non-strict
// (strictNullChecks off), where boolean-literal discrimination does not narrow.
export type SubmitOutcome =
  | { status: "ok"; job: MediaJob; awaitingApproval?: boolean }
  | { status: "error"; message: string; needsConfig?: boolean; needsCeiling?: boolean; budgetDenied?: boolean; limitReached?: boolean };

const isJobRow = (v: unknown): v is MediaJob =>
  !!v && typeof v === "object" && typeof (v as MediaJob).id === "string";

export function useMediaJobs() {
  const { activeTenantId } = useTenantContext();
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [assets, setAssets] = useState<Record<string, MediaAsset>>({});
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const tenantRef = useRef<string | null>(null);
  tenantRef.current = activeTenantId ?? null;

  const invoke = useCallback(async <T,>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> => {
    const { data, error } = await supabase.functions.invoke<T>("paige-media", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    return data;
  }, []);

  const refreshCapabilities = useCallback(async () => {
    try {
      const data = await invoke<MediaCapabilities>("capabilities");
      if (data) setCapabilities(data);
    } catch {
      setCapabilities(null);
    }
  }, [invoke]);

  const refreshJobs = useCallback(async () => {
    const tenant = tenantRef.current;
    if (!tenant) return;
    const { data, error } = await supabase
      .from("paige_media_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data) setJobs(data as MediaJob[]);
  }, []);

  // Resolve finished-job asset previews from the ONE library (RLS-scoped read).
  const refreshAssets = useCallback(async (current: MediaJob[]) => {
    const ids = current
      .filter((j) => j.state === "succeeded" && j.content_id)
      .map((j) => j.content_id as string)
      .filter((id) => id && !assets[id]);
    if (!ids.length) return;
    const { data, error } = await supabase
      .from("marketing_content")
      .select("id, kind, title, image_url, meta")
      .in("id", ids);
    if (!error && data) {
      setAssets((prev) => {
        const next = { ...prev };
        for (const row of data as MediaAsset[]) next[row.id] = row;
        return next;
      });
    }
  }, [assets]);

  // Initial load + realtime. While any job is in flight, a 10s poll backstops
  // realtime (the sweeper advances states server-side with the service role).
  useEffect(() => {
    if (!activeTenantId) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      await Promise.all([refreshCapabilities(), refreshJobs()]);
      if (alive) setLoading(false);
    })();
    const channel = supabase
      .channel(`paige-media-jobs-${activeTenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "paige_media_jobs" },
        () => {
          if (alive) void refreshJobs();
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [activeTenantId, refreshCapabilities, refreshJobs]);

  useEffect(() => {
    if (!jobs.length) return;
    void refreshAssets(jobs);
  }, [jobs, refreshAssets]);

  const inFlight = useMemo(
    () => jobs.some((j) => ["created", "blocked", "submitted", "processing", "outcome_unknown", "expired"].includes(j.state)),
    [jobs],
  );

  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void refreshJobs(), 10_000);
    return () => clearInterval(t);
  }, [inFlight, refreshJobs]);

  const submit = useCallback(
    async (input: {
      prompt: string;
      model: string;
      aspectRatio?: string;
      videoSeconds?: number;
      referenceContentIds?: string[];
      requestId: string;
    }): Promise<SubmitOutcome> => {
      setActionError(null);
      try {
        const data = await invoke<{ job?: MediaJob; awaiting_approval?: boolean; error?: string; needs_config?: boolean; needs_ceiling?: boolean; budget_denied?: boolean; limit_reached?: boolean }>("submit", {
          prompt: input.prompt,
          model: input.model,
          aspect_ratio: input.aspectRatio,
          video_seconds: input.videoSeconds,
          reference_content_ids: input.referenceContentIds,
          request_id: input.requestId,
        });
        if (!data?.job || data.error) {
          return {
            status: "error",
            message: data?.error ?? "The job couldn't be created.",
            needsConfig: data?.needs_config,
            needsCeiling: data?.needs_ceiling,
            budgetDenied: data?.budget_denied,
            limitReached: data?.limit_reached,
          };
        }
        void refreshJobs();
        void refreshCapabilities();
        return { status: "ok", job: data.job, awaitingApproval: data.awaiting_approval };
      } catch (e) {
        const message = e instanceof Error ? e.message : "The request failed.";
        setActionError(message);
        return { status: "error", message };
      }
    },
    [invoke, refreshCapabilities, refreshJobs],
  );

  const decide = useCallback(
    async (jobId: string, approve: boolean): Promise<boolean> => {
      setActionError(null);
      try {
        await invoke(approve ? "approve" : "reject", { job_id: jobId });
        void refreshJobs();
        void refreshCapabilities();
        return true;
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "The action failed.");
        return false;
      }
    },
    [invoke, refreshCapabilities, refreshJobs],
  );

  const cancel = useCallback(
    async (jobId: string): Promise<boolean> => {
      setActionError(null);
      try {
        await invoke("cancel", { job_id: jobId });
        void refreshJobs();
        return true;
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "The cancellation failed.");
        return false;
      }
    },
    [invoke, refreshJobs],
  );

  return { capabilities, jobs, assets, loading, actionError, submit, decide, cancel, refreshCapabilities, isJobRow };
}
