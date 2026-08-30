export function useSystemsCheck() {
  return {
    run: { id: "run-1", started_at: "2026-08-29T12:00:00Z", completed_at: "2026-08-29T12:01:00Z", check_count: 1, pass_count: 0, fail_count: 1 },
    findings: [{
      id: "finding-1", run_id: "run-1", check_id: "payments_connection", status: "fail",
      severity_at_finding: "blocking", evidence: { provider: "Stripe", state: "disconnected" },
      paige_interpretation: "Payments cannot be verified while the connection is unavailable.",
      paige_drafted_fix: null, department_id: "finance", resolved_at: null, resolution: null,
      resolution_action_id: null, created_at: "2026-08-29T12:01:00Z",
      check_name: "Payment connection needs attention", domain: "payments", priority: 1,
    }],
    loading: false, isError: false, scanPending: false, refresh: () => undefined,
  };
}
