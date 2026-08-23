/**
 * Marketplace → Submissions — the review queue, and the submission slide-over it opens.
 *
 * PORTED from `docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell
 * v3.dc.html`, transcribed in `PORT-SPEC-palette-and-six-surfaces.md` §4:
 *   §4.1  queue markup                L2281-L2326
 *   §4.2  `subsVals`                  L9506-L9572
 *   §4.3  the verbatim strings
 *   §4.4  slide-over markup           L3319-L3393   ·  `reviewVals` L9576-L9652
 *         `kindMark`                  L9486-L9504   (in `marketplaceVocabulary.ts`)
 *         `SUMMONS.review` header     `paige-ia.js` L66
 *         `P.OUTSIDE_KINDS` ruling    `paige-ia.js` L1180-L1183
 * Route gate in the pack: `s.dest === 'marketplace' && viewName === 'Submissions'` (L10926).
 *
 * STRUCTURE IS DESIGN, VALUES ARE DATA (`src/operator/CLAUDE.md`). Every filter-chip label,
 * row template, check tag, manifest tag, scope-cell key, section label, decision label and
 * decision note comes over exactly as authored. NOT ONE FIGURE DOES: `P.SUBMISSIONS`
 * (`paige-ia.js` L1135-L1178) is three invented listings and every derived number on this
 * surface — the five chip counts, the clock, `{n} of {n} pass`, `{n} waiting`, `{has} → {wants}`
 * — is computed from those three records. They are not here. A surface handed `null` shows the
 * structure with `—` where a figure belongs; handed a real (possibly empty) read it computes
 * the same figures the pack does, from the read (§13).
 *
 * TYPE LADDER. The console runs the owner's four-step ladder (11 / 13 / 16 / 21,
 * `src/index.css`), which the pack's own 9.5-15px steps are collapsed onto — that collapse is
 * already recorded in `index.css` as an honest discrepancy. The mapping used here:
 *   pack  9.5 · 10 · 10.5 · 11 · 11.5  ->  --pg-t-label (11px)
 *   pack 12 · 12.5 · 13               ->  --pg-t-body  (13px)
 *   pack 15                           ->  --pg-t-lead  (16px)
 *
 * ELEVATION (Claude Design ruling, 2026-08-23 — elevation is distance from `--pg-env`).
 * `--pg-surface` sits ABOVE canvas in dark and BELOW it in light, so its ROLE inverts between
 * themes. A plate that RISES paints `--pg-raised` in both themes; `--pg-surface` is kept for
 * regions that recede. On this surface: the submission CARD rises (it carries `--pg-rim` +
 * `--pg-lift-1` and lifts to `--pg-lift-2` on hover) -> `--pg-raised`. The kind PLAQUE rises off
 * the card -> `--pg-raised` (in `kindMark`). Everything else keeps the token the pack gave it:
 * the filter chips are border-only controls over `--pg-lift`, and the slide-over's check and
 * manifest rows are a hairline-gap list on `--pg-workspace`, which is the scroll-region token
 * and neither of the two that invert.
 *
 * WHAT THIS COMPONENT DOES NOT DECIDE. A decision (`Approve` / `Request changes` / `Keep at …`
 * / `Reject`) is handed UP through `onDecide` with the state and the pack's own announcement
 * string. The pack writes it to local component state (L9605); nothing here pretends a review
 * persisted (§13). Whoever wires the surface owns the write.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { useReducedMotion } from "framer-motion";

import {
  MARKET_CLASSES,
  OUTSIDE_KINDS,
  checkTone,
  kindMark,
  stateTone,
  type CheckResult,
  type ManifestResult,
  type PublisherClass,
  type SubmissionKind,
  type SubmissionState,
} from "@/operator/surfaces/marketplaceVocabulary";

/** `[name, note, result]` — `paige-ia.js` L1144-L1148, the check tuple shape. */
export type SubmissionCheck = readonly [string, string, CheckResult];
/** `[key, value, result]` — `paige-ia.js` L1143, the manifest tuple shape. */
export type SubmissionManifestRow = readonly [string, string, ManifestResult];
/** `[event, when]` — `paige-ia.js` L1149, the history tuple shape. */
export type SubmissionHistoryRow = readonly [string, string];

