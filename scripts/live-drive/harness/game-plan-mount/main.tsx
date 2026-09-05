/**
 * Dev-only mount for the Business Game Plan, so the harness can measure a REAL render of a
 * surface these sessions cannot log into.
 *
 * WHAT IS REAL: the shipped `SoloGamePlanWorkspace`, its shipped `solo-game-plan-workspace.css`,
 * the shipped `solo-tokens.css`, the shipped route helpers, and the form-fit Solo shell chain.
 * Only `useSoloGamePlan` is stubbed (via the vite alias) with a deterministic per-`?mode=` state.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one, and the states are
 * synthetic. It proves GEOMETRY, STATE RENDERING and both palettes — never production data or
 * production behaviour. The authenticated live drive stays owed to a capable session.
 *
 *   /?mode=grounded&theme=dark   (modes: grounded · partial · empty · blocked · owner · motion · loading · error)
 */
import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SoloGamePlanWorkspace } from "@/solo/SoloGamePlanWorkspace";
// The Game Plan surface depends ONLY on the .paige-solo token layer + its own scoped CSS
// (imported by the component). It uses no Tailwind utilities, so the app's index.css (and its
// Tailwind pipeline) is deliberately not loaded here — this renders exactly what production ships.
import "@/solo/solo-tokens.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";

// Applied before first paint so a frame can never capture a pre-toggle state.
document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");
document.documentElement.classList.toggle("light", theme === "light");

function Harness() {
  return (
    <div
      className="paige-solo"
      data-theme={theme}
      style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--canvas)" }}
    >
      <MemoryRouter initialEntries={["/solo/review/command-center/business-game-plan"]}>
        <Routes>
          <Route
            path="/solo/:account/*"
            element={<SoloGamePlanWorkspace openPaige={() => {}} accountContext={{ name: "Clearpath Advisory" }} workspaceId="review" />}
          />
        </Routes>
      </MemoryRouter>
    </div>
  );
}

class HarnessBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() {
    return this.state.error
      ? <pre data-harness-error style={{ padding: 20 }}>{this.state.error.stack}</pre>
      : this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><HarnessBoundary><Harness /></HarnessBoundary></StrictMode>,
);
