import { Routes, Route, useLocation } from "react-router-dom";
import AgencyLayout from "@/components/admin/AgencyLayout";
import AgencyApp from "@/agency/AgencyApp";

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
    return (
      <Routes>
        <Route path=":account/*" element={<AgencyApp mode="agency" />} />
      </Routes>
    );
  }
  return <AgencyLayout />;
}