/**
 * One submission, shaped exactly like the record `subsVals` / `reviewVals` read.
 *
 * `assigned` is `string | null` rather than the pack's `'Unassigned'` on purpose: the pack's
 * own foot says a reviewer identity does not exist, and the PORT-SPEC lists that value as
 * fixture #4. Null renders `—` in the `Reviewer` cell and fills in when the identity class
 * ships.
 */
export type OperatorSubmission = {
  readonly id: string;
  readonly name: string;
  readonly kind: SubmissionKind;
  readonly listing: string;
  readonly pub: string;
  readonly cls: PublisherClass;
  readonly outside: boolean;
  /** The scope it is asking for. */
  readonly wants: string;
  /** The scope it holds today. */
  readonly has: string;
  readonly version: string;
  readonly waiting: string;
  readonly state: SubmissionState;
  readonly assigned: string | null;
  readonly why: string;
  readonly manifest: readonly SubmissionManifestRow[];
  readonly checks: readonly SubmissionCheck[];
  readonly history: readonly SubmissionHistoryRow[];
};

/** L9537-L9541 — the five filter chips, in the pack's order. `Everything` selects `All`. */
const FILTERS = ["Everything", "Submitted", "In review", "Changes requested", "Outside"] as const;
type FilterLabel = (typeof FILTERS)[number];

/** The absence mark. A figure nobody read is `—`, never a zero and never a fixture. */
const DASH = "—";

const FONT_UI = "var(--pg-font-ui)";
const FONT_DATA = "var(--pg-font-data)";
const FONT_EDITORIAL = "var(--pg-font-editorial)";

/** L9570, verbatim. */
const SUB_FOOT =
  "A submission is representative. The manifest, requested scope and auto-checks are real " +
  "fields. What does not exist: a reviewer identity, an SLA clock, and a publisher account " +
  "separate from a tenant — an outside publisher is neither inside a tenant nor above one, so " +
  "it needs its own identity class. All three are Stage 3.";

/** L2321, verbatim. */
const SUB_EMPTY =
  "Nothing in this state. The queue is what stands between an outside publisher and " +
  "everybody else’s clients.";

export type SubmissionsQueueProps = {
  /** `null` until a read lands. An empty array is a real read that found nothing. */
  readonly submissions: readonly OperatorSubmission[] | null;
  /** L9566-L9567 — opens the `review` summon over this record. */
  readonly onOpen: (id: string) => void;
  /** The pack's `announcement` channel (L9567: `Opened the submission.`). */
  readonly onAnnounce?: (message: string) => void;
};

