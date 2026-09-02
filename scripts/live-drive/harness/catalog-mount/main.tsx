import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GrowthHub } from "@/solo/growth2";
import { setCatalogHarnessMode } from "./useCatalogOffers-stub";
import "@/index.css";
import "@/solo/solo-tokens.css";

// The stub reaches React through the global so it can subscribe without importing a second copy.
(globalThis as { __React?: typeof React }).__React = React;

const MODES = ["populated", "unpriced", "instalment", "recurring", "empty", "readonly",
  "authority-unknown", "fields-unavailable", "resolving", "error"] as const;

function Harness() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  React.useEffect(() => {
    document.documentElement.setAttribute("data-pg", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "42px minmax(0,1fr)" }}>
      <aside
        aria-label="Reviewer controls"
        data-harness-controls
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "0 14px",
          borderBottom: "1px solid #d4d0c8", background: "#f4f1eb",
          font: "12px system-ui", color: "#302d36",
        }}
      >
        <strong style={{ marginRight: 6 }}>LOCAL REVIEW · NO LIVE DATA</strong>
        {MODES.map((mode) => (
          <button key={mode} data-mode={mode} onClick={() => setCatalogHarnessMode(mode)}>{mode}</button>
        ))}
        <button data-theme-toggle onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
          theme: {theme}
        </button>
      </aside>
      <main className="paige-solo" data-theme={theme} style={{ minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        <MemoryRouter initialEntries={["/solo/review/growth/catalog"]}>
          <Routes><Route path="/solo/:account/*" element={<GrowthHub />} /></Routes>
        </MemoryRouter>
      </main>
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
