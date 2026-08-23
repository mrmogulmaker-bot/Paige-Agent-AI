/**
 * The canvas's measured width, which the pack carries as `s.canvasW` and reads at 520 (the
 * geometry chips collapse to one) and 700 (the slide-over goes full width and docks to the
 * bottom) — `PAIGE Super Admin Shell v3.dc.html` L11005, L11056, L11061.
 *
 * `ResizeObserver` is guarded: jsdom does not implement it, and a shell that throws in a test
 * environment is a worse defect than an unmeasured breakpoint. The 900 fallback is the pack's
 * own (`s.canvasW || 900`).
 */
import { useEffect, useRef, useState } from "react";

export function useCanvasWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width || 900);
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width || 900);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
