// Systems Check read seam (Wave S3 L3 frontend) — the ONE hook the SystemsCheckTile
// reads, scope-aware (§9/§51). It fetches the tenant's OR the operator's latest scan
// run + its findings from paige_systems_check_run / _finding, joining the shared
// registry for the human check name + domain + priority.
//
// SCOPE ISOLATION (§9/§51/§53): a `scope="tenant"` read filters `.eq("tenant_id",
// tenantId)` (the caller's own resolved tenant — a sub-account can never widen to the
// parent, §51 invariant); a `scope="operator"` read filters `.is("tenant_id", null)`
// so a super_admin (whose RLS returns ALL rows) still sees ONLY the tenant-less
// operator rows, never a tenant's findings. RLS is the real boundary underneath; these
// filters keep the surfaced set correct for each persona. A tenant JWT never requests
// operator findings — the operator tile only mounts in the godMode operator console.
//
// §13 HONESTY: no run yet → { run: null, findings: [] } (the tile renders an honest
// "no scan yet", never a fabricated pass). The registry/table types are not in the
// generated Supabase types yet (migrations owner-review-gated), so the `.from(... as
// any)` casts match the repo's pre-typegen convention (rag_documents / rag_retrieval_log).
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
    queryFn: async (): Promise<{ run: SystemsCheckRun | null; findings: SystemsCheckFinding[]; tenantCreatedAt?: string | null }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // 1) latest scan run for this scope.
      let runQ = db
        .from("paige_systems_check_run")
        .select("id, started_at, completed_at, check_count, pass_count, fail_count")
        .order("started_at", { ascending: false })
        .limit(1);
      runQ = scope === "operator"
        ? runQ.is("tenant_id", null)
        : runQ.eq("tenant_id", activeTenantId as string);

      const { data: runRows, error: runErr } = await runQ;
      if (runErr) throw runErr;
      const run = ((runRows ?? [])[0] as SystemsCheckRun | undefined) ?? null;
      if (!run) {
        // No run yet. For a TENANT scope, read the tenant's created_at so the tile can honestly
        // distinguish "first scan is still running" (brand-new tenant) from the terminal "no scan
        // yet" empty state (§13). Operator scope is cron-driven — no per-tenant recency signal.
        let tenantCreatedAt: string | null = null;
        if (scope === "tenant" && activeTenantId) {
          const { data: tRow } = await db
            .from("tenants")
            .select("created_at")
            .eq("id", activeTenantId)
            .maybeSingle();
          tenantCreatedAt = (tRow?.created_at as string | null) ?? null;
        }
        return { run: null, findings: [], tenantCreatedAt };
      }

      // 2) findings for that run + the registry join (one shared catalog, §18).
      let findQ = db
        .from("paige_systems_check_finding")
        .select(
          "id, run_id, check_id, status, severity_at_finding, evidence, paige_interpretation, " +
            "paige_drafted_fix, department_id, resolved_at, resolution, resolution_action_id, created_at, " +
            "reg:paige_systems_check_registry(check_name, domain, priority)",
        )
        .eq("run_id", run.id);
      findQ = scope === "operator"
        ? findQ.is("tenant_id", null)
        : findQ.eq("tenant_id", activeTenantId as string);

      const { data: findRows, error: findErr } = await findQ;
      if (findErr) throw findErr;

      const findings: SystemsCheckFinding[] = ((findRows ?? []) as RawFinding[]).map((r) => ({
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

      return { run, findings };
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
