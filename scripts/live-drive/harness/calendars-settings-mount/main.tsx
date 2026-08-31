/**
 * Settings › Connections › CALENDARS, driven inside the REAL merged `SoloApp`.
 *
 * WHY THE REAL APP AND NOT A REPRODUCTION OF IT
 *
 * The first version of this file hand-built the shell chain and mounted
 * `SoloSettings` straight into `<main id="tenant-shell-main">`. It called that
 * "the shipped containment chain, attribute for attribute". It was not: it
 * omitted `.paige-solo`, the `overflow: hidden` flex row, and — decisively —
 * `SoloApp`'s own screen host, which is the element that actually scrolls
 * Settings. Because the host was missing, `#tenant-shell-main` overflowed in the
 * harness and the drive measured a scroll owner the app does not use. That is
 * how a 112/112 result was produced for a surface whose real defect the harness
 * could not even express.
 *
 * A reproduction is a claim about the app that has to be re-verified every time
 * the app moves — and it moved (#681 took `settings` out of `SoloApp`'s `full`
 * set and made the screen host the scroll owner) while that claim sat in a
 * comment saying otherwise. So this harness no longer reproduces anything. It
 * mounts the REAL `SoloApp`, exactly as `src/solo-drive-entry.tsx` does, and the
 * chain under measurement is the shipped one BY CONSTRUCTION: `.paige-solo`, the
 * flex row, `[data-solo-screen-host]` with its real `full`-derived overflow, the
 * real `TenantCommandCenterShell`, and the real route resolution.
 *
 * WHAT IS STILL SUBSTITUTED, and nothing else: the Supabase transport and the
 * tenant context — the two seams a local mount genuinely cannot supply. Every
 * component, hook, effect, route and stylesheet under measurement is shipped
 * code. `SoloApp` reads `useParams().account` and the splat, so it is mounted
 * under the same `/solo/:account/*` route `App.tsx` gives it.
 *
 * WHAT THIS DOES NOT PROVE (§13/§32.c): a local render is not a deployed one and
 * the rows are synthetic. It proves SCROLL OWNERSHIP, REACHABILITY and GEOMETRY
 * against the real component tree. The owner's acceptance on the deployed route
 * remains owed and is never claimed here.
 *
 *   /?theme=dark
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantProvider } from "@/hooks/useTenantContext";
import SoloApp from "@/solo/SoloApp";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "light" ? "light" : "dark";

/**
 * Which Solo route to mount. Settings is the default because that is the surface
 * under repair, but the LOCKED surfaces have to be drivable through this same
 * harness — proving Settings scrolls is only half the owner's policy, and the
 * other half (clients, growth and compass stay form-fitting) cannot be proven in
 * a harness that can only render Settings.
 *
 * These are URL SLUGS, resolved by `branchBySlug` exactly as the app resolves
 * them (`trust-compass` is the slug; `compass` is the internal key).
 */
const ROUTES: Record<string, string> = {
  settings: "/solo/1971670/settings/connections?segment=calendars",
  "settings-setup": "/solo/1971670/settings/setup",
  "settings-integrations": "/solo/1971670/settings/integrations",
  "settings-notifications": "/solo/1971670/settings/notifications",
  "settings-billing": "/solo/1971670/settings/billing",
  "settings-team": "/solo/1971670/settings/team",
  "settings-vault": "/solo/1971670/settings/vault",
  "settings-security": "/solo/1971670/settings/security-data",
  clients: "/solo/1971670/clients",
  growth: "/solo/1971670/growth",
  compass: "/solo/1971670/trust-compass",
};
const routeKey = params.get("route") ?? "settings";
const entry = ROUTES[routeKey] ?? ROUTES.settings;

document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");

// `retry: false` so a query that cannot reach a backend fails once and renders
// its real error/empty state instead of retrying behind the drive.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <TenantProvider>
        {/* `SoloApp` reads `useParams().account` and the splat to resolve its route,
            so it is mounted under the same `/solo/:account/*` pattern `App.tsx`
            gives it. `useSubtabRoute` derives the Settings destination from the
            splat parts, not a `:tab` param — a `/settings/:tab` route would render
            happily and resolve every destination to the DEFAULT, measuring Setup
            while claiming to measure Calendars. */}
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/solo/:account/*" element={<SoloApp />} />
          </Routes>
        </MemoryRouter>
      </TenantProvider>
    </QueryClientProvider>
  </StrictMode>,
);
