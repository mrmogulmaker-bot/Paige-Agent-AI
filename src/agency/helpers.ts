// @ts-nocheck
// Agency pack — shared PURE render-logic helpers the fixtures pass deferred.
// Faithful port of the two small view-logic fns grepped out of the Claude Design
// "CRM agency mode" pack ("Agency Shell.dc.html", lines 6371 + 6379), owner-locked
// 2026-08-17 (§28/§63: "We do not drift off this whatsoever"). Ported VERBATIM.
//
// These are NOT fixture data and NOT in _shared — spark (sparkline point generator)
// and pstr (SVG points-attribute string builder) are the presentational math the
// KPI sparklines draw with. Everything already exported by "./_shared"
// (AV / loadColor / utilColor / LBL / TONE) or "./fixtures" (GOLD/GREEN/… + the
// 127 data consts) is intentionally NOT re-defined here (§18 one home).

// spark(seed, up) — deterministic 9-point sparkline path. `up` biases a rising
// trend; otherwise a gentle sine wobble. Returns [[x,y], …] with x on an 11px
// pitch and y clamped to the 3..23 band. Verbatim from Agency Shell.dc.html:6371.
export function spark(seed, up) {
  const pts = [];
  for (let i = 0; i < 9; i++) {
    const base = up ? 20 - i * 1.8 : 12 + Math.sin(seed + i) * 4;
    pts.push([i * 11, Math.max(3, Math.min(23, base + Math.sin(seed * (i + 1)) * 2.6))]);
  }
  return pts;
}

// pstr(pts) — turns spark()'s [[x,y], …] into an SVG polyline/polygon `points`
// string ("x,y x,y …"), y rounded to 1dp. Verbatim from Agency Shell.dc.html:6379.
export const pstr = pts => pts.map(p => p[0] + "," + p[1].toFixed(1)).join(" ");
