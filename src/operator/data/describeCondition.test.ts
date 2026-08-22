import { describe, expect, it } from "vitest";
import { describeChannels, describeCondition } from "./describeCondition";

const LABELS = { "systems_check.failing_count": "Failing checks" };

describe("describeCondition", () => {
  it("renders a leaf with its signal label and operator symbol", () => {
    expect(
      describeCondition({ signal: "systems_check.failing_count", op: "gte", value: 3 }, LABELS),
    ).toBe("Failing checks ≥ 3");
  });

  it("falls back to the raw signal key when no label is registered", () => {
    expect(describeCondition({ signal: "llm.error_rate", op: "gt", value: 0.1 })).toBe(
      "llm.error_rate > 0.1",
    );
  });

  it("renders a sustained-for window", () => {
    expect(
      describeCondition({ signal: "llm.error_rate", op: "gt", value: 0.1, for_minutes: 30 }),
    ).toBe("llm.error_rate > 0.1 for 30 min");
  });

  it("renders booleans as words, not as 1/0", () => {
    expect(describeCondition({ signal: "systems_check.blocking_present", op: "eq", value: true })).toBe(
      "systems_check.blocking_present = true",
    );
  });

  it("joins all_of with AND and any_of with a parenthesised OR", () => {
    const c = {
      all_of: [
        { signal: "a", op: "gte", value: 1 },
        { any_of: [{ signal: "b", op: "lt", value: 2 }, { signal: "c", op: "eq", value: 3 }] },
      ],
    };
    expect(describeCondition(c)).toBe("a ≥ 1 AND (b < 2 OR c = 3)");
  });

  it("does not wrap a single-element group in redundant syntax", () => {
    expect(describeCondition({ all_of: [{ signal: "a", op: "gte", value: 1 }] })).toBe("a ≥ 1");
  });

  // §13 — the whole point: malformed must be VISIBLY malformed, never a plausible sentence
  // and never blank. An operator who cannot tell a broken rule from a working one will
  // trust a rule that silently never fires.
  it.each([
    [null, "unreadable condition"],
    [undefined, "unreadable condition"],
    ["gte 3", "unreadable condition"],
    [{}, "unreadable condition"],
    [{ all_of: [] }, "unreadable condition (empty all_of)"],
    [{ any_of: [] }, "unreadable condition (empty any_of)"],
  ])("reports %j as unreadable rather than guessing", (input, expected) => {
    expect(describeCondition(input)).toBe(expected);
  });

  it("names an unsupported operator instead of rendering a blank comparison", () => {
    // `present`/`absent`/`changed` are rejected by the evaluator; a stored rule using one
    // must READ as broken here, not as a condition with a missing middle.
    expect(describeCondition({ signal: "a", op: "present" })).toBe('a — unreadable operator "present"');
  });

  it("stops recursing past the evaluator's own depth bound", () => {
    let c: unknown = { signal: "a", op: "gte", value: 1 };
    for (let i = 0; i < 6; i++) c = { all_of: [c] };
    expect(describeCondition(c)).toBe("unreadable condition (nested too deeply)");
  });
});

describe("describeChannels", () => {
  it("keeps string channels and drops anything else", () => {
    expect(describeChannels(["in_app", 7, null, "email"])).toEqual(["in_app", "email"]);
  });

  it("returns nothing for a non-array", () => {
    expect(describeChannels({ in_app: true })).toEqual([]);
    expect(describeChannels(null)).toEqual([]);
  });
});
