// Dev-only responsive verification mount. This is not a production route, authenticated
// tenant evidence, or a data fixture. It mounts the real Analytics component inside the
// real Solo shell and the one existing PAIGE workspace so geometry can be measured safely.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TenantProvider } from "@/hooks/useTenantContext";
import { AgentPresenceProvider, useAgentPresence } from "@/components/ui/paige";
import { VoiceDeviceProvider } from "@/lib/voice/VoiceDeviceProvider";
import { TenantCommandCenterShell } from "@/components/tenant-shell/TenantCommandCenterShell";
import { Analytics2 } from "@/solo/analytics2";
import { SoloPaigeWorkspace } from "@/solo/SoloPaigeWorkspace";
import "@/index.css";
import "@/solo/solo-tokens.css";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Vite mounts this harness entry directly; it is intentionally not a reusable export.
// eslint-disable-next-line react-refresh/only-export-components
function AnalyticsHarness() {
  const { expandRail } = useAgentPresence();
  return (
    <div data-harness-label="Analytics verification harness — not authenticated tenant evidence" style={{ height: "100vh", overflow: "hidden" }}>
      <TenantCommandCenterShell
        accountName="Analytics verification harness"
        accountType="standalone"
        userRole="admin"
        onSignOut={() => undefined}
        soloPaigeWorkspace={<SoloPaigeWorkspace full={false} dockedTab="chat" onDockedTabChange={() => undefined} />}
      >
        <main style={{ height: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          <Analytics2 accountContext={{ accountName: "Analytics verification harness", accountType: "standalone" }} openPaige={expandRail} />
        </main>
      </TenantCommandCenterShell>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
    <QueryClientProvider client={client}>
      <TenantProvider>
        <MemoryRouter initialEntries={["/solo/verification/analytics"]}>
          <AgentPresenceProvider launcherEnabled={false} hasChatBody>
            <VoiceDeviceProvider>
              <AnalyticsHarness />
            </VoiceDeviceProvider>
          </AgentPresenceProvider>
        </MemoryRouter>
      </TenantProvider>
    </QueryClientProvider>
  </ThemeProvider>,
);