/** §4.1 / §4.2 — the queue. */
export function SubmissionsQueue({ submissions, onOpen, onAnnounce }: SubmissionsQueueProps) {
  const reduce = !!useReducedMotion();
  // L9511 — the pack holds the filter in its own state and defaults to `All`.
  const [filter, setFilter] = useState<FilterLabel>("Everything");

  const all = submissions;

  // L9512-L9515 — filter only. There is no sort and no pagination on this surface.
  const list = useMemo(() => {
    if (!all) return null;
    if (filter === "Everything") return all;
    if (filter === "Outside") return all.filter((x) => x.outside);
    return all.filter((x) => x.state === filter);
  }, [all, filter]);

  /** L9537-L9541 — each chip's count. `—` while nothing has been read. */
  function count(label: FilterLabel): string {
    if (!all) return DASH;
    if (label === "Everything") return String(all.length);
    if (label === "Outside") return String(all.filter((x) => x.outside).length);
    return String(all.filter((x) => x.state === label).length);
  }

  // L9535 / L9543 — `{failing} of {all} have a failing check · no SLA clock exists yet`.
  const failing = all ? String(all.filter((x) => x.checks.some((c) => c[2] === "fail")).length) : DASH;
  const total = all ? String(all.length) : DASH;
  const subClock = `${failing} of ${total} have a failing check · no SLA clock exists yet`;

  const rows = list ?? [];

  return (
    <div style={{ marginBottom: 30 }}>
      {/* L2283 — the filter strip. */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px",
          paddingBottom: 14, borderBottom: "1px solid var(--pg-line)",
        }}
      >
        {FILTERS.map((label) => {
          const on = filter === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setFilter(label)}
              aria-pressed={on}
              className="text-[length:var(--pg-t-label)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px", flex: "none",
                whiteSpace: "nowrap", minHeight: "28px", padding: "0 11px",
                borderRadius: "var(--pg-r-pill)",
                border: "1px solid " + (on ? "var(--pg-gold)" : "var(--pg-line)"),
                background: on ? "var(--pg-lift)" : "transparent",
                color: on ? "var(--pg-ink)" : "var(--pg-muted)",
                fontWeight: on ? 600 : 400, fontFamily: FONT_UI,
              }}
            >
              {label}
              <small
                className="text-[length:var(--pg-t-label)]"
                style={{ color: "var(--pg-faint)", fontFamily: FONT_DATA }}
              >
                {count(label)}
              </small>
            </button>
          );
        })}
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            marginLeft: "auto", minWidth: 0, color: "var(--pg-faint)", fontFamily: FONT_DATA,
          }}
        >
          {subClock}
        </small>
      </div>

      {/* L2290 — the stack. */}
      <div style={{ display: "grid", gap: 11, marginTop: 14 }}>
        {rows.map((x, i) => (
          <SubmissionRow
            key={x.id}
            submission={x}
            index={i}
            reduce={reduce}
            onOpen={() => {
              onOpen(x.id);
              onAnnounce?.("Opened the submission.");
            }}
          />
        ))}
      </div>

      {/* L2320-L2322 — the designed absence. */}
      {rows.length === 0 && (
        <p
          className="text-[length:var(--pg-t-lead)]"
          style={{
            maxWidth: "44ch", padding: "24px 0", color: "var(--pg-muted)",
            fontWeight: 400, lineHeight: 1.6, fontFamily: FONT_EDITORIAL,
          }}
        >
          {SUB_EMPTY}
        </p>
      )}

      {/* L2324 — the foot. */}
      <p
        className="text-[length:var(--pg-t-label)]"
        style={{
          maxWidth: "64ch", marginTop: 18, paddingTop: 13,
          borderTop: "1px solid var(--pg-line-soft)", color: "var(--pg-faint)", lineHeight: 1.55,
        }}
      >
        {SUB_FOOT}
      </p>
    </div>
  );
}

