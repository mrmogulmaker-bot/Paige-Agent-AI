/**
 * The Marketplace vocabulary — kinds, publisher classes, and the outside-publisher ruling.
 *
 * PORTED VERBATIM from the pack's own contract file,
 * `docs/design-references/cd-packs/super-admin-shell-v3/paige-ia.js`:
 *   `P.MARKET.kinds`    L1043-L1049  (five kinds: glyph + note)
 *   `P.MARKET.classes`  L1051-L1056  (four publisher classes: label, note, split, trust)
 *   `P.OUTSIDE_KINDS`   L1183        (what an outside publisher may ship, by kind)
 * Transcribed in `PORT-SPEC-palette-and-six-surfaces.md` §4 ("Marketplace submissions").
 *
 * It lives in its own module rather than inside one surface because four Marketplace views
 * (Storefront, Catalog, Submissions, Publishers) read the same five kinds and the same four
 * classes — §18, one home for a vocabulary, so a second surface extends this instead of
 * forking a near-identical copy.
 *
 * STRUCTURE IS DESIGN, VALUES ARE DATA (`src/operator/CLAUDE.md`). Every glyph path, note,
 * class label, split string and ruling value below is authored design and comes over exactly.
 * No submission RECORD lives here — `P.SUBMISSIONS` is fixture data (three invented listings)
 * and is not ported (§13).
 */
import type { CSSProperties } from "react";

/** `P.MARKET.kinds` keys — `paige-ia.js` L1044-L1048. */
export type SubmissionKind = "Skill" | "Automation" | "Integration" | "Template" | "Agent";

/** `P.MARKET.classes` keys — `paige-ia.js` L1052-L1055. */
export type PublisherClass = "Platform" | "Agency" | "Solo" | "Unverified";

/** The five states `tone()` discriminates — L9516-L9520 / L9584-L9588. */
export type SubmissionState =
  | "Submitted" | "In review" | "Changes requested" | "Approved" | "Rejected";

/** A check's third tuple slot — `pass` / `fail` / anything else reads "could not run" (L9625). */
export type CheckResult = "pass" | "fail" | "unrun";

/** A manifest row's third tuple slot — `ok` / `need` / anything else reads "missing" (L9629). */
export type ManifestResult = "ok" | "need" | "missing";

export type MarketKind = { readonly glyph: string; readonly note: string };

/** `P.MARKET.kinds` — `paige-ia.js` L1043-L1049, verbatim. */
export const MARKET_KINDS: Readonly<Record<SubmissionKind, MarketKind>> = {
  Skill: {
    glyph: "M8 2.4l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.8l-3.8 2 .7-4.3-3.1-3 4.3-.6z",
    note: "A named procedure she runs when asked",
  },
  Automation: {
    glyph: "M3 8a5 5 0 0 1 5-5 M13 8a5 5 0 0 1-5 5 M8 3V1.4 M8 14.6V13 M6.4 8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0",
    note: "Runs on its own, under a grant",
  },
  Integration: {
    glyph: "M6 10L4.2 11.8a2.6 2.6 0 0 1-3.6-3.6L2.4 6.4 M10 6l1.8-1.8a2.6 2.6 0 0 1 3.6 3.6L13.6 9.6 M6.2 9.8l3.6-3.6",
    note: "Connects an outside account",
  },
  Template: {
    glyph: "M2.6 3.4h10.8v9.2H2.6z M2.6 6.4h10.8 M6 6.4v6.2",
    note: "A configured pipeline, form or portal",
  },
  Agent: {
    glyph: "M4.6 6.4h6.8v5.2H4.6z M8 6.4V4.2 M6.4 8.8h.01 M9.6 8.8h.01 M2.6 8.4h2 M11.4 8.4h2",
    note: "A sub-agent with one job",
  },
};

export type MarketClass = {
  readonly label: string;
  readonly note: string;
  readonly split: string;
  readonly trust: string;
};

/**
 * `P.MARKET.classes` — `paige-ia.js` L1051-L1056, verbatim.
 * The pack's own comment: "A publisher class is a ceiling on reach, and the revenue split is
 * a term of the class."
 */
