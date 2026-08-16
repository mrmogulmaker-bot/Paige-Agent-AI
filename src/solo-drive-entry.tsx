// Dev-only §32.c render-verification harness entry — mounts the REAL merged <SoloApp/>
// (src/solo) so a headless Playwright drive (scripts/live-drive/solo-shell-drive.mjs) can walk
// every fixture screen with zero auth/backend/tenant. Served ONLY by the Vite dev server via
// solo-drive.html; it is NOT in the production build inputs (vite builds index.html only) and is
// never a reachable route in the app.
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantProvider } from "@/hooks/useTenantContext";
import SoloApp from "./solo/SoloApp";

// SoloApp now calls useNavigate() (account menu → /admin/setup, sign-out), which REQUIRES a
// Router ancestor. In production it mounts inside App.tsx's <BrowserRouter>; the bare harness must
// supply its own so the §32 smoke can mount the real merged shell. MemoryRouter keeps navigation
// inert (no URL bar) — navigate() targets just no-op here, which is correct for a render smoke.
//
// The Command Center HOME tab is now wired to REAL data via react-query hooks
// (useCommandCenter → usePracticeDashboard/usePendingApprovals) + useTenantContext.
// Those THROW without a QueryClientProvider / TenantProvider ancestor, so the harness
// supplies both. There is NO auth/supabase session here, so every query errors or
// returns empty — EXPECTED (§13): the point of this smoke is to confirm the wired
// screen degrades to its loading/empty states without crashing, not to show live rows.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const el = document.getElementById("root");
if (el) createRoot(el).render(
  <QueryClientProvider client={client}>
    <TenantProvider>
      <MemoryRouter>
        <SoloApp />
      </MemoryRouter>
    </TenantProvider>
  </QueryClientProvider>,
);
