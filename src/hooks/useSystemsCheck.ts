// Systems Check read seam (Wave S3 L3 frontend) — the ONE hook the SystemsCheckTile
// reads, scope-aware (§9/§51). It calls the `systems_check_snapshot` RPC, which returns
// the tenant's OR the operator's latest scan run + its findings (joined to the shared
// registry for the human check name + domain + priority) + the tenant's created_at, in
// ONE round-trip (task #122 perf — replaced 2–3 serialized PostgREST queries per mount).
//
// SCOPE ISOLATION (§9/§51/§53/§59): the client passes ONLY the scope, never a tenant id.
// The RPC enforces caller-scope IN-BODY (§59): `scope="tenant"` derives the tenant from
// current_user_tenant_id() (the caller's own resolved tenant — a sub-account can never
// widen to the parent, §51 invariant); `scope="operator"` gates on is_platform_operator()
// and reads only the tenant-less (tenant_id IS NULL) operator lens, so a super_admin still
// sees ONLY operator rows, never a tenant's findings. RLS is the real boundary underneath.
// A tenant JWT never requests operator scope — the operator tile only mounts in godMode.
//
// §13 HONESTY: no run yet → { run: null, findings: [] } (the tile renders an honest
// "no scan yet", never a fabricated pass). The RPC is not in the generated Supabase types
// yet (migrations owner-review-gated), so the `(supabase as any).rpc(...)` cast matches
// the repo's pre-typegen convention (rag_documents / rag_retrieval_log).
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export type SystemsCheckScope = "tenant" | "operator";
export type FindingStatus = "pass" | "fail" | "skip" | "error";
export type CheckSeverity = "blocking" | "high" | "medium" | "low";

export interface SystemsCheckFinding {
  id: string;
  run_id: string;
  check_id: string;
  status: FindingStatus;
  severity_at_finding: CheckSeverity | null;
  evidence: Record<string, unknown> | null;
  paige_interpretation: string | null;
  paige_drafted_fix: Record<string, unknown> | string | null;
  department_id: string | null;
  resolved_at: string | null;
  resolution: string | null;
  resolution_action_id: string | null;
  created_at: string;
  // joined from the shared registry (§18 one catalog):
  check_name: string | null;
  domain: string | null;
  priority: number | null;
}

export interface SystemsCheckRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  check_count: number | null;
  pass_count: number | null;
  fail_count: number | null;
}

export interface SystemsCheckSnapshot {
  run: SystemsCheckRun | null;
  findings: SystemsCheckFinding[];
  loading: boolean;
  isError: boolean;
  /** True when a tenant has NO run yet but was created very recently — the first onboarding scan is
   *  enqueued/running and its row hasn't landed. §13: an HONEST "in progress" signal, never a claim
   *  that a scan finished. There is no queued row to read (the scan writes its run only on completion),
   *  so this keys on tenant.created_at recency; after the window it falls back to the honest empty
   *  state so a genuinely-failed enqueue never shows "running" forever. Tenant scope only. */
  scanPending: boolean;
  refresh: () => void;
}

// How long after tenant creation we treat "no run yet" as "first scan in progress" rather than the
// terminal empty state. The onboarding scan fires on creation (enqueue → edge fn → run row); this
// window comfortably covers the enqueue + scan latency without claiming progress indefinitely.
const FIRST_SCAN_PENDING_WINDOW_MS = 10 * 60 * 1000;

interface RawFinding {
  id: string;
  run_id: string;
  check_id: string;
  status: FindingStatus;
  severity_at_finding: CheckSeverity | null;
  evidence: Record<string, unknown> | null;
  paige_interpretation: string | null;
  paige_drafted_fix: Record<string, unknown> | string | null;
  department_id: string | null;
  resolved_at: string | null;
  resolution: string | null;
  resolution_action_id: string | null;
  created_at: string;
  reg?: { check_name?: string | null; domain?: string | null; priority?: number | null } | null;
}

export function useSystemsCheck(scope: SystemsCheckScope): SystemsCheckSnapshot {
  const { activeTenantId } = useTenantContext();
  const qc = useQueryClient();
  const scopeKey = scope === "tenant" ? (activeTenantId ?? "none") : "operator";

  // Tenant reads need a resolved tenant; the operator read is tenant-less (RLS-gated).
  const enabled = scope === "operator" || !!activeTenantId;

  const query = useQuery({
    queryKey: ["systems_check", scope, scopeKey],
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    // Navigation re-mounts no longer re-pay the round-trip within the refresh window; the RPC
    // is the single source and the 60s refetchInterval keeps it fresh (task #122 perf).
    staleTime: 60_000,
    queryFn: async (): Promise<{ run: SystemsCheckRun | null; findings: SystemsCheckFinding[]; tenantCreatedAt?: string | null }> => {
      // ONE round-trip: the systems_check_snapshot RPC merges the former Query A (latest run) +
      // Query B (findings + registry embed) + Query C (tenant created_at) into a single jsonb.
      // §59 caller-scope is enforced IN-BODY (tenant derived from current_user_tenant_id(),
      // operator gated on is_platform_operator()) — the client passes only the scope, never a
      // tenant id. The returned shape is byte-for-byte the same rows the three queries produced.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("systems_check_snapshot", { p_scope: scope });
      if (error) throw error;

      const snap = (data ?? {}) as {
        run?: SystemsCheckRun | null;
        findings?: RawFinding[] | null;
        tenant_created_at?: string | null;
      };

      const run = snap.run ?? null;
      const findings: SystemsCheckFinding[] = ((snap.findings ?? []) as RawFinding[]).map((r) => ({
        id: r.id,
        run_id: r.run_id,
        check_id: r.check_id,
        status: r.status,
        severity_at_finding: r.severity_at_finding,
        evidence: r.evidence,
        paige_interpretation: r.paige_interpretation,
        paige_drafted_fix: r.paige_drafted_fix,
        department_id: r.department_id,
        resolved_at: r.resolved_at,
        resolution: r.resolution,
        resolution_action_id: r.resolution_action_id,
        created_at: r.created_at,
        check_name: r.reg?.check_name ?? null,
        domain: r.reg?.domain ?? null,
        priority: r.reg?.priority ?? null,
      }));

      // tenant_created_at is only populated (and only consumed) when there is no run yet, in
      // tenant scope — it drives scanPending below. Operator scope always returns null.
      return { run, findings, tenantCreatedAt: snap.tenant_created_at ?? null };
    },
  });

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["systems_check", scope, scopeKey] });
  }, [qc, scope, scopeKey]);

  const run = query.data?.run ?? null;
  const tenantCreatedAt = query.data?.tenantCreatedAt ?? null;
  // "First scan in progress" only when: tenant scope, no run row yet, the load succeeded (not an
  // error masquerading as empty), and the tenant was created inside the pending window. §13: honest —
  // after the window, or on any error, this is false and the tile shows the terminal empty state.
  const scanPending =
    scope === "tenant" &&
    !run &&
    !query.isError &&
    !!tenantCreatedAt &&
    Date.now() - new Date(tenantCreatedAt).getTime() < FIRST_SCAN_PENDING_WINDOW_MS;

  return {
    run,
    findings: query.data?.findings ?? [],
    loading: enabled && query.isLoading,
    isError: query.isError,
    scanPending,
    refresh,
  };
}
