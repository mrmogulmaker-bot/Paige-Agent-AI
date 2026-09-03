// rescanBusinessContext — the ONE place Setup asks Systems Check to re-run the checks its own
// fields feed (§18). Setup owns the business facts and save behavior; this fires the EXISTING
// change-triggered re-check (systems-check-run-change, already JWT-scoped and tenant-safe — no
// new edge function or migration needed) for the three checks that read website/business_phone/
// industry, so a Setup save produces a fresh, correct persisted finding without the tenant having
// to wait for the next scheduled sweep.
//
// Fire-and-forget by design (§13): a rescan failure must NEVER surface as a Setup save failure —
// Setup's own save already succeeded and returned its own honest result before this runs. Each
// call is independently caught and logged; one surface failing never blocks the other two.
import { supabase } from "@/integrations/supabase/client";

// Surfaces that read website / business_phone / industry (matches SURFACE_TO_RUNNERS in
// supabase/functions/systems-check-run-change/index.ts — kept in sync by hand since the map
// lives server-side; a rename there without a matching rename here degrades to a harmless
// "unknown_surface" 400 that this helper already swallows, never a broken Setup save).
const BUSINESS_CONTEXT_SURFACES = ["website", "company_info", "comms"] as const;

/** Best-effort: re-run the Systems Check surfaces that read Setup's website/phone/industry, for
 *  the CALLER'S OWN tenant (the edge function derives tenant from the caller's verified JWT —
 *  this never accepts or forwards a tenant id, §9/§588). Never throws — including synchronously,
 *  which a bare `.invoke(...).catch(...)` would NOT guard against (a throw before the promise
 *  chain starts skips every `.then`/`.catch` on it), so each call is wrapped in its own try. */
export function rescanBusinessContext(): void {
  for (const surface of BUSINESS_CONTEXT_SURFACES) {
    try {
      void supabase.functions
        .invoke("systems-check-run-change", { body: { changed_surface: surface } })
        .then(({ error }) => {
          if (error) console.warn(`[rescanBusinessContext] ${surface} rescan failed:`, error.message ?? error);
        })
        .catch((caught: unknown) => {
          console.warn(`[rescanBusinessContext] ${surface} rescan threw:`, caught);
        });
    } catch (caught) {
      console.warn(`[rescanBusinessContext] ${surface} rescan threw synchronously:`, caught);
    }
  }
}
