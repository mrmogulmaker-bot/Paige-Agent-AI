// Dev-only §32.c render-verification harness entry — mounts the REAL merged <SoloApp/>
// (src/solo) so a headless Playwright drive (scripts/live-drive/solo-shell-drive.mjs) can walk
// every fixture screen with zero auth/backend/tenant. Served ONLY by the Vite dev server via
// solo-drive.html; it is NOT in the production build inputs (vite builds index.html only) and is
// never a reachable route in the app.
import { createRoot } from "react-dom/client";
import SoloApp from "./solo/SoloApp";

const el = document.getElementById("root");
if (el) createRoot(el).render(<SoloApp />);
