import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AgentPresenceProvider } from "@/components/ui/paige/AgentPresenceContext";
import { TenantCommandCenterShell } from "@/components/tenant-shell/TenantCommandCenterShell";
import { Marketplace } from "@/solo/marketplace";
import "@/index.css";
import "@/solo/solo-tokens.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";
const paigeOpen = params.get("paige") === "open";
document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");
localStorage.setItem("paige.agentRail.collapsed", String(!paigeOpen));
localStorage.setItem("paige.tenantShell.navExpanded", "false");

export function PaigeHarnessWorkspace() {
  return <div data-marketplace-paige-workspace="true" style={{ height: "100%", display: "grid", alignContent: "start", gap: 10, padding: 16, color: "var(--pg-ink-2)" }}>
    <strong style={{ color: "var(--pg-ink)" }}>PAIGE workspace</strong>
    <span style={{ fontSize: 12, lineHeight: 1.5 }}>Local transport is unavailable. No capability reference, message, or action is attached.</span>
  </div>;
}

createRoot(document.getElementById("root")!).render(<StrictMode>
  <ThemeProvider attribute="class" forcedTheme={theme} enableSystem={false}>
    <AgentPresenceProvider launcherEnabled={false} hasChatBody={false}>
      <MemoryRouter initialEntries={["/solo/0000000/marketplace/today"]}>
        <TenantCommandCenterShell accountName="Synthetic form-fit workspace" accountType="standalone" userRole="admin" onSignOut={() => undefined} soloPaigeWorkspace={<PaigeHarnessWorkspace />}>
          <div className="paige-solo" data-theme={theme} style={{ height: "100%", minHeight: 0 }}>
            <main data-marketplace-frame-main style={{ height: "100%", minHeight: 0, overflow: "hidden" }}><Marketplace /></main>
          </div>
        </TenantCommandCenterShell>
        <div style={{ position: "fixed", left: 8, bottom: 8, zIndex: 200, padding: "4px 7px", borderRadius: 6, background: "#111", color: "#fff", font: "700 9px monospace", opacity: .82 }}>LOCAL SYNTHETIC FORM-FIT · NOT TENANT DATA</div>
      </MemoryRouter>
    </AgentPresenceProvider>
  </ThemeProvider>
</StrictMode>);
