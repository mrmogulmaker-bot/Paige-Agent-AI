import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Trust Compass must not ship invented customers, invented provider state, invented
 * measurements, or a claim that something was sent.
 *
 * These are source assertions on purpose. `TcApprove` and `TcEscalate` are module-private and
 * reachable only by clicking a canvas orb, so a render test cannot get at them; what CAN be
 * guaranteed mechanically is that the fabricated strings are not in the file and that the modals
 * read the real seam. A future edit that reintroduces any of them fails here.
 */
const src = fs.readFileSync(path.join(process.cwd(), "src/solo/compass.tsx"), "utf8");
const team = fs.readFileSync(path.join(process.cwd(), "src/solo/team.tsx"), "utf8");

describe("no invented customer or provider state", () => {
  it("carries no invented recipient, sender, company or carrier", () => {
    for (const invented of [
      "sarah.nnadi",          // a named recipient at a named company
      "harpervale",
      "jordan@paigeagent.ai", // a named sender on the operator's own domain
      "Statewide Mutual",     // a named insurance carrier
    ]) {
      expect(src.includes(invented)).toBe(false);
    }
  });

  it("makes no statement about a lapsed policy or a coverage position", () => {
    // The escalation asserted a statutory coverage position and recommended a course of action.
    expect(src).not.toContain("lapsed on August 9");
    expect(src).not.toContain("Reinstate now");
    expect(src).not.toContain("Consult counsel");
  });

  it("shows no confidence percentage on a draft, because no column supplies one", () => {
    // Scoped to the DRAFT's invented 91%. A broader `not.toContain("Confidence")` failed here and
    // was right to: `TcDept` still renders "Confidence, last 30 days" from `TC_DEPTS`, a fixture
    // array supplying every department's confidence, trust level and action counts. That is a
    // real, larger finding — it drives the compass dial itself — and it is tracked rather than
    // silently widened into this slice. Narrowing the assertion to what this change actually
    // fixed keeps it honest; the broader one is owed with that work.
    // Asserted on the ROW the modal built — `['Confidence', …]` — not on the value 91, which
    // collides with TC_DEPTS' Executive entry (`conf:91`) and would have gone red for the wrong
    // reason. An assertion that matches unrelated code is worse than no assertion.
    expect(src).not.toContain("['Confidence'");
    expect(src).not.toContain("['To',");
    expect(src).not.toContain("['From',");
  });
});

describe("no fabricated successful action", () => {
  it("does not claim anything was sent", () => {
    // The approve button used to raise a toast reading "Sent. That one raced through — she logged
    // it under Marketing." Nothing sent anything.
    expect(src).not.toContain("Sent. That one raced through");
    expect(src).not.toMatch(/setToast\(\s*'Sent/);
  });
});

describe("pending decisions read the real action bus and route to the one Paige chat", () => {
  it("CALLS the pending-actions seam (a real read), and only where it is rendered", () => {
    // Not `toContain("useSoloPendingActions")` — that was vacuous (the removal notes name the hook,
    // so it passed with every call site deleted). Counting the actual invocations is what
    // distinguishes wiring from mentioning it. The two false-affordance modals (TcApprove/TcEscalate)
    // are gone; the pending count is now read ONCE, on the page, and each item routes to Paige.
    // Matches the invocation regardless of its argument — the hook is now called with the viewed
    // workspace (`accountEpoch`) so the read is tenant-scoped (§9), not with empty parens.
    const calls = src.match(/useSoloPendingActions\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(src).toContain('from "./data/useSoloPendingActions"');
    // And it is scoped to the viewed workspace, never an unscoped read.
    expect(src).toMatch(/useSoloPendingActions\(accountEpoch/);
  });

  it("routes the decision to the one Paige chat, not a second approve button (§18/§70.1)", () => {
    // The old modals' primary buttons ("Approve & send" / "Decide and log") only closed the modal.
    // They are gone; the surface offers "Decide in Paige" and never re-adds the false affordance.
    expect(src).not.toContain("Approve & send");
    expect(src).not.toContain("Decide and log");
    expect(src).toContain("Decide in Paige");
  });

  it("has no remaining reference to the removed fixtures", () => {
    expect(src).not.toMatch(/TC_DRAFT\./);
    expect(src).not.toMatch(/TC_ESC\./);
  });
});

describe("the Team hub's thin-spots rail invents no one and measures nothing", () => {
  it("no longer renders the invented findings or their action buttons", () => {
    // The worst-shaped one named a colleague who does not exist, attributed two named client
    // accounts to them, and put a monthly hours figure on the coverage — under a button offering
    // to act on it.
    expect(team).not.toContain("TM.gaps");
    expect(team).not.toContain("point at Sasha Kim");
    expect(team).not.toContain("Reconciliation is manual");
    expect(team).not.toContain("the worst ratio in the book");
  });

  it("DELIBERATELY does not yet assert the roster and client fixtures are gone", () => {
    // Stated rather than silently omitted. `TM.people` and `TM.clients` still carry invented
    // colleagues and clients, and this slice did not fix them — so a broad name sweep here would
    // fail for work that has not happened, which is a TODO wearing a guard's clothes. The reason
    // they are not fixed is real and worth writing down: the roster HAS a live seam
    // (`useSoloPeople`), but it supplies name, role, email, status and ownership — five of the
    // twelve fields a person card renders. Capacity, load, accounts, open work, response time,
    // win rate, pipeline value and hours saved have no source at all. Wiring it therefore means
    // deciding what a person card shows when only identity is real, and that is Claude Design's
    // call (§00), not something to settle by picking substitutes.
    expect(team).toContain("TM.people");
  });

  it("asserts no capacity it cannot measure", () => {
    // "112h used of 96h" with the meter driven to 116%, and "Three invited seats would add 140
    // hours a month." Hours per seat is not a thing this platform records.
    expect(team).not.toContain("used of 96h");
    expect(team).not.toContain("would add 140 hours");
    expect(team).not.toMatch(/Meter pct=\{116\}/);
  });

  it("still has a rail, rendering an absence rather than being deleted", () => {
    // §58 — the surface is not removed, it stops asserting. If the whole card disappears, that is
    // a design decision nobody made.
    // Asserted on the JSX, not the bare phrase. `toContain("Where the team is thin")` passed with
    // the card's heading replaced, because the removal note above quotes the heading — the same
    // self-match that bit three times while writing that note, here making a guard VACUOUS
    // instead of failing loudly. Mutation is what found it: deleting the heading left this green.
    expect(team).toContain("<h3>Where the team is thin</h3>");
    expect(team).toContain("Nothing to show here yet");
  });
});
