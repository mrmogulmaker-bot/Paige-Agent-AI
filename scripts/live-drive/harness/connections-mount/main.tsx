/**
 * Dev-only mount for Settings › Connections › Calendars, so the harness can
 * measure a REAL render of a surface these sessions cannot log into.
 *
 * WHAT IS REAL: the shipped `CalendarsView`, the shipped `useCalendarConnections`
 * (including its readiness scoping and host grouping), the shipped
 * `connections-calendars.css` and `settings.css`, against the app's real `--pg`
 * tokens. Only the Supabase transport and the tenant context are stubbed.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one, and
 * the rows are synthetic. It proves GEOMETRY, SCROLL OWNERSHIP and INTERACTION —
 * never production data or production behaviour.
 *
 *   /?theme=dark&data=issues
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CalendarsView } from "@/solo/connections-calendars";
import "@/index.css";
import "@/solo/settings.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";

// Applied BEFORE first paint so a frame can never capture the pre-toggle state.
// The Solo shell keys its palette on data-pg, not on the `dark` class.
document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");

/**
 * `#tenant-shell-main` is the scroll owner the real shell provides, and
 * `.solo-settings` / `.ss-content` are what the surface's container queries and
 * the sticky sub-navigation resolve against. Mounting the view bare would leave
 * `container-type: normal` and silently disable every responsive rule, so a
 * layout could be "proven" in a frame where its queries never fired.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main id="tenant-shell-main" style={{ height: "100vh", overflowY: "auto", background: "var(--pg-canvas)" }}>
      <div className="solo-settings">
        <header className="ss-page-head">
          <div>
            <span>Solo settings</span>
            <h1>Connections</h1>
            <p>Communications owns whether a message can send. Calendars owns scheduling, links, routing and notification rules.</p>
          </div>
        </header>
        <div className="ss-content" data-settings-tab="connections">
          <div className="ss-subnav">
            <span className="ss-subnav-here">Connections</span>
            <div className="ss-segment" role="tablist" aria-label="Connection organization">
              {["Communications", "Calendars", "Health", "Available"].map((k) => (
                <button key={k} role="tab" aria-selected={k === "Calendars"}>{k}</button>
              ))}
            </div>
          </div>
          <MemoryRouter initialEntries={["/solo/1971670/settings/connections"]}>
            <Routes>
              <Route path="/solo/:account/settings/:tab" element={<CalendarsView />} />
            </Routes>
          </MemoryRouter>
        </div>
      </div>
    </main>
  </StrictMode>,
);
