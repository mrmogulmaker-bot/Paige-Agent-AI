import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import { ExtractionProposalCard } from "./ExtractionProposalCard";

/**
 * WHAT THE CARD SAYS AFTER YOU CLICK SAVE.
 *
 * Two things were false on screen at once. The intro is an "it hasn't happened yet" sentence — the
 * credit proposal's is literally "Nothing has been saved to the profile yet" — and it kept
 * rendering above the settled line, so a card that had just saved said both. And the settled line
 * guessed the profile from a `profile.` key prefix with "business" as the fallback, so a credit
 * report reported a write to three FICO columns and five credit tables as an update to the
 * business profile.
 *
 * These assert on rendered DOM, because the whole defect was what a person read.
 */
function render(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(node); });
  return { container };
}

const CREDIT = {
  id: "u1",
  source: "document" as const,
  documentType: "Credit report",
  intro: "I read this report. Nothing has been saved to the profile yet — tell me which of these to record.",
  fields: [
    { key: "credit_score_equifax", label: "Equifax", value: 712 },
    { key: "negative_items", label: "Negative items to record", value: 4, displayValue: "4 items" },
  ],
};
const BUSINESS = {
  id: "u2",
  source: "chat" as const,
  intro: "I found the following information:",
  fields: [{ key: "foundation.ein", label: "EIN", value: "12-3456789" }],
};
const PERSONAL = {
  id: "u3",
  source: "chat" as const,
  fields: [{ key: "profile.full_name", label: "Name", value: "A. Person" }],
};

/** Click Save and let the (resolved) apply settle. */
async function saveAndSettle(proposal: unknown) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const { container } = render(
    <ExtractionProposalCard proposal={proposal as never} onConfirm={onConfirm} onSkip={vi.fn()} />,
  );
  const save = [...container.querySelectorAll("button")].find((b) => /save|yes/i.test(b.textContent ?? ""));
  expect(save, "the card must offer a save control").toBeTruthy();
  await act(async () => { save!.click(); });
  await act(async () => { await Promise.resolve(); });
  return container;
}

describe("ExtractionProposalCard — what it says once it has saved", () => {
  it("stops claiming nothing has been saved", async () => {
    const c = await saveAndSettle(CREDIT);
    expect(c.textContent).not.toContain("Nothing has been saved");
  });

  it("does not call a credit-report write an update to the business profile", async () => {
    const c = await saveAndSettle(CREDIT);
    expect(c.textContent).not.toContain("business profile");
    expect(c.textContent).toContain("Done");
  });

  /**
   * The §58 guard. A first attempt at the fix keyed on a `business.` prefix that nothing emits,
   * which would have quietly downgraded every correct "business profile" while fixing the credit
   * case. These two pin the cases that were ALREADY right.
   */
  it("still says business profile for a real business key", async () => {
    const c = await saveAndSettle(BUSINESS);
    expect(c.textContent).toContain("business profile");
  });

  it("still says personal profile for a personal key", async () => {
    const c = await saveAndSettle(PERSONAL);
    expect(c.textContent).toContain("personal profile");
  });

  it("shows the intro before anything is saved", () => {
    const { container } = render(
      <ExtractionProposalCard proposal={CREDIT as never} onConfirm={vi.fn()} onSkip={vi.fn()} />,
    );
    expect(container.textContent).toContain("Nothing has been saved");
  });
});
