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
 * THE SIGNAL IS REAL ACTION STATE, NOT A GUESS (§36/§13). `isPaigeActive` is true
 * iff at least one §16 department has an open (non-terminal) action routed to it —
 * the SAME derivation the Command Center's `PaigeDepartmentStatus` uses for its
 * `activeCount` (`departments.some(d => d.openCount > 0)`). So "the rail is gone"
 * genuinely means "Paige is idle," never a timer or a heuristic.
 *
 * §51 TIER-SAFE BY INHERITANCE: the underlying `usePaigeDeptStatus` read is already
 * RLS-tenant-scoped with NO client-supplied tenant_id — God→fleet, tenant→own book,
 * sub-account→own book (never the parent aggregate), Client/Anonymous→0 rows. So
 * this flag is correct per tier automatically; mount correctness inherits it.
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
 * @returns `true` iff Paige currently has at least one open department action
 *   (the tier-scoped, RLS-safe live work signal). `false` while loading or idle —
 *   an unconfigured/empty book reads as idle (§13: no fabricated "active").
 */
export function useIsPaigeActive(): boolean {
  const { departments } = usePaigeDeptStatus();
  return useMemo(
    () => departments.some((d) => d.openCount > 0),
    [departments],
  );
}
