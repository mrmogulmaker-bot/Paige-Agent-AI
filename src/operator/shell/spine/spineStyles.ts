/**
 * The two button faces the spine spends, ported from `v3.dc.html` L10645–L10646.
 *
 * THE ACT (`actBtn`, L10645) — the only gold in the spine. A lit top edge over a
 * gold-core → gold → gold-fill ramp, on `--pg-gold-deep`. §11: gold is spent on the act and
 * nowhere else, which in this column means exactly one control, `Send`, plus the act a turn
 * carries when Paige proposes one. Its ink is the pack's literal `#17120c` — the one raw hex
 * in the pack, already ported verbatim elsewhere in the console (`ComposeOutbound`,
 * `CalendarFieldSurface`, `MarketplaceSubmissionsSurface`) and kept the same here so the act
 * reads identically across surfaces.
 *
 * THE QUIET PLATE (`quietBtn`, L10646) — a hairline plate carrying `--pg-lift-1`.
 *
 * ELEVATION CORRECTION, applied and recorded (§13). The pack writes `background:
 * var(--pg-surface)` on the quiet plate. Elevation is distance from `--pg-env`, and a plate
 * carrying `--pg-lift-1` RISES, so the standing rule — rises → `--pg-raised` in both themes,
 * recedes → `--pg-surface` — puts this on `--pg-raised`. Measured relative luminance of the
 * ladder, so the correction is arithmetic rather than taste:
 *
 *   dark   env .0023 · spine .0056 · surface .0087 · raised .0135
 *   light  env .7852 · spine .8568 · surface .8897 · raised .9829
 *
 * On the spine ground `--pg-surface` does not invert (it is further from `env` than `spine` in
 * BOTH themes), so the pack's own value is not the light-mode defect that produced the rule —
 * but `--pg-raised` is what a rising plate takes, and the two header controls in this same
 * column already carry `--pg-raised` + `--pg-lift-1` in the pack itself (L3844, L3851). Using
 * one token for one role across the column is the reason for the change; no value moved.
 */
import type { CSSProperties } from "react";

/** `actBtn` — L10645. `minHeight` is overridden per call site (the pack does the same). */
export const ACT_BUTTON: CSSProperties = {
  minHeight: "34px",
  padding: "0 15px",
  borderRadius: "var(--pg-r-chip)",
  border: "1px solid var(--pg-gold-deep)",
  background: "linear-gradient(180deg,var(--pg-gold-core),var(--pg-gold) 42%,var(--pg-gold-fill))",
  color: "#17120c",
  fontWeight: 600,
  fontSize: "var(--pg-t-body)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,.5),0 1px 2px rgba(0,0,0,.3),0 6px 16px -6px rgba(0,0,0,.5)",
};

/** `quietBtn` — L10646, with the elevation correction above. */
export const QUIET_BUTTON: CSSProperties = {
  minHeight: "34px",
  padding: "0 13px",
  borderRadius: "var(--pg-r-chip)",
  border: "1px solid var(--pg-line)",
  background: "var(--pg-raised)",
  color: "var(--pg-ink-2)",
  fontWeight: 500,
  fontSize: "var(--pg-t-body)",
  boxShadow: "var(--pg-lift-1)",
};
