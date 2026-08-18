import { Routes, Route, Navigate } from "react-router-dom";
import OperatorLogin from "@/pages/OperatorLogin";
import RequireOperator from "@/operator/RequireOperator";
import OperatorApp from "@/operator/OperatorApp";

/**
 * OperatorEntry — the `/operator/*` dispatcher (§65 R4, Super Admin pack slice 1b).
 *
 * Peer to `AgencyEntry` (`/agency/*`) and `BusinessEntry` (`/business/*`): a thin segment
 * dispatcher mounted from App.tsx that hands off to the tier's shell. Following that shape
 * (§18) means the login leg lives OUTSIDE the guard as a sibling route, rather than needing a
 * carve-out inside it.
 *
 * THERE IS NO PATH COLLISION HERE, which is worth stating because it looks like there should
 * be. The design pack defines 78 routes and NONE of them sits at bare `/operator` — the
 * shallowest are `/operator/fleet`, `/operator/paige`, `/operator/comms`. `/operator` is a
 * PREFIX in the pack, not an address ("Rename /operator to whatever prefix the real app uses;
 * nothing else depends on it"). So the door keeps the root and the console roots one segment
 * deeper. No move, no bookmark churn.
 *
 * THE INDEX LEG IS LOAD-BEARING, NOT COSMETIC. App.tsx previously matched `/operator` as an
 * EXACT path; this changes it to a splat. Without an explicit `index` route here, bare
 * `/operator` would render NOTHING — the shape `BusinessEntry` has (only `:account/*`), where
 * a bare `/business` is blank. And because NOTHING in the product links to `/operator` (a
 * repo-wide grep finds zero href/to/navigate hits — it is a typed or bookmarked URL only), a
 * blank root would ship completely undetected and surface when the owner types the URL.
 *
 * Bare `/operator` already self-resolves by auth state: `OperatorLogin` runs `getSession()` +
 * `onAuthStateChange` on mount and bounces an authenticated operator straight onward. Signed
 * out you get the form; signed in you get the console. That IS the front-door behaviour the
 * design assumes.
 */
export default function OperatorEntry() {
  return (
    <Routes>
      {/* The door. UNGUARDED by definition — guarding the login page would lock everyone out. */}
      <Route index element={<OperatorLogin />} />
      {/* An explicit, unambiguous address (§65 name-to-mental-model) for links, emails and the
          guard's ?next= round-trip. Same component; also ungated. */}
      <Route path="login" element={<OperatorLogin />} />
      {/* The console: 78 routes behind exactly ONE guard. */}
      <Route
        path=":section/*"
        element={
          <RequireOperator>
            <OperatorApp />
          </RequireOperator>
        }
      />
      {/* A doubled slash (`/operator//fleet`) still matches the OUTER `/operator/*` in App.tsx,
          so App's own `*` → NotFound never fires — and with no leg here it rendered a BLANK
          page. That is exactly the "ships completely undetected" class the index leg above
          exists to prevent; the §39 peer-gate found the defense had been written for the root
          and never extended to a catch-all. Anything unmatched goes to the door. */}
      <Route path="*" element={<Navigate to="/operator" replace />} />
    </Routes>
  );
}
