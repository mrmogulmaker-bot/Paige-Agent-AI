// Headless smoke + doctrine checks for the #247 "Specialists Paige built for your
// practice" section — the tenant's OWN Paige-forged keepers (§14), an extension
// of the #244 team directory.
//
// A green `tsc` is not a render (§32): this test exercises the crash-prone
// runtime paths the RLS read feeds the view — EMPTY (0 forged → invite, never a
// blank/`return null`), MANY (grid renders every row), NULL FIELDS (`department`
// is nullable per schema; a blank/absent department must NOT crash and must NOT
// emit an empty remit chip), and ERROR (the additive section hides honestly —
// §13, we never claim "you have none" when we actually couldn't read).
//
// Rendering uses react-dom/server (already a dependency), matching the sibling
// PaigeTeamDirectory / PaigeAttribution tests — the pure view takes props, so no
// Supabase or Router is touched.
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CustomSpecialistsView } from "./PaigeTeamDirectory";
import type { TenantSpecialist } from "@/hooks/usePaigeOrchestrator";

const mk = (over: Partial<TenantSpecialist>): TenantSpecialist => ({
  slug: "spec-1",
  name: "Renewal Radar",
  domain: "retention",
  description: "Watches every retainer and flags the ones about to lapse.",
  department: "Client Success",
  display_order: 1,
  ...over,
});

const render = (props: Parameters<typeof CustomSpecialistsView>[0]) =>
  renderToStaticMarkup(<CustomSpecialistsView {...props} />);

describe("<CustomSpecialistsView> — states (§11/§13/§32)", () => {
  it("EMPTY: 0 forged → a crafted invite, never a blank", () => {
    const out = render({ specialists: [], loading: false, error: null });
    expect(out).toContain("No custom specialists yet");
    expect(out).toContain("Ask Paige in chat");
    expect(out.length).toBeGreaterThan(0);
  });

  it("LOADING: renders neutral skeletons, no bare 'Loading…'", () => {
    const out = render({ specialists: [], loading: true, error: null });
    expect(out).not.toMatch(/Loading/i);
    expect(out).toContain("Specialists Paige built for your practice");
  });

  it("ERROR: hides the additive section honestly (§13) — no fabricated 'you have none'", () => {
    const out = render({ specialists: [], loading: false, error: "boom" });
    expect(out).toBe("");
  });

  it("MANY: renders a card for every forged specialist, name + description from the row", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      mk({ slug: `s-${i}`, name: `Specialist ${i}`, description: `Does job ${i}.`, display_order: i }),
    );
    const out = render({ specialists: rows, loading: false, error: null });
    for (const r of rows) {
      expect(out).toContain(r.name);
      expect(out).toContain(r.description);
    }
  });
});

describe("<CustomSpecialistsView> — null/blank field guards (§13)", () => {
  it("NULL department: falls back to domain for the remit, no crash", () => {
    const out = render({
      specialists: [mk({ department: null, domain: "onboarding" })],
      loading: false,
      error: null,
    });
    expect(out).toContain("onboarding");
  });

  it("BLANK department AND blank domain: emits NO empty remit chip (never a fabricated chip)", () => {
    const out = render({
      specialists: [mk({ department: "   ", domain: "" })],
      loading: false,
      error: null,
    });
    // The card still renders name + description...
    expect(out).toContain("Renewal Radar");
    // ...but no empty pill: the remit chip class must not appear with blank content.
    expect(out).not.toMatch(/rounded-full[^>]*><\/span>/);
  });

  it("does not crash on a whitespace-only department (trims to a real fallback)", () => {
    expect(() =>
      render({ specialists: [mk({ department: "  \t ", domain: "growth" })], loading: false, error: null }),
    ).not.toThrow();
  });
});

describe("<CustomSpecialistsView> — §-clean", () => {
  it("spends no gold on an act — a learn section has no act moment (§11)", () => {
    const out = render({ specialists: [mk({})], loading: false, error: null });
    expect(out).not.toContain("hsl(var(--gold)/0.6)"); // armed ring
    expect(out).not.toContain("--gold-dark"); // gold-as-text
    expect(out).not.toContain("--accent-foreground"); // gold-fill pairing
    // The specialist plate rests on the indigo hairline, matching the VP grid.
    expect(out).toContain("ring-[hsl(var(--primary-light)/0.7)]");
  });

  it("carries no finance/credit wording in its own copy (§2)", () => {
    const banned = /credit|funding|lend|loan|financ|fico|lender/i;
    for (const props of [
      { specialists: [] as TenantSpecialist[], loading: false, error: null },
      { specialists: [mk({})], loading: false, error: null },
    ]) {
      expect(banned.test(render(props))).toBe(false);
    }
  });
});
