/**
 * Dev-only mount for Settings › Connections › Calendars, so the harness can
 * measure a REAL render of a surface these sessions cannot log into.
 *
 * WHAT IS REAL: the shipped `CalendarsView`, the shipped `useCalendarConnections`,
 * the shipped `connections-calendars.css` and `settings.css`, AND — since the
 * scroll regression of 2026-08-31 — the shipped tenant-shell CSS and the shell's
 * real element chain. Only the Supabase transport and the tenant context are
 * stubbed.
 *
 * The `?host=clipped` mode re-creates the pre-fix SoloApp host (`overflow:hidden`
 * at `height:100%`) so the drive can prove its own check fails when the scroll
 * owner is taken away. A check that cannot fail is not a check.
 *
 * WHY THE CHAIN MATTERS. This file used to fake the shell with an inline
 * `style={{ height: "100vh", overflowY: "auto" }}` on a bare `<main>` that did
 * not even carry `className="tcs-main"`, and never imported the shell stylesheet.
 * That handed the surface a guaranteed-working scroll owner that production does
 * NOT hand it: in the real app `.tcs-main` earns its height from `flex: 1` inside
 * `.tcs-canvas`, itself a stretched item of a `height: 100dvh` grid. A surface
 * that overflows its ancestor is reachable in the fake and unreachable in the
 * real one — so the harness reported a scroll the owner did not have. The chain
 * below mirrors `TenantCommandCenterShell` exactly; do not simplify it back into
 * an inline height.
 *
 * WHAT THIS STILL DOES NOT PROVE (§13/§32.c): a local render is not a deployed
 * one, and the rows are synthetic. It proves GEOMETRY, SCROLL OWNERSHIP and
 * INTERACTION — never production data or production behaviour.
 *
 *   /?theme=dark&data=issues
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CalendarsView } from "@/solo/connections-calendars";
import "@/index.css";
import "@/components/tenant-shell/tenant-command-center-shell.css";
// PRODUCTION ORDER (2026-08-31). `SoloApp` loads solo-tokens.css before it loads
// Settings, so the Solo form-fit law `.paige-solo main{overflow:hidden!important}` is
// live on every real render of this surface. Without it this harness gave the screen
// host a scroll owner from its inline `overflow:auto` that production's cascade
// overrode — so its geometry was measured on a surface nobody ships. Do NOT drop this
// import to make a drive pass.
import "@/solo/solo-tokens.css";
import "@/solo/settings.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";
// Opt-in reproduction of the pre-fix clipped host, so the drive's scroll check
// can be shown to FAIL when the scroll owner is removed.
const clipped = params.get("host") === "clipped";

// Applied BEFORE first paint so a frame can never capture the pre-toggle state.
// The Solo shell keys its palette on data-pg, not on the `dark` class.
document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");

/**
 * The shell's real chain, reproduced:
 *
 *   [data-tenant-shell]  grid, height:100dvh, overflow:hidden
 *     .tcs-nav           the fixed rail
 *     .tcs-canvas        flex column, min-height:0, overflow:hidden
 *       .tcs-command-row the fixed header
 *       main.tcs-main    flex:1, min-height:0, overflow-y:auto  ← the scroll owner
 *
 * `.solo-settings` / `.ss-content` are what the surface's container queries and
 * the sticky sub-navigation resolve against, and `.tcs-main--settings-scrollbar`
 * is what the real Settings surface adds to the scroll owner on mount.
 */
function Harness() {
  return (
    <div data-tenant-shell data-nav="expanded" data-paige="closed">
      <nav className="tcs-nav" aria-label="Tenant workspace">
        <div className="tcs-nav-links" />
      </nav>
      <section className="tcs-canvas">
        <header className="tcs-command-row">
          <div className="tcs-context"><span>Harness</span></div>
        </header>
        <main id="tenant-shell-main" className="tcs-main tcs-main--settings-scrollbar">
          {/*
            SoloApp's own wrapper, reproduced. Every Solo screen renders inside
            `.paige-solo` > a flex row > a screen host whose overflow depends on
            whether the route is in SoloApp's `full` set. Settings is NOT in that
            set: it is a document flow, so its host scrolls. Leaving this wrapper
            out is what let a clipped surface measure as healthy.
          */}
          <div className="paige-solo" data-theme={theme} style={{ height: "100%", minHeight: 0 }}>
            <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
              <main
                data-solo-screen-host
                style={{ flex: 1, overflow: clipped ? "hidden" : "auto", minHeight: 0, minWidth: 0 }}
              >
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
            </div>
          </div>
        </main>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
