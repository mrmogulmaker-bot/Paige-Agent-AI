import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { GrowthHub } from "@/solo/growth2";
import { setSalesHarnessMode, setHarnessTenant, getHarnessTenant, type Mode } from "./useSoloSalesOps-stub";
import { setAgreementsHarnessMode, type AgreementsMode } from "./useSoloAgreements-stub";
import { TenantRelationshipsClientsWorkspace } from "@/components/tenant-relationships/TenantRelationshipsClientsWorkspace";
import { setClientSaveMode, finishClientSave } from "./client-boundary-stub";
import { Toaster } from "sonner";
import "@/index.css";
import "@/solo/solo-tokens.css";

// The stub reaches React through the global so it can subscribe without importing a second copy.
(globalThis as { __React?: typeof React }).__React = React;

const AGREEMENT_MODES: readonly AgreementsMode[] =
  ["none", "no-clients", "populated", "unreadable", "readonly", "error"];

const MODES: readonly Mode[] = [
  "first-use", "declared", "not-yet", "unrecognised-processor", "populated",
  "activity-unreadable", "readonly", "authority-unknown",
  "loading", "resolving", "unavailable", "error", "save-refused",
];

function Harness() {
  const [theme, setTheme] = React.useState<"light" | "dark">(() => sessionStorage.getItem("sales-review-theme") === "dark" ? "dark" : "light");
  React.useEffect(() => {
    sessionStorage.setItem("sales-review-theme", theme);
    document.documentElement.setAttribute("data-pg", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "auto minmax(0,1fr)" }}>
      <aside
        aria-label="Reviewer controls"
        data-harness-controls
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "0 14px", flexWrap: "wrap",
          borderBottom: "1px solid #d4d0c8", background: "#f4f1eb",
          font: "12px system-ui", color: "#302d36",
        }}
      >
        <button data-switch-workspace onClick={()=>setHarnessTenant(getHarnessTenant()==="harness-tenant"?"other-tenant":"harness-tenant")}>Switch workspace</button>
        {["success","failure","delayed-success","delayed-failure"].map(mode=><button key={mode} data-client-mode={mode} onClick={()=>setClientSaveMode(mode)}>client:{mode}</button>)}
        <button data-client-finish onClick={finishClientSave}>Complete client request</button>
        <strong style={{ marginRight: 6 }}>LOCAL REVIEW · NO LIVE DATA</strong>
        {AGREEMENT_MODES.map((mode) => (
          <button key={mode} data-agreements={mode} onClick={() => setAgreementsHarnessMode(mode)}>
            terms:{mode}
          </button>
        ))}
        {MODES.map((mode) => (
          <button key={mode} data-mode={mode} onClick={() => setSalesHarnessMode(mode)}>{mode}</button>
        ))}
        <button data-theme-toggle onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
          theme: {theme}
        </button>
      </aside>
      <main className="paige-solo" data-theme={theme} style={{ minHeight: 0, minWidth: 0, overflow: "hidden" }}>
        <BrowserRouter>
          <Toaster/><Routes><Route path="/solo/:account/clients/*" element={<TenantRelationshipsClientsWorkspace routeTier="solo" openPaige={()=>{}} />} /><Route path="/solo/:account/*" element={<GrowthHub />} /><Route path="*" element={<Navigate to="/solo/review/growth/sales" replace />} /></Routes>
        </BrowserRouter>
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
