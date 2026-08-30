/**
 * Dev-only mount for the Solo-native Calendar, so the harness can measure a REAL render.
 *
 * WHY THIS EXISTS RATHER THAN A LOGIN: the surface is auth-gated and these sessions hold
 * no tenant credentials (and §63 puts the owner's real accounts off-limits as a fixture
 * target), so the alternative is measuring nothing. It is never imported by `src/`, has
 * its own root and vite config, and never reaches a production bundle (§9).
 *
 * WHAT IS REAL HERE: the shipped `SoloCalendarWorkspace`, the shipped `useSoloCalendar`
 * (including its conflict detection), and the shipped `solo-calendar.css` against the
 * app's real `--pg-*` tokens. Only the Supabase transport is stubbed.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one, and the
 * rows are synthetic. It proves GEOMETRY and INTERACTION, never production data.
 *
 *   /?theme=dark&data=dense&paige=open
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SoloCalendarWorkspace } from "@/components/tenant-calendar/SoloCalendarWorkspace";
import "@/index.css";
// The production mount's own stylesheet, because it is what DECLARES the
// `solo-calendar-mount` container the calendar's container queries resolve against.
import "@/components/tenant-relationships/tenant-relationships-clients-workspace.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";

// Applied BEFORE first paint so a frame can never capture the pre-toggle state.
// The Solo shell keys its palette on data-pg, not on the `dark` class — getting this
// wrong is how sixteen "dark" frames once rendered light.
document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");

/**
 * Stand-in for the Clients workspace column the Calendar actually sits in, so the
 * measured width is the width the surface really gets — not the whole viewport.
 * `paige=open` reserves the PAIGE panel's column the way the shell does when it is
 * unfolded; the Calendar must fit both states.
 */
const paigeOpen = params.get("paige") === "open";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div style={{ height: "100vh", display: "grid", gridTemplateColumns: paigeOpen ? "minmax(0,1fr) 380px" : "minmax(0,1fr)", background: "var(--pg-canvas)" }}>
      {/* The `trc-canonical-mount--direct` wrapper is NOT decoration — it is the element
          that declares `container-name: solo-calendar-mount; container-type: inline-size`
          (tenant-relationships-clients-workspace.css), which every container query in
          solo-calendar.css resolves against. Mounting the calendar bare, as this harness
          first did, left `container-type: normal` and silently disabled every one of
          those queries, so a responsive rule could be "proven" in a frame where it had
          never fired. This mirrors TenantRelationshipsClientsWorkspace's real markup. */}
      <div style={{ minWidth: 0, minHeight: 0, display: "grid" }}>
        <div className="trc-canonical-mount trc-canonical-mount--direct" data-calendar-owner="clients">
          <SoloCalendarWorkspace
            activeTenantId="harness-tenant"
            connectionsHref="/solo/1/settings/integrations"
            openPaige={() => undefined}
          />
        </div>
      </div>
      {paigeOpen && (
        <aside style={{ minWidth: 0, borderLeft: "1px solid var(--pg-line)", background: "var(--pg-workspace)" }} aria-hidden="true" />
      )}
    </div>
  </StrictMode>,
);
