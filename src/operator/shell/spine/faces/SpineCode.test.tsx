/**
 * The Code face's port contract — `codeVals` L10256–L10424, markup L4015–L4120.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE, said plainly because the split matters here. There is no
 * RTL in this repo and these folders render with `react-dom/server`, so nothing below clicks
 * anything: the scratch lifecycle (create · type · dirty mark · save · revert · close) is driven
 * in Chromium by `ported-surfaces-drive.mjs`, which is the only place it can actually be
 * exercised. What IS proven here is the part a static render can settle honestly — the pure
 * tokenizer, the ceiling-derived act ladder, the absence arms, and the invariant that no branch
 * of this surface produces a merge.
 *
 * THE TOKENIZER GETS ITS OWN CASES BECAUSE IT IS THE CRASH RISK (§32). It is the only loop on
 * this face that runs over arbitrary text, and a throw inside it blanks the whole pane — the
 * silent-blank failure mode, exactly. It is pure, so it is testable directly rather than
 * inferred from a render.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SpineCode } from "@/operator/shell/spine/faces/SpineFaces";
import {
  CODE_LADDER,
  CODE_MERGE_NOTE,
  CODE_NO_FILES,
  CODE_NO_REPO_NAME,
  CODE_RUN_OUTPUT,
  CODE_RUN_STATE,
  codeFoot,
  codeLimits,
  newScratchFile,
  reviewActFor,
  tokenizeCode,
} from "@/operator/shell/spine/faces/spineFaceContract";

describe("tokenizeCode — three classes, and it never throws", () => {
  it("marks a Python comment, a string and a keyword, and nothing else", () => {
    const toks = tokenizeCode('def read(x):  # note "quoted"', "Python");
    expect(toks.find((t) => t.c === "kw")?.t.trim()).toBe("def");
    expect(toks.find((t) => t.c === "cm")?.t).toBe('# note "quoted"');
  });

  it("does not treat a marker INSIDE a string as a comment (CD's own caveat)", () => {
    const toks = tokenizeCode('x = "a # b"', "Python");
    expect(toks.some((t) => t.c === "cm")).toBe(false);
    expect(toks.some((t) => t.c === "st" && t.t === '"a # b"')).toBe(true);
  });

  it("uses `--` for SQL and matches its keywords case-insensitively", () => {
    const toks = tokenizeCode("SELECT id from t -- trailing", "SQL");
    expect(toks.find((t) => t.c === "cm")?.t).toBe("-- trailing");
    expect(toks.filter((t) => t.c === "kw").map((t) => t.t.trim())).toContain("SELECT");
  });

  it("survives the inputs that would blank the pane", () => {
    for (const [line, lang] of [
      ["", "Python"],
      ["   ", "SQL"],
      ['"unterminated', "Python"],
      ["#", "Python"],
      ["--", "SQL"],
      ["λ ± 中文 🙂", "Markdown"],
      ["x".repeat(4000), "Unknown language"],
    ] as const) {
      expect(() => tokenizeCode(line, lang)).not.toThrow();
    }
  });
});

describe("the act is derived from the ceiling, and merge is on no branch of it", () => {
  it("gives exactly one act per rung, in the pack's four arms", () => {
    expect(reviewActFor("Autonomous")?.label).toBe("Push");
    expect(reviewActFor("Act and report")?.label).toBe("Push");
    expect(reviewActFor("Ask first")?.label).toBe("Open a review");
    expect(reviewActFor("Draft only")?.label).toBe("Open a review — yours");
    expect(reviewActFor("Observe")?.label).toBe("Held at Observe");
  });

  it("offers nothing at all when no rung is read, rather than guessing one", () => {
    expect(reviewActFor(null)).toBeNull();
    expect(reviewActFor("Held")).toBeNull();
  });

  /**
   * `paige-writes-code.md` §1: *"No level of the compass grants it, so no branch of the UI
   * produces a merge control."* Absent, not disabled — so this asserts on every rung, not on a
   * disabled attribute.
   */
  it("produces no merge control at ANY rung", () => {
    for (const rung of CODE_LADDER) {
      expect(reviewActFor(rung)?.label.toLowerCase()).not.toContain("merge");
    }
  });
});

