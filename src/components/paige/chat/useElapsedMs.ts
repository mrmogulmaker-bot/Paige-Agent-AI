// Shared elapsed-time clock for Paige's chat surfaces (§18 one home). Promoted out of
// StudioBuildingScreen so the thinking indicator, the Studio build cutscene, and every chat
// surface import ONE implementation instead of duplicating a timer (StudioBuildingScreen now
// re-exports this for its existing callers).
//
// Returns ms since `active` last flipped true; resets to 0 whenever it goes false. HONEST (§13):
// it measures wall-clock time actually spent, never a fabricated percentage. Callers that must be
// motion-safe pass `active && !reduce` (a rapidly-updating counter is motion) so the interval never
// runs — and the label falls back to a static string — under `prefers-reduced-motion`.
import { useEffect, useState } from "react";

/**
 * ms elapsed since `active` last became true (0 while inactive). Ticks on `tickMs` (default 250ms)
 * so a whole-seconds line updates promptly without a busy loop.
 */
export function useElapsedMs(active: boolean, tickMs = 250): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) {
      setMs(0);
      return;
    }
    const start = Date.now();
    setMs(0);
    const id = window.setInterval(() => setMs(Date.now() - start), Math.max(50, tickMs));
    return () => window.clearInterval(id);
  }, [active, tickMs]);
  return ms;
}

export default useElapsedMs;
