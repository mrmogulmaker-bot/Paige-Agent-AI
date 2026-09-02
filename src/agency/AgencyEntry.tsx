import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import AgencyLayout from "@/components/admin/AgencyLayout";
import AgencyApp from "@/agency/AgencyApp";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageSkeleton } from "@/components/ui/page";
import { WORKSPACE_CHOOSER_PATH, decideWorkspaceEntry } from "@/lib/auth/workspaceEntry";

/**
 * AgencyEntry — the `/agency/*` dispatcher (§65 R0-slice-2).
 *
 * Mounted at `/agency/*`, it routes by the first path segment so the NEW URL-driven
 * agency shell and the LEGACY board can coexist with ZERO collision (§58 — nothing
 * removed):
 *   • **numeric first segment** (`/agency/1924546/…`) → the new `AgencyApp`, mounted
 *     under a nested `:account/*` route so it receives `account` + the branch splat
 *     from `useParams()` and drives every tab as a real deep-linkable URL.
 *   • **anything else** (bare `/agency`, legacy `/agency/team`, …) → the existing
 *     `AgencyLayout` board, byte-unchanged (it keeps its own server-proven
 *     agency-manager eligibility gate).
 *
 * Because account numbers are always numeric (§65 R0), the two never overlap. The
 * numeric shell is only ever LINKED-to for eligible agency managers (the `/admin`
 * Gate-A redirect + the landing route), and every data read stays RLS-scoped (§9/§51),
 * so the address segment is an address, never a grant.
 */
export default function AgencyEntry() {
  const seg = useLocation().pathname.split("/")[2] || "";
  if (/^\d+$/.test(seg)) {
    return <ResolvedAgencyApp />;
  }
  return <AgencyLayout />;
}

/**
 * TIER GATE (owner ruling 2026-09-02). The numeric leg previously mounted the
 * agency shell for ANY authenticated caller and relied on `AgencyApp`'s own URL
 * guard to correct the address. That guard returns early when the caller has no
 * agency of their own (`own == null`), so a Solo caller who reached
 * `/agency/{n}` mounted the agency shell and was never sent home — the wrong
 * operating mode, held indefinitely. Reads stayed RLS-scoped and every `agency_*`
 * RPC refuses a non-agency caller, so this was never cross-tenant access; it was
 * the app presenting a mode the person does not operate in.
 *
 * Fails CLOSED to the caller's own authorized root, or to the entry chooser when
 * there is no single home to name — never into another tenant. An agency or
 * enterprise caller is unaffected: their tier owns this shell, so the gate
 * returns `allow` and the shell mounts exactly as before (§58).
 *
 * The legacy non-numeric leg is untouched — `AgencyLayout` keeps its own
 * server-proven eligibility gate.
 */
function ResolvedAgencyApp() {
  const { accountContextLoading, activeTenant, isPlatformStaff } = useTenantContext();
  if (accountContextLoading) return <PageSkeleton />;

  const decision = decideWorkspaceEntry({
    root: "agency",
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
      <Route path=":account/*" element={<AgencyApp mode="agency" />} />
    </Routes>
  );
}
