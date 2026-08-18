import { Routes, Route } from "react-router-dom";
import SoloApp from "@/solo/SoloApp";

/**
 * SoloEntry — the `/solo/*` dispatcher (§65 R3d-i).
 *
 * Mounted at `/solo/*`, always rendering the Solo shell under a nested
 * `:account/*` route so it receives `account` + the branch splat from
 * `useParams()` and drives every tab as a real deep-linkable URL, mirroring
 * `BusinessEntry`'s single-legged pattern (§18 reuse — same shell-conversion
 * pattern as sub-account's `/business/*`, tier-parameterized rather than
 * forked).
 *
 * Like sub-account, there is no legacy standalone board to fork against here
 * — a Solo tenant has only ever rendered inline at `/admin` (Admin.tsx's Solo
 * gate), never at its own top-level route — so this dispatcher has a single
 * leg. The `/admin` gate's redirect (§58, mirrors Gate A/B) is what makes
 * this address reachable; `SoloApp`'s own top-level ownership guard (§9,
 * mirrors task #171/R3c-i) then keeps the `:account` segment honest against
 * the caller's real tenant.
 */
export default function SoloEntry() {
  return (
    <Routes>
      <Route path=":account/*" element={<SoloApp />} />
    </Routes>
  );
}
