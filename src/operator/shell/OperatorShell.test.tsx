/**
 * The shell's geometry contract.
 *
 * WHY THIS ASSERTS RENDERED MARKUP AND NOT KEY COUNTS. The console's first failure mode was a
 * registry that resolved every address, typechecked clean, passed every test — and rendered a
 * blank card on all 78 screens (`src/operator/CLAUDE.md`). Counting slots proves the tree is
 * addressed and proves nothing about what anyone sees, so every assertion here reads the DOM the
 * shell actually produced.
 *
 * Folder convention: react-dom/server, no RTL. `signOut` is mocked because importing it pulls in
 * the supabase client, which is not this test's subject.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { OPERATOR_SLOTS } from "@/operator/ia/operatorIA";

vi.mock("@/lib/auth/signOut", () => ({ performSignOut: vi.fn() }));

import OperatorShell from "./OperatorShell";

const at = (path: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/operator/:section/*" element={<OperatorShell />} />
      </Routes>
    </MemoryRouter>,
  );

/** `data-slot="…"` in source order — the seam the harness measures slot ORDER through. */
const slotOrder = (html: string) =>
  [...html.matchAll(/data-slot="([^"]+)"/g)].map((m) => m[1]);

describe("the operator shell renders the pack's geometry", () => {
  it("the rail carries the SIX IA slots, in the IA's order, each tagged data-slot", () => {
    expect(slotOrder(at("/operator/fleet"))).toEqual(OPERATOR_SLOTS.map((s) => s.id));
  });

  it("the grid container is findable and carries the pack's three tracks at rest", () => {
    const html = at("/operator/fleet");
    expect(html).toContain("data-shell-grid");
    // 216px rail · a floor-less middle · a spine that may not fall below 340px.
    expect(html).toMatch(/grid-template-columns:\s*216px minmax\(0,\s*1fr\) minmax\(340px,\s*26vw\)/);
  });

  it("every view of the addressed slot is offered, by the design's own spelling", () => {
    const html = at("/operator/settings");
    const settings = OPERATOR_SLOTS.find((s) => s.id === "settings")!;
    for (const view of settings.views) expect(html).toContain(`data-view="${view}"`);
  });

  it("a slot with an absence renders the IA's absence copy, unedited", () => {
    const html = at("/operator/campaigns");
    const absence = OPERATOR_SLOTS.find((s) => s.id === "campaigns")!.absence!;
    expect(html).toContain(absence.title.replace(/·/g, "·"));
    // A distinctive clause is enough to prove it is the IA's body and not a paraphrase.
    expect(html).toContain("an order cannot name a campaign");
  });

  it("an unknown section renders a 404 IN the shell — it does not redirect to Fleet", () => {
    const html = at("/operator/not-a-slot");
    // The redirect it replaces rendered nothing here and threw the address away.
    expect(html).toContain("data-shell-grid");
    expect(html).toContain("not-a-slot");
    // Every slot is still one click away, so the operator is never stranded.
    expect(slotOrder(html)).toEqual(OPERATOR_SLOTS.map((s) => s.id));
  });

  it("a known slot with an unknown view canonicalises rather than lying about where you are", () => {
    // <Navigate> renders nothing on the server: no shell means the redirect fired.
    expect(at("/operator/fleet/not-a-view")).not.toContain("data-shell-grid");
    expect(at("/operator/fleet/history")).toContain("data-shell-grid");
  });
});
