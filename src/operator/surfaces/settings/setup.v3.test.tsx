/**
 * `settings · Setup` — the port contract. v3 `setupVals` L8915–L9086 over `P.SETUP`.
 *
 * Two things are pinned here that matter more than the rest.
 *
 * 1. THE §38 MONEY BOUNDARY SURVIVES THE PORT WORD FOR WORD. CD authored the doctrine into the
 *    catalogue — three money relationships, only one of them ours, and *"we are never the merchant
 *    of record between you and your client."* That is not decoration and it is not paraphrasable,
 *    so it is asserted verbatim. If a later edit softens it, this fails.
 *
 * 2. NO STEP CLAIMS A STATE IT CANNOT PROVE. `P.SETUP` marks twelve steps `done`; carrying that
 *    would tell the owner he has finished things he has not (§13). The states are dropped at the
 *    contract and the figures render as em-dashes, and both halves are pinned — the absence, and
 *    the fact that the fixture states did not come with it.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SetupSurface from "@/operator/surfaces/settings/SetupSurface";
import {
  SETUP_ABSENCE,
  SETUP_GROUPS,
  SETUP_STEPS,
  setupKicker,
  setupLands,
  setupWhy,
} from "@/operator/surfaces/settings/setupContract";

describe("the §38 money boundary is carried, not paraphrased", () => {
  const money = SETUP_GROUPS.find((g) => g.g === "Money");

  it("keeps CD's group note — three relationships, one of them ours", () => {
    expect(money?.note).toBe("Three different relationships — and only one of them is ours");
  });

  it("keeps the merchant-of-record rule verbatim on the client-payment step", () => {
    const step = money?.items.find((i) => i.name === "What your clients pay you");
    expect(step?.why).toContain(
      "We never hold it and never take a cut — by rule, we are never the merchant of record between you and your client.",
    );
    expect(step?.note).toBe(
      "Yours. Bring your own — Stripe, Square, PayPal or an invoice you send yourself.",
    );
  });

  it("keeps the one step where we ARE the merchant marked as such, and only that one", () => {
    const ours = money?.items.filter((i) => i.note?.startsWith("Ours."));
    expect(ours).toHaveLength(1);
    expect(ours?.[0].name).toBe("What you pay us");
  });
});

describe("no step claims a state, and no figure is invented", () => {
  const html = renderToStaticMarkup(<SetupSurface />);

  it("renders every figure as an em-dash inside CD's own sentence", () => {
    expect(html).toContain(SETUP_ABSENCE.pct);
    expect(html).toContain(SETUP_ABSENCE.line);
    expect(html).toContain(SETUP_ABSENCE.railMeta);
  });

  it("says she has nothing outstanding rather than inventing a count for her", () => {
    expect(html).toContain(SETUP_ABSENCE.doAll);
    expect(html).not.toMatch(/She can finish \d/);
  });

  it("carries no `state` on any step in the catalogue", () => {
    for (const s of SETUP_STEPS) {
      expect(s).not.toHaveProperty("state");
    }
  });

  /**
   * Three `why` lines in `P.SETUP` state a live figure about this account — the current rung,
   * eight running automations, twelve alerts with four needing you. Dropped with the reason
   * recorded in the contract; pinned here so none creeps back.
   */
  it("drops the three `why` lines that assert a live figure", () => {
    const all = SETUP_STEPS.map((s) => s.why ?? "").join(" ");
    expect(all).not.toContain("Currently ask first");
    expect(all).not.toContain("eight are running");
    expect(all).not.toContain("four need you");
  });

  it("keeps the half of the Trust Compass line that is a rule, not a reading", () => {
    const step = SETUP_STEPS.find((s) => s.name === "Trust Compass ceiling");
    expect(step?.why).toBe("Everything else is clamped by it.");
  });
});

describe("a step is traceable, which is what stops it being a form field", () => {
  it("names who can do it, in CD's two arms", () => {
    expect(setupKicker("Money", "PAIGE")).toBe("Money · she can do this");
    expect(setupKicker("Money", "You")).toBe("Money · only you can do this");
  });

  it("splits `lands` into one chip per destination", () => {
    expect(setupLands("Fleet · Vault")).toEqual(["Lands in Fleet", "Vault"]);
    expect(setupLands("Analytics")).toEqual(["Lands in Analytics"]);
  });

  it("leads with the note where a step has one, and falls back to CD's line", () => {
    expect(setupWhy({ id: "x", name: "x", who: "You", lands: "Vault" })).toBe(
      "Set this and she can use it everywhere it applies.",
    );
    const money = SETUP_STEPS.find((s) => s.name === "What you pay us");
    expect(setupWhy(money!).startsWith("Ours.")).toBe(true);
  });

  it("gives every step a destination — a step that lands nowhere is untraceable", () => {
    for (const s of SETUP_STEPS) expect(s.lands.trim().length).toBeGreaterThan(0);
  });
});

describe("every write is inert until a seam exists, and visibly so", () => {
  it("disables the acts when no handler is supplied", () => {
    const html = renderToStaticMarkup(<SetupSurface />);
    // The first step is yours, so the Save arm renders — disabled, with CD's label intact.
    expect(html).toContain(">Save<");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save</);
  });

  it("wires an act the moment a handler IS supplied", () => {
    const html = renderToStaticMarkup(<SetupSurface onSaveStep={() => {}} />);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Save</);
  });
});
