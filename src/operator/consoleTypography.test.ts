import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TABULAR FIGURES MAY NEVER BE INHERITED BY PROSE.
 *
 * The console shipped with `font-variant-numeric: tabular-nums` on its root, which inherits into
 * every descendant. In Schibsted Grotesk the tabular set widens the COMMA and the PERIOD to a full
 * digit advance so columns of figures line up — and in a sentence that renders as a gap in front of
 * every comma and every period:
 *
 *     Drawn , not wired .
 *
 * The owner reported it across every operator surface on 2026-08-24. The tell that separates it
 * from a string-composition bug is that the gap never appears before `·`, which is not in the
 * numeric set — and the reason no test caught it is that this defect lives entirely in the render:
 * the DOM text was always clean, so every `textContent` assertion in the suite passed while the
 * screen was visibly wrong. A DOM assertion structurally cannot see this. The stylesheet can.
 *
 * So the guard reads the stylesheet, and it reports its own scope: it names how many declarations
 * it found rather than only that it found nothing wrong (a guard that enumerates has to be asked
 * what it did not look at).
 */

const CSS_PATH = resolve(__dirname, "../index.css");

/** The one sanctioned home: an explicit opt-in utility every figure site applies by hand. */
const ALLOWED_SELECTOR = ".tabular-nums, [class*=\"tabular\"]";

function declarations(css: string): { selector: string; decl: string }[] {
  // Comments come out FIRST. The note on the console root explains this very defect and names
  // the property to do it, so a scanner that reads comments finds a declaration that is only a
  // sentence about one. (It did, on the first run of this guard.)
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const out: { selector: string; decl: string }[] = [];
  // Blocks are `<selector> { <body> }`. Nested at-rules keep their own braces, so match the
  // innermost pairs — enough to attribute a declaration to the selector that carries it.
  const block = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(bare)) !== null) {
    const body = m[2];
    if (!body.includes("font-variant-numeric")) continue;
    const selector = m[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ").trim();
    for (const line of body.split(";")) {
      if (line.includes("font-variant-numeric")) out.push({ selector, decl: line.trim() });
    }
  }
  return out;
}

describe("tabular figures are opted into, never inherited", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  const found = declarations(css);

  it("declares font-variant-numeric in exactly one rule, and that rule is the opt-in utility", () => {
    // Scope, stated: this reads src/index.css only — a component-level `style={{ fontVariantNumeric }}`
    // or a second stylesheet is outside what this guard can see, and is not claimed to be clean.
    expect(
      found.map((f) => `${f.selector} { ${f.decl} }`),
      `font-variant-numeric declarations found in src/index.css: ${found.length}`,
    ).toEqual([`${ALLOWED_SELECTOR} { font-variant-numeric: tabular-nums }`]);
  });

  it("never sets it on a root, body, or console-wide selector", () => {
    for (const { selector } of found) {
      expect(selector).not.toMatch(/(^|[\s,])(:root|html|body|\*)([\s,{]|$)/);
      expect(selector).not.toMatch(/data-operator|operator-root|\.console/i);
    }
  });
});