/** L2292-L2318 — one queue row. */
function SubmissionRow({
  submission: x, index, reduce, onOpen,
}: {
  submission: OperatorSubmission;
  index: number;
  reduce: boolean;
  onOpen: () => void;
}) {
  const mk = kindMark(x.kind, 32, false, reduce);
  const pass = x.checks.filter((c) => c[2] === "pass").length;
  const fail = x.checks.filter((c) => c[2] === "fail").length;
  // L9552-L9553.
  const checkLine = fail ? `${fail} failing` : `${pass} of ${x.checks.length} pass`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        "text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (reduce ? "" : "motion-safe:hover:-translate-y-[2px] ") +
        "hover:shadow-[var(--pg-rim),var(--pg-lift-2)]"
      }
      style={{
        display: "flex", flexDirection: "column", gap: 10, minWidth: 0, minHeight: 88,
        padding: "15px 16px", border: 0, borderRadius: "var(--pg-r-plate)",
        // ELEVATION: pack `--pg-surface`; this card rises (rim + lift-1, lifts on hover), so it
        // paints `--pg-raised` in both themes.
        background: "var(--pg-raised)",
        boxShadow: "var(--pg-rim), var(--pg-lift-1)",
        transition: reduce
          ? "none"
          : "transform 200ms cubic-bezier(.22,1,.36,1), box-shadow 200ms",
        animation: reduce ? "none" : "pg-reveal 300ms cubic-bezier(.22,1,.36,1) both",
        animationDelay: index * 50 + "ms",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={mk.wrapStyle}>
          <i style={mk.rimStyle} />
          <svg viewBox="0 0 16 16" style={mk.svgStyle} aria-hidden="true">
            <path d={mk.glyph} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 2, textAlign: "left" }}>
          <b
            className="truncate text-[length:var(--pg-t-body)]"
            style={{ fontWeight: 500, fontFamily: FONT_UI }}
          >
            {x.name}
          </b>
          {/* L9549 — `{kind} · {pub}` plus ` · outside` when the publisher is outside. */}
          <small
            className="truncate text-[length:var(--pg-t-label)]"
            style={{ color: "var(--pg-faint)" }}
          >
            {x.kind + " · " + x.pub + (x.outside ? " · outside" : "")}
          </small>
        </span>
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            marginLeft: "auto", flex: "none", color: stateTone(x.state), fontWeight: 500,
            fontFamily: FONT_UI, letterSpacing: ".03em", whiteSpace: "nowrap",
          }}
        >
          {x.state}
        </small>
      </span>

      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "7px 14px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* L9550 — `{has} → {wants}`. */}
          <small
            className="text-[length:var(--pg-t-label)]"
            style={{ color: "var(--pg-faint)", fontFamily: FONT_DATA, whiteSpace: "nowrap" }}
          >
            {x.has + " → " + x.wants}
          </small>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {/* L9551 — one 5px pip per check, rotated 45°, toned by result. */}
          {x.checks.map((c) => (
            <i
              key={c[0]}
              title={c[0] + " — " + c[1]}
              style={{
                flex: "none", width: "5px", height: "5px", rotate: "45deg",
                background: checkTone(c[2]),
              }}
            />
          ))}
          <small
            className="text-[length:var(--pg-t-label)]"
            style={{
              color: fail ? "var(--pg-negative)" : "var(--pg-faint)",
              fontFamily: FONT_DATA, whiteSpace: "nowrap",
            }}
          >
            {checkLine}
          </small>
        </span>
        {/* L2314 — `{waiting} waiting`. */}
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            marginLeft: "auto", color: "var(--pg-faint)", fontFamily: FONT_DATA,
            whiteSpace: "nowrap",
          }}
        >
          {x.waiting} waiting
        </small>
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
   §4.4 — the submission slide-over (`review`).
   ───────────────────────────────────────────────────────────────────────────────────────── */

/** `SUMMONS.review` — `paige-ia.js` L66, verbatim. The slide-over's own header copy. */
export const REVIEW_SUMMON = {
  title: "Submission",
  deck:
    "What they declared, what the auto-checks found, and the one decision that decides how " +
    "far it reaches. A reviewer reads exactly what the buyer will see.",
  foot:
    "Representative. The manifest, the requested scope and the auto-checks are real fields on " +
    "a submission. What does not exist: a reviewer identity, an SLA clock, and a publisher " +
    "account separate from a tenant — all three are Stage 3.",
} as const;

export type SubmissionDecision = {
  readonly next: SubmissionState;
  readonly announcement: string;
};

export type SubmissionReviewProps = {
  /**
   * The record the queue row opened. `null` renders nothing — the pack's own behaviour
   * (`reviewVals` returns `showReview:false` when no record resolves, L9578).
   */
  readonly submission: OperatorSubmission | null;
  /**
   * A decision, handed up with the state it moves to and the pack's announcement. Nothing here
   * writes: the pack sets local state (L9605) and this port refuses to imply more (§13).
   */
  readonly onDecide: (id: string, decision: SubmissionDecision) => void;
  /** Announcements a blocked decision emits instead of moving state (L9636-L9640). */
  readonly onAnnounce?: (message: string) => void;
};

