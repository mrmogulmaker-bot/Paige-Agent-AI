import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CALSET_ROWS,
  CalendarSettingsRules,
  CalendarWeekField,
  FIELD_DAY_LABELS,
  FIELD_HOURS,
  FIELD_KIND_STYLES,
} from "./CalendarFieldSurface";
import {
  SubmissionReview,
  SubmissionsQueue,
  type OperatorSubmission,
} from "./MarketplaceSubmissionsSurface";
import { MARKET_CLASSES, MARKET_KINDS, OUTSIDE_KINDS } from "./marketplaceVocabulary";

/**
 * The failure these assertions exist to stop is the one this console has already shipped twice:
 * a surface that typechecks, lints, resolves a route and renders NOTHING a human can read.
 * Counting exports proves the module is addressed; only rendered CONTENT proves the port.
 *
 * So every assertion below is on the rendered markup, and every string checked is one the
 * PORT-SPEC lists as verbatim design copy — never a figure, because no figure is ported.
 */

/** A minimal record with NO pack fixture in it — every value here is obviously synthetic. */
const RECORD: OperatorSubmission = {
  id: "t1",
  name: "Test record",
  kind: "Template",
  listing: "test-record",
  pub: "TEST PUBLISHER",
  cls: "Agency",
  outside: false,
  wants: "Platform-wide",
  has: "Agency-only",
  version: "1.0",
  waiting: "1d",
  state: "In review",
  assigned: null,
  why: "Why they are asking.",
  manifest: [["Grant", "Ask first", "ok"]],
  checks: [["A check", "What it looked at", "pass"]],
  history: [["Submitted", "1d ago"]],
};

describe("Marketplace submissions — PORT-SPEC §4", () => {
  it("draws all five filter chips and the clock clause with no read", () => {
    const html = renderToStaticMarkup(<SubmissionsQueue submissions={null} onOpen={() => {}} />);
    for (const chip of ["Everything", "Submitted", "In review", "Changes requested", "Outside"]) {
      expect(html).toContain(chip);
    }
    // L9543 — the clause survives; both figures are unread, so both read `—`.
    expect(html).toContain("— of — have a failing check · no SLA clock exists yet");
  });

  it("renders the designed absence and the foot rather than an empty card", () => {
    const html = renderToStaticMarkup(<SubmissionsQueue submissions={[]} onOpen={() => {}} />);
    // L2321 and L9570, verbatim.
    expect(html).toContain("The queue is what stands between an outside publisher");
    expect(html).toContain("a reviewer identity, an SLA clock, and a publisher account");
    // A real, empty read counts honestly rather than showing a dash.
    expect(html).toContain("0 of 0 have a failing check");
  });

  it("composes the row templates from the record it was handed", () => {
    const html = renderToStaticMarkup(<SubmissionsQueue submissions={[RECORD]} onOpen={() => {}} />);
    expect(html).toContain("Agency-only → Platform-wide"); // L9550
    expect(html).toContain("1 of 1 pass"); // L9553
    expect(html).toContain("1d waiting"); // L2314
    expect(html).toContain("Template · TEST PUBLISHER"); // L9549
  });

  it("carries no pack fixture — none of the three invented listings appears", () => {
    const html = renderToStaticMarkup(<SubmissionsQueue submissions={[RECORD]} onOpen={() => {}} />);
    for (const fixture of ["Intake form to pipeline", "Churn-risk read", "Ledger export", "Unassigned"]) {
      expect(html).not.toContain(fixture);
    }
  });

  it("renders every fixed label of the slide-over", () => {
    const html = renderToStaticMarkup(
      <SubmissionReview submission={RECORD} onDecide={() => {}} />,
    );
    for (const label of [
      "Auto-checks", "What they declared", "History", "Decide how far it reaches",
      "Has now", "Wants", "Publisher class", "Waiting", "Reviewer",
      "This is the same manifest the install page renders",
    ]) {
      expect(html).toContain(label);
    }
    // The reviewer identity does not exist, so the cell reads the absence mark (§13).
    expect(html).toContain("—");
    expect(html).toContain("Verified agency"); // MARKET_CLASSES.Agency.label
  });

  it("composes the four decision labels and the clear decision note", () => {
    const html = renderToStaticMarkup(
      <SubmissionReview submission={RECORD} onDecide={() => {}} />,
    );
    expect(html).toContain("Approve for platform-wide");
    expect(html).toContain("Request changes");
    expect(html).toContain("Keep at agency-only");
    expect(html).toContain("Reject");
    expect(html).toContain("Approving widens who can see it");
  });

  it("blocks approval by the outside-publisher ruling, with the ruling's own words", () => {
    const blocked: OperatorSubmission = { ...RECORD, kind: "Agent", outside: true };
    const html = renderToStaticMarkup(
      <SubmissionReview submission={blocked} onDecide={() => {}} />,
    );
    expect(html).toContain("Cannot approve");
    expect(html).toContain("an outside publisher may ship a Template or a Skill");
    expect(OUTSIDE_KINDS.Agent).toBe(false);
    expect(OUTSIDE_KINDS.Integration).toBe(false);
    expect(OUTSIDE_KINDS.Automation).toBe("review");
  });

  it("blocks approval while a check fails, quoting the failing note", () => {
    const failing: OperatorSubmission = {
      ...RECORD,
      checks: [["A check", "It did not hold", "fail"]],
    };
    const html = renderToStaticMarkup(
      <SubmissionReview submission={failing} onDecide={() => {}} />,
    );
    expect(html).toContain("Cannot approve");
    expect(html).toContain("Approval is blocked while a check fails. It did not hold.");
  });

  it("renders nothing without a record — the pack's own showReview:false path", () => {
    expect(
      renderToStaticMarkup(<SubmissionReview submission={null} onDecide={() => {}} />),
    ).toBe("");
  });

  it("carries the five kinds and four publisher classes", () => {
    expect(Object.keys(MARKET_KINDS)).toEqual([
      "Skill", "Automation", "Integration", "Template", "Agent",
    ]);
    expect(Object.keys(MARKET_CLASSES)).toEqual(["Platform", "Agency", "Solo", "Unverified"]);
  });
});

