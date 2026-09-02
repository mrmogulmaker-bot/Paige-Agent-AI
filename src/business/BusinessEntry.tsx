import { Routes, Route, Navigate } from "react-router-dom";
import AgencyApp from "@/agency/AgencyApp";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageSkeleton } from "@/components/ui/page";
import { WORKSPACE_CHOOSER_PATH, decideWorkspaceEntry } from "@/lib/auth/workspaceEntry";

/**
 * BusinessEntry — the `/business/*` dispatcher (§65 R3c-i).
 *
 * Mounted at `/business/*`, always rendering the sub-account shell under a
 * nested `:account/*` route so it receives `account` + the branch splat from
 * `useParams()` and drives every tab as a real deep-linkable URL, mirroring
 * `AgencyEntry`'s numeric-segment leg (§18 reuse — same shell, same routing
 * machinery, tier-parameterized rather than forked).
 *
 * Unlike `/agency/*`, there is no legacy standalone board to fork against here
 * — a sub-account has only ever rendered inline at `/admin` (Admin.tsx Gate B),
 * never at its own top-level route — so this dispatcher has a single leg.
 *
 * TIER GATE (owner ruling 2026-09-02). This entry previously checked only
 * `accountContextLoading`, and its docblock asserted that "`AgencyApp`'s own
 * top-level ownership guard then keeps the `:account` segment honest against the
 * caller's real tenant." That protection was never implemented for a caller of
 * the WRONG TIER: `AgencyApp` resolves `ownAccountNumber` from the caller's own
 * active tenant, so a Solo caller reaching `/business/anything` was rewritten to
 * `/business/{their own Solo account number}` and left rendering the sub-account
 * shell — a wrong operating mode with no exit, because every control that leaves
 * that shell is gated on owning an agency. Reads stayed RLS-scoped throughout, so
 * this was never cross-tenant data access; it was the app presenting the wrong
 * operating mode to an owner, which is the defect the ruling closes.
 *
 * The gate fails CLOSED: a caller whose SERVER-DERIVED tier does not own this
 * shell goes to their own authorized root, or to the entry chooser when there is
 * no single home to name. It never falls back into another tenant as a
 * convenience. The classification comes from `useTenantContext`, never from the
 * `:account` URL segment — the address is an address, never a grant (§9/§65).
 */
export default function BusinessEntry() {
  const { accountContextLoading, activeTenant, isPlatformStaff } = useTenantContext();
  if (accountContextLoading) return <PageSkeleton />;

  const decision = decideWorkspaceEntry({
    root: "business",
    classification: {
      account_type: activeTenant?.account_type ?? null,
      parent_tenant_id: activeTenant?.parent_tenant_id ?? null,
      isPlatformStaff,
    },
    accountNumber: activeTenant?.account_number ?? null,
  });
  if (decision.kind === "redirect") return <Navigate to={decision.to} replace />;
  if (decision.kind === "chooser") return <Navigate to={WORKSPACE_CHOOSER_PATH} replace />;

  return (
    <Routes>
      <Route path=":account/*" element={<AgencyApp mode="subaccount" />} />
    </Routes>
  );
}