export function SubmissionReview({ submission: x, onDecide, onAnnounce }: SubmissionReviewProps) {
  const reduce = !!useReducedMotion();
  if (!x) return null;

  const mk = kindMark(x.kind, 42, false, reduce);
  const cls = MARKET_CLASSES[x.cls] ?? MARKET_CLASSES.Agency;
  const fails = x.checks.filter((c) => c[2] === "fail");
  // L9594-L9595 — the ruling: an outside publisher may ship configuration and composition,
  // never arbitrary behaviour against a client's data.
  const kindBlocked = x.outside && OUTSIDE_KINDS[x.kind] === false;
  const canApprove = fails.length === 0 && !kindBlocked;

  // L9616-L9623 — the five scope cells are fixed; only the values move.
  const scope: readonly { k: string; v: string; ink: string }[] = [
    { k: "Has now", v: x.has, ink: "var(--pg-ink-2)" },
    { k: "Wants", v: x.wants, ink: "var(--pg-gold-deep)" },
    { k: "Publisher class", v: cls.label, ink: "var(--pg-ink-2)" },
    { k: "Waiting", v: x.waiting, ink: "var(--pg-ink-2)" },
    { k: "Reviewer", v: x.assigned ?? DASH, ink: "var(--pg-faint)" },
  ];

  // L9644-L9648 — the three decision notes, verbatim.
  const decisionNote = kindBlocked
    ? "By ruling, an outside publisher may ship a Template or a Skill — configuration and " +
      "composition. An " + x.kind + " is arbitrary behaviour against a client’s data, so " +
      "it stays platform-only until a real security review exists."
    : fails.length
      ? "Approval is blocked while a check fails. " + fails.map((c) => c[1]).join(" ") + "."
      : "Approving widens who can see it. It does not widen what it may do — the manifest " +
        "grant still runs under each operator’s own ceiling.";

  /** L9597-L9602 — the three button faces. Gold fills the act and nothing else (§11). */
  function actionStyle(kind: "go" | "no" | ""): CSSProperties {
    return {
      minHeight: "34px", padding: "0 14px", borderRadius: "var(--pg-r-chip)", whiteSpace: "nowrap",
      border: "1px solid " + (kind === "go" ? "var(--pg-gold)" : kind === "no" ? "var(--pg-negative)" : "var(--pg-line)"),
      background: kind === "go" ? "var(--pg-gold)" : "transparent",
      color: kind === "go" ? "#17120c" : kind === "no" ? "var(--pg-negative)" : "var(--pg-muted)",
      fontWeight: kind === "go" ? 600 : 500, fontFamily: FONT_UI,
    };
  }

  // L9633-L9643 — four actions, labels composed from the record.
  const actions: readonly { label: string; face: "go" | "no" | ""; act: () => void }[] = [
    {
      label: canApprove ? "Approve for " + x.wants.toLowerCase() : "Cannot approve",
      face: canApprove ? "go" : "",
      act: canApprove
        ? () => onDecide(x.id, {
            next: "Approved",
            announcement: x.name + " approved for " + x.wants.toLowerCase() +
              ". The scope change is on the record.",
          })
        : () => onAnnounce?.(kindBlocked
            ? "An outside publisher may not ship a " + x.kind +
              ". Templates and skills only until a security review exists."
            : fails.length + " check" + (fails.length > 1 ? "s" : "") + " failing: " +
              fails.map((c) => c[0]).join(", ") + "."),
    },
    {
      label: "Request changes",
      face: "",
      act: () => onDecide(x.id, {
        next: "Changes requested",
        announcement: "Changes requested. They keep the listing at " + x.has.toLowerCase() + " meanwhile.",
      }),
    },
    {
      label: "Keep at " + x.has.toLowerCase(),
      face: "",
      act: () => onDecide(x.id, {
        next: "In review",
        announcement: "Held at " + x.has.toLowerCase() + ". Nothing outside that scope can see it.",
      }),
    },
    {
      label: "Reject",
      face: "no",
      act: () => onDecide(x.id, {
        next: "Rejected",
        announcement: "Rejected. They can resubmit a new version.",
      }),
    },
  ];

  return (
    <div style={{ marginTop: 14 }}>
      {/* L3321-L3331 — identity row. */}
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={mk.wrapStyle}>
          <i style={mk.rimStyle} />
          <svg viewBox="0 0 16 16" style={mk.svgStyle} aria-hidden="true">
            <path d={mk.glyph} fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <b className="text-[length:var(--pg-t-lead)]" style={{ fontWeight: 500, fontFamily: FONT_UI }}>
            {x.name}
          </b>
          {/* L9610 — `{kind} · {pub} · v{version}`. */}
          <small className="text-[length:var(--pg-t-label)]" style={{ marginTop: 2, color: "var(--pg-faint)" }}>
            {x.kind + " · " + x.pub + " · v" + x.version}
          </small>
        </span>
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            marginLeft: "auto", flex: "none", color: stateTone(x.state), fontWeight: 500,
            fontFamily: FONT_UI, letterSpacing: ".03em", whiteSpace: "nowrap",
          }}
        >
          {x.state}
        </small>
      </div>

      {/* L3333 — why they are asking, in their words. */}
      <p
        className="text-[length:var(--pg-t-lead)]"
        style={{
          maxWidth: "46ch", marginTop: 14, color: "var(--pg-ink)", fontWeight: 400,
          lineHeight: 1.6, fontFamily: FONT_EDITORIAL, textWrap: "pretty",
        }}
      >
        {x.why}
      </p>

      {/* L3335-L3342 — the five scope cells. */}
      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))",
          gap: "12px 18px", marginTop: 17, padding: "14px 0",
          borderBlock: "1px solid var(--pg-line-soft)",
        }}
      >
        {scope.map((rs) => (
          <span key={rs.k} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <small
              className="text-[length:var(--pg-t-label)]"
              style={{
                color: "var(--pg-faint)", fontFamily: FONT_DATA, letterSpacing: ".05em",
                textTransform: "uppercase",
              }}
            >
              {rs.k}
            </small>
            <b
              className="text-[length:var(--pg-t-body)]"
              style={{ fontWeight: 500, fontFamily: FONT_UI, color: rs.ink }}
            >
              {rs.v}
            </b>
          </span>
        ))}
      </div>

      {/* L3344-L3360 — Auto-checks. */}
      <div style={{ padding: "17px 0 4px" }}>
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{ display: "block", color: "var(--pg-faint)", fontWeight: 500, fontFamily: FONT_UI }}
        >
          Auto-checks
        </small>
        <div style={{ display: "grid", gap: 1, marginTop: 11, background: "var(--pg-line-soft)" }}>
          {x.checks.map((ck) => (
            <div
              key={ck[0]}
              style={{
                display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 10,
                alignItems: "center", minHeight: 40, padding: "0 2px",
                background: "var(--pg-workspace)",
              }}
            >
              <i
                style={{
                  flex: "none", width: "6px", height: "6px", rotate: "45deg",
                  background: checkTone(ck[2]),
                }}
              />
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <b className="truncate text-[length:var(--pg-t-label)]" style={{ fontWeight: 500, fontFamily: FONT_UI }}>
                  {ck[0]}
                </b>
                <small className="truncate text-[length:var(--pg-t-label)]" style={{ marginTop: 1, color: "var(--pg-faint)" }}>
                  {ck[1]}
                </small>
              </span>
              {/* L9625 — pass / fail / could not run. */}
              <small
                className="text-[length:var(--pg-t-label)]"
                style={{
                  color: checkTone(ck[2]), fontFamily: FONT_DATA, letterSpacing: ".04em",
                  whiteSpace: "nowrap",
                }}
              >
                {ck[2] === "pass" ? "pass" : ck[2] === "fail" ? "fail" : "could not run"}
              </small>
            </div>
          ))}
        </div>
      </div>

      {/* L3362-L3374 — What they declared. */}
      <div style={{ padding: "15px 0 4px", borderTop: "1px solid var(--pg-line-soft)" }}>
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            display: "block", paddingTop: 13, color: "var(--pg-faint)", fontWeight: 500,
            fontFamily: FONT_UI,
          }}
        >
          What they declared
        </small>
        <div style={{ display: "grid", gap: 1, marginTop: 11, background: "var(--pg-line-soft)" }}>
          {x.manifest.map((mf) => (
            <div
              key={mf[0]}
              style={{
                display: "grid", gridTemplateColumns: "72px minmax(0,1fr) auto", gap: 10,
                alignItems: "center", minHeight: 34, padding: "0 2px",
                background: "var(--pg-workspace)",
              }}
            >
              <small
                className="text-[length:var(--pg-t-label)]"
                style={{
                  color: "var(--pg-faint)", fontFamily: FONT_DATA, letterSpacing: ".05em",
                  textTransform: "uppercase",
                }}
              >
                {mf[0]}
              </small>
              <small
                className="truncate text-[length:var(--pg-t-label)]"
                style={{ minWidth: 0, color: "var(--pg-ink-2)", fontFamily: FONT_UI }}
              >
                {mf[1]}
              </small>
              {/* L9629 — ready / above ceiling / missing. */}
              <small
                className="text-[length:var(--pg-t-label)]"
                style={{
                  color:
                    mf[2] === "ok" ? "var(--pg-positive)"
                      : mf[2] === "need" ? "var(--pg-warning)"
                        : "var(--pg-negative)",
                  fontFamily: FONT_DATA, letterSpacing: ".04em", whiteSpace: "nowrap",
                }}
              >
                {mf[2] === "ok" ? "ready" : mf[2] === "need" ? "above ceiling" : "missing"}
              </small>
            </div>
          ))}
        </div>
        {/* L3371, verbatim. */}
        <p
          className="text-[length:var(--pg-t-label)]"
          style={{ maxWidth: "46ch", marginTop: 11, color: "var(--pg-faint)", lineHeight: 1.5 }}
        >
          This is the same manifest the install page renders. A reviewer reads exactly what the
          buyer will see.
        </p>
      </div>

      {/* L3376-L3384 — the decision. */}
      <div style={{ padding: "15px 0 4px", borderTop: "1px solid var(--pg-line-soft)" }}>
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            display: "block", paddingTop: 13, color: "var(--pg-gold-deep)", fontWeight: 500,
            fontFamily: FONT_UI,
          }}
        >
          Decide how far it reaches
        </small>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
          {actions.map((ra) => (
            <button
              key={ra.label}
              type="button"
              onClick={ra.act}
              className="text-[length:var(--pg-t-body)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={actionStyle(ra.face)}
            >
              {ra.label}
            </button>
          ))}
        </div>
        <p
          className="text-[length:var(--pg-t-body)]"
          style={{
            maxWidth: "46ch", marginTop: 11, color: "var(--pg-muted)", fontWeight: 400,
            lineHeight: 1.55, fontFamily: FONT_UI, textWrap: "pretty",
          }}
        >
          {decisionNote}
        </p>
      </div>

      {/* L3386-L3392 — History. */}
      <div style={{ padding: "15px 0 4px", borderTop: "1px solid var(--pg-line-soft)" }}>
        <small
          className="text-[length:var(--pg-t-label)]"
          style={{
            display: "block", paddingTop: 13, color: "var(--pg-faint)", fontWeight: 500,
            fontFamily: FONT_UI,
          }}
        >
          History
        </small>
        <div style={{ marginTop: 11, paddingLeft: 12, borderLeft: "1px solid var(--pg-line-strong)" }}>
          {x.history.map((hs, i) => (
            <p
              key={hs[0] + hs[1]}
              className="text-[length:var(--pg-t-body)]"
              style={{
                margin: i ? "7px 0 0" : 0, color: "var(--pg-muted)", fontWeight: 400,
                fontFamily: FONT_UI,
              }}
            >
              {hs[0] + " · " + hs[1]}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SubmissionsQueue;
