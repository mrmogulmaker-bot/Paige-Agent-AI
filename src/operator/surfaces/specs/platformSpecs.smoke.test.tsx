/**
 * Runtime smoke for PLATFORM_SPECS (§32 — a green `tsc` is not a working render).
 *
 * Three things a typecheck cannot prove, proved here against the real registry:
 *   1. every one of the twenty-six route keys this lot owns is addressable in the operator
 *      tree (`OPERATOR_BRANCHES`), and nothing here addresses a tab that does not exist;
 *   2. every block `kind` reaches a handled branch of `OperatorPanel`'s body switch — an
 *      unhandled discriminant returns `undefined` and renders an empty card;
 *   3. every spec renders end to end with NO data supplied, which is the state the console
 *      is actually in today.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import OperatorPanel from "../OperatorPanel";
import { operatorPanelKeys } from "../panelSpecs";
import { PLATFORM_SPECS } from "./platformSpecs";

/** The branches this lot owns, as registry slugs. */
const OWNED = /^(provisioning|support|comms|settings)\//;

describe("PLATFORM_SPECS", () => {
  it("addresses only real tabs, and every tab in its branches", () => {
    const addressable = new Set(operatorPanelKeys());
    const owned = operatorPanelKeys().filter((k) => OWNED.test(k));
    const specced = Object.keys(PLATFORM_SPECS);

    expect(specced.filter((k) => !addressable.has(k))).toEqual([]);
    expect(owned.filter((k) => !specced.includes(k))).toEqual([]);
    expect(specced).toHaveLength(26);
  });

  it("renders every spec with nothing supplied", () => {
    for (const [key, spec] of Object.entries(PLATFORM_SPECS)) {
      // React escapes `'` and `&` in text nodes; compare against the unescaped copy.
      const html = renderToStaticMarkup(
        <MemoryRouter>
          <OperatorPanel spec={spec} />
        </MemoryRouter>,
      )
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");
      // The panel drew, and it drew THIS panel — not a blank shell.
      expect(html, key).toContain(spec.title);
      expect(html, key).toContain(spec.eyebrow);
      for (const block of spec.blocks) {
        const where = `${key} · ${block.id}`;
        if (block.title) expect(html, where).toContain(block.title);
        if (block.foot) expect(html, where).toContain(block.foot);
        // Every block must reach a HANDLED branch of the body switch. An unhandled `kind`
        // falls off the end of the switch, returns undefined and draws an empty card that a
        // title-only assertion would happily pass — so assert on what the BODY emits.
        const body = block.body;
        switch (body.kind) {
          case "notWired":
            expect(html, where).toContain(body.what ?? "");
            break;
          case "rows":
            if (body.rows.length) body.rows.forEach((r) => expect(html, where).toContain(r.label));
            else expect(html, where).toContain(body.empty ?? "");
            break;
          case "fields":
            body.fields.forEach((f) => expect(html, where).toContain(f.label));
            break;
          case "feed":
            expect(html, where).toContain(body.empty ?? "");
            break;
          case "lanes":
            body.lanes.forEach((l) => expect(html, where).toContain(l.label));
            break;
          default:
            throw new Error(`${where}: unexpected body kind for this lot`);
        }
      }
    }
  });

  it("never spends the em dash on prose — only where a number is unknown", () => {
    for (const [key, spec] of Object.entries(PLATFORM_SPECS)) {
      for (const kpi of spec.kpis ?? []) {
        // A KPI value is always the honest unknown here; its unit may frame a missing count
        // ("— seats") but must never be a stranded dash on its own.
        expect(kpi.value, `${key} · ${kpi.label}`).toBeNull();
        expect(kpi.unit?.trim(), `${key} · ${kpi.label}`).not.toBe("—");
      }
    }
  });
});
