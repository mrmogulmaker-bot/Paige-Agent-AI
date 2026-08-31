/**
 * Dev-only mount for Settings › Integrations, so the harness can measure a REAL
 * render of a surface these sessions cannot log into.
 *
 * WHAT IS REAL: the shipped `SoloIntegrationsView`, the shipped
 * `useN8nConnection` (including its sanitiser and its error mapping), the
 * shipped `settings-integrations.css` and `settings.css`, against the app's real
 * `--pg` tokens, inside the real shell scroll owner. Only the Supabase transport
 * and the tenant context are stubbed.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one,
 * and no real n8n instance is contacted. It proves GEOMETRY, SCROLL OWNERSHIP
 * and INTERACTION — never production data or an authenticated provider result.
 *
 *   /?theme=light&data=connected
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SoloIntegrationsView } from "@/solo/settings-integrations";
import "@/index.css";
import "@/solo/settings.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";

// Applied BEFORE first paint so a frame can never capture the pre-toggle state.
document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");

/**
 * `#tenant-shell-main` is the scroll owner the real shell provides, and
 * `.solo-settings` / `.ss-content` are what this surface's container queries
 * resolve against. Mounting the view bare would leave `container-type: normal`
 * and silently disable every responsive rule, so a layout could be "proven" in a
 * frame where its queries never fired. The page header is the real one from
 * `settings.tsx`, reproduced here so the compact identity is measured too.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main id="tenant-shell-main" style={{ height: "100vh", overflowY: "auto", background: "var(--pg-canvas)" }}>
      <div className="solo-settings">
        <header className="ss-page-head">
          <div>
            <span>Solo settings</span>
            <h1>Integrations</h1>
            <p>External tools, bridges, and safe configuration handoffs.</p>
          </div>
          <span className="ss-truth" data-truth="PARTIAL">PARTIAL</span>
        </header>
        <div className="ss-content" data-settings-tab="integrations">
          <MemoryRouter initialEntries={["/solo/1971670/settings/integrations"]}>
            <Routes>
              <Route path="/solo/:account/settings/:tab" element={<SoloIntegrationsView />} />
            </Routes>
          </MemoryRouter>
        </div>
      </div>
    </main>
  </StrictMode>,
);
