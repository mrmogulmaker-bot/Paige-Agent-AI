/**
 * useIsPaigeActive — the SINGLE SOURCE OF TRUTH (§18 one home) for the boolean
 * question "does Paige have active, open work RIGHT NOW?" A thin, pure wrapper over
 * {@link usePaigeDeptStatus} that collapses the per-department status into one flag.
 *
 * WHY A DEDICATED HOOK (§18): several surfaces want the same yes/no signal (the
 * hide-when-idle presence rail today; a future "Paige is working" ambient badge
 * tomorrow) without each re-deriving the `some(openCount > 0)` reduction off the
 * dept-status rows. This is that one home. Kept intentionally pure/thin, exactly
 * like `useTierFeatures` — no new query, no new store, no side effects.
 *
 * WHAT THE SIGNAL IS (§36/§13). This is the presence rail's MOUNT signal: true iff
 * at least one §16 department currently has an open (non-terminal) action routed to
 * it. It is derived from real action state — the SAME `departments.some(d =>
 * d.openCount > 0)` reduction the Command Center's `PaigeDepartmentStatus` uses for
 * its `activeCount` (shared derivation; not the only copy). It is NOT a timeout/
 * idle-heuristic — the rail hides because Paige has no open work, not because a timer
 * elapsed. Its FRESHNESS comes from `usePaigeDeptStatus`, which keeps the snapshot
 * live via a ~15s poll + refetch-on-window-focus (paige_actions is not in the
 * realtime publication — see that hook's header), so the flag tracks work starting
 * and clearing within ~15s (or immediately on tab focus), not just at page-load.
 *
 * §51 TIER-SAFE BY INHERITANCE: the underlying `usePaigeDeptStatus` read is already
 * RLS-tenant-scoped with NO client-supplied tenant_id — God→fleet, tenant→own book,
 * sub-account→own book (never the parent aggregate), Client/Anonymous→0 rows. So
 * this flag is correct per tier automatically; mount correctness inherits it.
 *
 * §39 OPERATOR-TIER NOTE (behavioral, not a bug): God/Super-Admin resolves FLEET-WIDE,
 * so across all tenants `openCount > 0` is ~always true → the rail rarely hides for
 * the operator tier. That's acceptable — an operator usually HAS active fleet work —
 * and is called out here so a future reader isn't surprised the hide-when-idle rail
 * effectively stays docked on the God console.
 *
 * FUTURE UNION (documented seam, NOT built here — out of scope §13): when a
 * centralized chat-streaming signal exists ("Paige is mid-reply in the rail right
 * now"), it would be UNIONED here — `isPaigeActive = hasOpenDeptWork || isStreaming`
 * — keeping this the ONE place every consumer reads. Today that streaming state is
 * per-surface-local and NOT centralized, so wiring a new streaming store now would
 * be premature scaffolding. Left as a comment, deliberately.
 */
import { useMemo } from "react";
import { usePaigeDeptStatus } from "@/hooks/usePaigeDeptStatus";

/**
 * @returns `true` iff, as of the latest live snapshot (~15s poll + focus refetch),
 *   Paige has at least one open department action (the tier-scoped, RLS-safe work
 *   signal). `false` while loading or idle — an unconfigured/empty book reads as idle
 *   (§13: no fabricated "active").
 */
export function useIsPaigeActive(): boolean {
  const { departments } = usePaigeDeptStatus();
  return useMemo(
    () => departments.some((d) => d.openCount > 0),
    [departments],
  );
}
