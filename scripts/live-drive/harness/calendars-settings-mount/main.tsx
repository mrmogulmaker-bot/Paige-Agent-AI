/**
 * Settings › Connections › CALENDARS, mounted inside the REAL shell containment
 * chain, so a session that cannot log in still measures what a human scrolls.
 *
 * WHY THIS EXISTS ALONGSIDE `connections-mount`
 *
 * The sibling harness proves the Calendars VIEW. It does so inside a scroll
 * owner it invents:
 *
 *     <main id="tenant-shell-main" style={{ height: "100vh", overflowY: "auto" }}>
 *
 * That container is not the one the app ships, and every difference makes the
 * page easier to scroll in the harness than in production:
 *
 *   · The real owner is `.tcs-main` — `flex: 1` inside `.tcs-canvas`, BELOW a
 *     `.tcs-command-row` with `min-height: 66px`. Real content height is ~66px
 *     LESS than 100vh, so the invented owner under-reports the scroll distance.
 *   · The real ancestors `[data-tenant-shell]` (`height: 100dvh; overflow:
 *     hidden`) and `.tcs-canvas` (`overflow: hidden`) are exactly the elements
 *     that can trap a scroll. A bare mount has neither.
 *   · The real owner carries `overscroll-behavior: contain`.
 *   · `SoloSettings` adds `tcs-main--settings-scrollbar-hidden` to the owner on
 *     mount, which sets `scrollbar-width: none`. A harness that mounts
 *     `CalendarsView` directly never runs that effect, so it measures a page
 *     WITH a scrollbar that ships WITHOUT one.
 *
 * A surface can therefore pass in the bare mount and be unusable in the app.
 * That is the exact false claim the owner disproved on First Sterling, so this
 * mount reproduces the shipped chain instead and renders the real `SoloSettings`
 * so the real effects run.
 *
 * WHAT IS REAL: the shipped `SoloSettings`, the shipped `CalendarsView`, the
 * shipped `useCalendarConnections`, the shipped shell CSS and `settings.css`, and
 * the app's real `--pg` tokens. Only the Supabase transport and the tenant
 * context are stubbed, and both are reused from the sibling harness so the data
 * contract under measurement is identical.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one and
 * the rows are synthetic. It proves SCROLL OWNERSHIP, REACHABILITY and GEOMETRY.
 * The owner's acceptance on the deployed route remains owed.
 *
 *   /?theme=dark&data=dense
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SoloSettings } from "@/solo/settings";
import "@/index.css";
import "@/components/tenant-shell/tenant-command-center-shell.css";
import "@/solo/settings.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";

document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* The shipped containment chain, attribute for attribute. `data-tenant-shell`
        is what the shell stylesheet keys on; without it none of the overflow,
        scrollbar or focus rules apply. */}
    <div data-tenant-shell data-nav="expanded" data-paige="closed" data-reduced-motion="false">
      <nav className="tcs-nav" aria-label="Tenant workspace" />
      <section className="tcs-canvas">
        <header className="tcs-command-row">
          <div className="tcs-context">
            <span>Harness workspace</span><strong>Settings</strong><small>Solo</small>
          </div>
        </header>
        <main id="tenant-shell-main" className="tcs-main">
          {/* SPLAT: `useSubtabRoute` derives the destination from the splat parts,
              not from a `:tab` param. A `/settings/:tab` route renders happily and
              resolves every destination to the DEFAULT, so the harness would
              measure Setup while claiming to measure Calendars. */}
          <MemoryRouter initialEntries={["/solo/1971670/settings/connections?segment=calendars"]}>
            <Routes>
              <Route path="/solo/:account/*" element={<SoloSettings />} />
            </Routes>
          </MemoryRouter>
        </main>
      </section>
    </div>
  </StrictMode>,
);