export const MARKET_CLASSES: Readonly<Record<PublisherClass, MarketClass>> = {
  Platform: { label: "Platform", note: "First party · no review", split: "100% retained", trust: "var(--pg-positive)" },
  Agency: { label: "Verified agency", note: "Reviewed for anything beyond its own sub-accounts", split: "70 / 30", trust: "var(--pg-gold-deep)" },
  Solo: { label: "Solo", note: "Private freely · review for anything wider", split: "60 / 40", trust: "var(--pg-gold-deep)" },
  Unverified: { label: "Unverified", note: "Own workspace only · cannot sell", split: "—", trust: "var(--pg-faint)" },
};

/**
 * `P.OUTSIDE_KINDS` — `paige-ia.js` L1183, verbatim, with the pack's own comment:
 * "A template is configuration and a skill composes what she already does; an agent or an
 * integration is arbitrary behaviour against a client's data, so both stay platform-only
 * until a security review exists."
 */
export const OUTSIDE_KINDS: Readonly<Record<SubmissionKind, true | false | "review">> = {
  Template: true,
  Skill: true,
  Automation: "review",
  Integration: false,
  Agent: false,
};

/** `tone(st)` — L9516-L9520 (queue) and L9584-L9588 (slide-over); the same five arms. */
export function stateTone(state: string): string {
  switch (state) {
    case "In review": return "var(--pg-violet)";
    case "Submitted": return "var(--pg-gold-deep)";
    case "Changes requested": return "var(--pg-warning)";
    case "Approved": return "var(--pg-positive)";
    case "Rejected": return "var(--pg-negative)";
    default: return "var(--pg-faint)";
  }
}

/** `cTone(r)` — L9521 / L9589. */
export function checkTone(result: string): string {
  if (result === "pass") return "var(--pg-positive)";
  if (result === "fail") return "var(--pg-negative)";
  return "var(--pg-faint)";
}

export type KindMark = {
  readonly glyph: string;
  readonly hue: string;
  readonly wrapStyle: CSSProperties;
  readonly rimStyle: CSSProperties;
  readonly svgStyle: CSSProperties;
};

/**
 * `kindMark(kind, px, live)` — L9486-L9504, verbatim geometry.
 *
 * ELEVATION (Claude Design ruling, 2026-08-23 — elevation is distance from `--pg-env`): the
 * pack's base fill under the radial gradient is `--pg-surface`, which sits ABOVE canvas in dark
 * and BELOW it in light. The plaque RISES — it carries `--pg-lift-1` and sits on top of the
 * card — so it paints `--pg-raised` in both themes. Nothing else about the mark moves.
 */
export function kindMark(
  kind: SubmissionKind,
  px: number,
  live: boolean,
  reduce: boolean,
): KindMark {
  const k = MARKET_KINDS[kind] ?? MARKET_KINDS.Skill;
  const hue = "var(--k-" + kind.toLowerCase() + ")";
  return {
    glyph: k.glyph,
    hue,
    wrapStyle: {
      position: "relative", flex: "none", display: "grid", placeItems: "center",
      width: px + "px", height: px + "px", borderRadius: Math.round(px * 0.29) + "px",
      background:
        "radial-gradient(120% 120% at 50% 8%, color-mix(in srgb, " + hue +
        " 26%, transparent), transparent 70%), var(--pg-raised)",
      boxShadow:
        "inset 0 1px 0 color-mix(in srgb, " + hue + " 40%, transparent), " +
        "inset 0 0 0 1px color-mix(in srgb, " + hue + " 22%, transparent), var(--pg-lift-1)",
      color: hue,
    },
    rimStyle: {
      position: "absolute", inset: Math.max(2, Math.round(px * 0.09)) + "px",
      borderRadius: Math.round(px * 0.2) + "px",
      boxShadow: "inset 0 0 0 1px color-mix(in srgb, " + hue + " 14%, transparent)",
      opacity: live ? 1 : 0.55, pointerEvents: "none",
      animation: live && !reduce ? "pg-glow 3.4s ease-in-out infinite" : "none",
    },
    svgStyle: {
      position: "relative",
      width: Math.round(px * 0.46) + "px",
      height: Math.round(px * 0.46) + "px",
    },
  };
}
