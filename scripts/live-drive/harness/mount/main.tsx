/**
 * Dev-only mount for the operator shell, so the harness can measure a REAL render.
 *
 * WHY THIS EXISTS RATHER THAN A LOGIN. The console is auth-gated and these sessions hold no
 * operator credentials (and §63 puts the owner's real accounts off-limits as a fixture target),
 * so the alternative to this entry is measuring nothing. It is not part of the app: it has its
 * own vite config and its own root, is never imported by `src/`, and never reaches a production
 * bundle — so it cannot become an unauthenticated door into the console (§9).
 *
 * WHAT IT MOCKS: the ROUTER, and nothing else. The shell subtree imports no Supabase client and
 * no auth context — `performSignOut` is reached only by a click — so the component under
 * measurement here is the shipped one, reading the shipped IA. That is the harness's own rule
 * (README, "mock the provider, never the contract"): a harness handed a fixtured slot list could
 * only assert the geometry it was given, and would never catch a slot-count regression.
 *
 * WHAT IT STILL DOES NOT PROVE (§13/§32.c). A local render is not a deployed one. This measures
 * geometry against the dev server; it does not exercise auth, data, or the deployed bundle, and
 * it does NOT discharge the owner live-drive that remains owed on the deployed surface.
 *
 * Address and theme come from the query string so the harness drives them without a rebuild:
 *   /?at=/operator/fleet&theme=dark
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OperatorShell from "@/operator/shell/OperatorShell";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const at = params.get("at") || "/operator/fleet";

// The theme is applied BEFORE the first paint, so a frame can never capture the pre-toggle state.
document.documentElement.classList.toggle("dark", (params.get("theme") ?? "dark") === "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        {/* Mirrors how OperatorEntry mounts the shell: a section segment plus a splat, so
            `useParams().section` and `params["*"]` resolve exactly as they do in the app. */}
        <Route path="/operator/:section/*" element={<OperatorShell />} />
        <Route path="/operator/:section" element={<OperatorShell />} />
        <Route path="*" element={<OperatorShell />} />
      </Routes>
    </MemoryRouter>
  </StrictMode>,
);