describe("the absence arms are the pack's own, and the figures are honest", () => {
  it("renders the no-file state as a state, never as an error", () => {
    const html = renderToStaticMarkup(<SpineCode />);
    expect(html).toContain(CODE_NO_FILES.meta);
    expect(html).toContain(CODE_NO_FILES.note);
    expect(html).toContain(CODE_NO_FILES.foot);
    // No file means no editor, no output block and no act row — the pack's own conditional.
    expect(html).not.toContain(CODE_RUN_STATE.idle);
  });

  it("offers the one control that IS available with nothing open", () => {
    expect(renderToStaticMarkup(<SpineCode />)).toContain("New scratch file");
  });

  it("shows a file's honest repo absence rather than hiding the strip", () => {
    const html = renderToStaticMarkup(
      <SpineCode files={[newScratchFile(1)]} />,
    );
    expect(html).toContain(CODE_NO_REPO_NAME);
    // The review block and the merge note are behind the pack's `onRepo`, so neither appears.
    expect(html).not.toContain(CODE_MERGE_NOTE);
  });

  it("states the run has never happened, and never that it succeeded", () => {
    const html = renderToStaticMarkup(<SpineCode files={[newScratchFile(1)]} />);
    expect(html).toContain(CODE_RUN_STATE.idle);
    expect(html).toContain(CODE_RUN_OUTPUT.idle);
  });

  it("counts repositories from what was read, and em-dashes when none was", () => {
    expect(codeLimits(0)[5][1]).toBe("— bound · merge withheld at every ceiling");
    expect(codeLimits(null)[5][1]).toBe("— bound · merge withheld at every ceiling");
    expect(codeLimits(3)[5][1]).toBe("3 bound · merge withheld at every ceiling");
  });

  it("em-dashes her grant in the foot when the platform holds no rung", () => {
    expect(codeFoot(false, null)).toContain("her own grant is —");
    expect(codeFoot(true, null)).toBe(
      "Held at the ceiling. She reads this surface and writes nothing to it.",
    );
  });
});

describe("the ceiling decides what the face offers", () => {
  it("holds Run and Edit at Observe, and says which control the ceiling holds", () => {
    const html = renderToStaticMarkup(<SpineCode files={[newScratchFile(1)]} ceiling={0} />);
    expect(html).toContain("Run — held");
    expect(html).toContain("Edit — held");
  });

  it("opens both the moment the rung allows it", () => {
    const html = renderToStaticMarkup(<SpineCode files={[newScratchFile(1)]} ceiling={4} />);
    expect(html).toContain(">Run<");
    expect(html).toContain(">Edit<");
  });

  it("spends gold on Run and on nothing else in the face", () => {
    const html = renderToStaticMarkup(<SpineCode files={[newScratchFile(1)]} ceiling={4} />);
    expect(html.split("background:var(--pg-gold)").length - 1).toBe(1);
  });
});

describe("no fixture crossed over from the pack's sandbox", () => {
  /**
   * `P.SANDBOX.files` / `.reviews` and `P.REPOS` are CD's illustration of a connected console.
   * If a later edit pastes one in instead of wiring a read, this fails (§13).
   */
  it("carries none of the pack's invented files, repos or reviews", () => {
    const html = renderToStaticMarkup(<SpineCode files={[newScratchFile(1)]} ceiling={2} />);
    for (const fixture of [
      "drift_read.py",
      "stalled_deals.sql",
      "sweep_summary.md",
      "paige-agent-ai",
      "tenant-products",
      "paige-scratch",
      "paige/brief-shape",
    ]) {
      expect(html).not.toContain(fixture);
    }
  });
});
