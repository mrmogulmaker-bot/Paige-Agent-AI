import { Routes, Route } from "react-router-dom";
import AgencyApp from "@/agency/AgencyApp";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageSkeleton } from "@/components/ui/page";

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
 * never at its own top-level route — so this dispatcher has a single leg. The
 * `/admin` Gate B redirect (§58, mirrors Gate A) is what makes this address
 * reachable; `AgencyApp`'s own top-level ownership guard (§9, R3c-i) then keeps
 * the `:account` segment honest against the caller's real tenant.
 */
export default function BusinessEntry() {
  const { accountContextLoading } = useTenantContext();
  if (accountContextLoading) return <PageSkeleton />;
  return (
    <Routes>
      <Route path=":account/*" element={<AgencyApp mode="subaccount" />} />
    </Routes>
  );
}