describe("Calendar week field — PORT-SPEC §2", () => {
  it("draws the five weekday labels and six hour labels with no read", () => {
    const html = renderToStaticMarkup(<CalendarWeekField onOpenCalSet={() => {}} />);
    for (const d of FIELD_DAY_LABELS) expect(html).toContain(">" + d + "<");
    for (const h of FIELD_HOURS) expect(html).toContain(h + ":00");
    expect(html).toContain("This week");
    expect(html).toContain("Representative · no calendar connected");
    expect(html).toContain("Calendar settings");
    // L2557 — five day columns behind a 52px gutter. Not seven.
    expect(html).toContain("52px repeat(5,minmax(0,1fr))");
  });

  it("skips noon — six rows, and 12:00 is not one of them", () => {
    expect(FIELD_HOURS).toHaveLength(6);
    const html = renderToStaticMarkup(<CalendarWeekField onOpenCalSet={() => {}} />);
    expect(html).not.toContain("12:00");
  });

  it("carries no pack fixture — no invented date, and no invented event", () => {
    const html = renderToStaticMarkup(<CalendarWeekField onOpenCalSet={() => {}} />);
    for (const fixture of [
      "Tenant review", "Fleet standup", "Ack firing", "Sweep running", "Stage 2 sign-off",
      "Design package", "14:22",
    ]) {
      expect(html).not.toContain(fixture);
    }
    // The five column dates are fixtures, so every date cell reads the absence mark.
    expect(html.match(/>—</g)?.length).toBe(5);
  });

  it("keeps the `Needs you today` control out until a handler asserts the surface exists", () => {
    const without = renderToStaticMarkup(<CalendarWeekField onOpenCalSet={() => {}} />);
    expect(without).not.toContain("Needs you today");
    const withIt = renderToStaticMarkup(
      <CalendarWeekField onOpenCalSet={() => {}} onOpenOwed={() => {}} owedCount={null} />,
    );
    expect(withIt).toContain("Needs you today");
  });

  it("places an event with its own treatment when one is read", () => {
    const html = renderToStaticMarkup(
      <CalendarWeekField
        onOpenCalSet={() => {}}
        events={[{ hour: "09", column: 0, kind: "approval", label: "A thing", meta: "a note" }]}
      />,
    );
    expect(html).toContain("A thing");
    expect(html).toContain("var(--pg-line-authority)");
  });

  it("carries all ten event treatments as distinct classes", () => {
    expect(Object.keys(FIELD_KIND_STYLES)).toHaveLength(10);
    // The ruling: a block that rises paints raised; the `Protected` hatch is the one well.
    expect(FIELD_KIND_STYLES.meeting.background).toBe("var(--pg-raised)");
    expect(FIELD_KIND_STYLES.appointment.background).toBe("var(--pg-raised)");
    expect(FIELD_KIND_STYLES.agent.background).toBe("var(--pg-raised)");
    expect(FIELD_KIND_STYLES.approval.background).toBe("var(--pg-raised)");
    expect(String(FIELD_KIND_STYLES.focus.background)).toContain("var(--pg-surface)");
    expect(FIELD_KIND_STYLES.artifact.background).toBe("var(--pg-artifact)");
  });
});

describe("Calendar settings — PORT-SPEC §2.5", () => {
  it("draws all eight rows with their notes, and every value as an honest absence", () => {
    const html = renderToStaticMarkup(<CalendarSettingsRules onConnect={() => {}} />);
    expect(CALSET_ROWS).toHaveLength(8);
    for (const r of CALSET_ROWS) {
      expect(html).toContain(r.k);
      expect(html).toContain(r.note);
    }
    // Eight rows, eight unread values, eight absence marks.
    expect(html.match(/>—</g)?.length).toBe(8);
    expect(html).toContain("These are rules about when she may act");
    expect(html).toContain("Connect a calendar");
  });

  it("carries no pack fixture value", () => {
    const html = renderToStaticMarkup(<CalendarSettingsRules onConnect={() => {}} />);
    for (const fixture of [
      "09:00 – 18:00 · Mon to Fri", "13:00 – 15:00 daily", "21:00 – 07:00",
      "30 minutes default", "10 minutes", "Internal only",
    ]) {
      expect(html).not.toContain(fixture);
    }
  });

  it("takes a real value where one is read, and marks the rest missing", () => {
    const html = renderToStaticMarkup(
      <CalendarSettingsRules onConnect={() => {}} values={{ Timezone: "UTC" }} />,
    );
    expect(html).toContain("UTC");
    expect(html).toContain("var(--pg-negative)"); // the missing mark on the other seven
    expect(html).toContain("var(--pg-gold-deep)"); // the set mark on Timezone
  });
});
