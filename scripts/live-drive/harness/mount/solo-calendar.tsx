/**
 * Dev-only mount for Solo → Clients → Calendar, so the owner can review the REAL surface.
 *
 * WHY A SECOND ENTRY RATHER THAN A BRANCH IN main.tsx. The operator mount deliberately
 * constructs the real Supabase client to catch module-init failures; this surface needs its
 * wire faked. Keeping them as separate entries means nothing about the operator harness
 * changes (§58) while both stay in the harness's one home (§18).
 *
 * WHAT IS REAL HERE: the shipped `TenantCommandCenterShell` (so nav, the PAIGE rail, its
 * open/folded widths and the Mineral/Obsidian palette are the shipped ones), the shipped
 * `SoloCalendarWorkspace`, the shipped `useSoloCalendar`, the shipped Supabase client, and
 * the shipped CSS. Only the HTTP responses are deterministic, fulfilled by Playwright at the
 * network layer — so the hook's real parsing, conflict detection and colour resolution all run.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one, and no auth,
 * RLS or real row is exercised. The authenticated live drive stays owed.
 *
 * Theme and PAIGE state come from the query string:
 *   /solo-calendar.html?theme=dark
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { TenantProvider } from "@/hooks/useTenantContext";
import { AgentPresenceProvider } from "@/components/ui/paige";
import { TenantCommandCenterShell } from "@/components/tenant-shell/TenantCommandCenterShell";
import { SoloCalendarWorkspace } from "@/components/tenant-calendar/SoloCalendarWorkspace";
import "@/index.css";
// The REAL Clients wrapper stylesheet. `.trc-canonical-mount--direct` is where
// `container-name: solo-calendar-mount` is declared, and the calendar's responsive rules are
// CONTAINER queries against it. Mounting the workspace without this wrapper silently disables
// both breakpoints: the rail never hides and the "View options" fallback never appears, so a
// capture taken that way reports "controls reachable at every width" having never exercised the
// narrow case at all. Found by measuring, after exactly that false pass.
import "@/components/tenant-relationships/tenant-relationships-clients-workspace.css";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const params = new URLSearchParams(window.location.search);
const theme = (params.get("theme") ?? "dark") === "light" ? "light" : "dark";

/** Synthetic throughout (§63): no real account, and the id is a fixture string, not a tenant. */
const HARNESS_TENANT = "harness-tenant-0001";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme={theme}
      forcedTheme={theme}
      enableSystem={false}
      storageKey="harness-solo-calendar-theme"
    >
      <QueryClientProvider client={qc}>
        <TenantProvider>
          <AgentPresenceProvider launcherEnabled={false} hasChatBody={false}>
          <MemoryRouter initialEntries={["/solo/harness/clients/calendar"]}>
            <TenantCommandCenterShell
              accountName="Example Coaching Co"
              accountType="standalone"
              userRole="admin"
              onSignOut={() => {}}
              brandHomeHref="/solo/harness"
            >
              <div className="trc-canonical-mount--direct">
                <SoloCalendarWorkspace
                  activeTenantId={HARNESS_TENANT}
                  connectionsHref="/solo/harness/setup/connections"
                />
              </div>
            </TenantCommandCenterShell>
          </MemoryRouter>
          </AgentPresenceProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
