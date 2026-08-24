/**
 * The pack cross-reference, pinned against the pack.
 *
 * A checker nobody verifies is a checker nobody should trust, and this one earned its trust in a
 * specific way worth keeping: it independently reproduced two findings that had been made BY HAND
 * — `scratchBody`/`sandboxActs` computed and drawn nowhere (finding #10, which cost an afternoon
 * when a dead key was ported onto a live surface), and `emptyLine`/`storeEmpty` drawn with no
 * producer (finding #9). Those two are the fixtures below.
 *
 * They also pin the tool against ITS OWN failure modes, every one of which it actually had during
 * the hour it was written: ternary colons read as property names, keys from `return` literals
 * inside nested callbacks, shorthand properties missed entirely, function arguments read as
 * shorthand, and a key rejected because a COMMENT sat between it and the preceding comma. Each
 * bug made the tool report things that were fine — and a checker that cries wolf is worse than no
 * checker, because you learn to skim it.
 */
// Lives under `src/operator/` because that is what vitest's `include` covers, and because the
// pack it grades is this console's. The tool itself stays in `scripts/pack/`.
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";

const run = (...args: string[]) =>
  execFileSync("node", ["scripts/pack/key-xref.mjs", ...args], { encoding: "utf8" });

describe("dead keys — computed by a builder, drawn by no markup", () => {
  it("finds the two that were ported by mistake before this tool existed", () => {
    const out = run("mindVals");
    expect(out).toContain("DEAD  scratchBody");
    expect(out).toContain("DEAD  sandboxActs");
  });

  it("does not report a ternary's middle term as a key", () => {
    // `repoCeil:repo ? rCeil : ''` — `rCeil : ''` reads exactly like a property to a lexer.
    expect(run("codeVals")).not.toContain("rCeil");
  });

  it("does not report a key from a `return` inside a nested callback", () => {
    // `act:() => this.setState(x => { … return { codeDrafts:d, editing:false } })`
    const out = run("codeVals");
    expect(out).not.toContain("DEAD  codeDrafts");
    expect(out).not.toContain("DEAD  editing");
  });

  it("does not report a function ARGUMENT as a shorthand property", () => {
    // `...this.codeVals(face === 'code', ceilingHeld, btn)`
    expect(run("mindVals")).not.toContain("DEAD  ceilingHeld");
  });

  it("counts shorthand properties, and a key preceded by a comment", () => {
    // `memGroups,` is shorthand; `composerPlaceholder:` is preceded by a two-line comment.
    const out = run("mindVals", "--verbose");
    expect(out).toContain("ok    memGroups");
    expect(out).toContain("ok    composerPlaceholder");
  });

  /**
   * Every builder BUILD-ORDER names for Layer 3d. Asserted clean so the day one of them stops
   * being clean — because CD re-delivered the pack — a test says so rather than a session
   * discovering it mid-port.
   */
  it("reports the Settings builders as carrying no dead key", () => {
    const out = run(
      "setupVals", "firstRunVals", "platformVals", "autoVals",
      "capsVals", "vaultVals", "teamVals", "teamFormVals",
    );
    expect(out).toContain("0 key(s) computed and drawn nowhere");
  });
});

describe("orphans — drawn by the markup, produced by nothing", () => {
  it("finds exactly the Storefront pair, and nothing else", () => {
    const out = run("--orphans");
    expect(out).toContain("ORPHAN  storeEmpty");
    expect(out).toContain("ORPHAN  emptyLine");
    expect(out).toContain("2 markup key(s) with no producer.");
  });
});

describe("duplicate declarations are never silently collapsed", () => {
  /**
   * BUILD-ORDER: *"`alertVals` appears twice in the pack… Read both, port the second (8694)."*
   * A tool that read only the first would grade the superseded version and say nothing about the
   * one being ported.
   */
  it("reports both declarations of alertVals", () => {
    const out = run("alertVals");
    expect(out).toContain("declaration 1 of 2");
    expect(out).toContain("declaration 2 of 2");
  });
});
