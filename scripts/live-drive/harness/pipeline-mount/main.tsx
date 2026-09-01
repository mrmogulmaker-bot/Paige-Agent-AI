import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GrowthHub } from "@/solo/growth2";
import { setPipelineHarnessMode } from "./useSoloCampaigns-stub";
import "@/index.css";
import "@/solo/solo-tokens.css";

document.documentElement.setAttribute("data-pg", "light");
document.documentElement.classList.add("light");

function Harness() {
  return <div style={{ height: "100vh", display: "grid", gridTemplateRows: "42px minmax(0,1fr)", background: "#e8e5df" }}>
    <aside aria-label="Reviewer controls" style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 14px", borderBottom: "1px solid #d4d0c8", background: "#f4f1eb", font: "12px system-ui", color: "#302d36" }}>
      <strong style={{ marginRight: 6 }}>LOCAL REVIEW · NO LIVE DATA</strong>
      <button onClick={() => setPipelineHarnessMode("active")}>Active board</button>
      <button onClick={() => setPipelineHarnessMode("empty")}>No pipeline</button>
      <button onClick={() => setPipelineHarnessMode("readonly")}>Read-only</button>
    </aside>
    <main className="paige-solo" style={{ minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <MemoryRouter initialEntries={["/solo/review/growth/pipeline"]}>
        <Routes><Route path="/solo/:account/*" element={<GrowthHub />} /></Routes>
      </MemoryRouter>
    </main>
  </div>;
}

class HarnessBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack); }
  render() { return this.state.error ? <pre style={{ padding: 20 }}>{this.state.error.stack}</pre> : this.props.children; }
}

createRoot(document.getElementById("root")!).render(<StrictMode><HarnessBoundary><Harness /></HarnessBoundary></StrictMode>);
