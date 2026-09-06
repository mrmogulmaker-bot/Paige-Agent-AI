// @vitest-environment node
//
// P1 UI hotfix — regression guard for the dedicated Solo Paige chat horizontal-overflow defect.
//
// WHY A SOURCE-CONTRACT TEST, NOT A LAYOUT TEST. The project's vitest runs jsdom with `css:false` and
// does NO layout, so a unit test cannot observe a rendered horizontal scrollbar (that is owed to a
// real browser, §32.c). What a test CAN lock is the DOM contract that removes the overflow at its
// source and keeps content reachable — so a future refactor cannot silently reintroduce the defect or
// "fix" it by clipping. The actual rendered-pixel proof at each viewport is recorded as Proof Owed in
// the UI evidence record.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const CHAT = readFileSync("src/components/dashboard/PaigeAIChat.tsx", "utf8");
const DIAGRAM = readFileSync("src/components/chat/EntityDiagramCard.tsx", "utf8");
const MARKDOWN = readFileSync("src/components/chat/MarkdownMessage.tsx", "utf8");

describe("dedicated Solo chat — horizontal overflow is fixed at the source, not clipped", () => {
  it("the transcript is the ONE vertical scroll owner and cannot render a horizontal bar", () => {
    // overflow-x-hidden sits WITH overflow-y-auto on the transcript. Without it, overflow-y-auto makes
    // the browser compute overflow-x:auto and render the reported bar; with the min-w-0 + wrap fixes
    // below, content wraps so nothing is clipped — this only forecloses a stray future overflow.
    expect(CHAT).toMatch(/flex-1 min-h-0 overflow-y-auto overflow-x-hidden/);
    // still exactly one intentional vertical scroll owner, keyed for the Solo transcript
    expect(CHAT).toMatch(/data-paige-transcript-scroll=\{soloTenantSafety \? "true" : undefined\}/);
  });

  it("the message bubble (the app branch every live mount uses) carries min-w-0 so it can shrink", () => {
    // The ROOT cause: a flex item defaults to min-width:auto and refuses to shrink below its content's
    // min-content width. The non-cd branch that all live mounts use must carry min-w-0.
    expect(CHAT).toMatch(/"max-w-\[80%\] min-w-0 rounded-lg p-4"/);
    // and it must NOT reintroduce a max-w-full that would break the 80% cap
    expect(CHAT).not.toMatch(/max-w-\[80%\] min-w-0 max-w-full/);
  });

  it("the user's own message text wraps long tokens instead of forcing the transcript wide", () => {
    expect(CHAT).toMatch(/<p className="text-sm whitespace-pre-wrap break-words">\{message\.content\}<\/p>/);
  });

  it("a wide entity diagram self-scrolls in its own container so overflow-x-hidden never clips it", () => {
    expect(DIAGRAM).toMatch(/className="rounded-xl my-3 w-full max-w-full overflow-x-auto"/);
  });

  it("a wide GFM table (a common Paige output) self-scrolls in its own wrapper, never clipped", () => {
    // §39 fold: the transcript's overflow-x-hidden would clip a wide markdown table with no scroll
    // wrapper, making its rightmost columns unreachable. MarkdownMessage overrides `table` to wrap it
    // in an overflow-x-auto container so it self-scrolls (the wide-content pattern), and the table's
    // own width class no longer forces it wider than that wrapper. A rendered proof lives in
    // MarkdownMessage.test.tsx.
    expect(MARKDOWN).toMatch(/table: \(\{ node, \.\.\.props \}\) => \(/);
    expect(MARKDOWN).toMatch(/<div className="my-2 max-w-full overflow-x-auto">/);
    expect(MARKDOWN).not.toMatch(/\[&_table\]:my-2/);
  });

  it("the Solo composer action bar renders the caller's autonomy control and can wrap on narrow widths", () => {
    expect(CHAT).toMatch(/data-solo-composer-actions/);
    expect(CHAT).toMatch(/flex min-w-0 flex-wrap items-center gap-1\.5 border-t/);
    expect(CHAT).toMatch(/\{composerAutonomyControl\}/);
  });
});

describe("the fake static permissions badge is gone from the shell header (§13)", () => {
  it("TenantCommandCenterShell no longer renders a hardcoded 'Ask first' authority span", () => {
    const shell = readFileSync("src/components/tenant-shell/TenantCommandCenterShell.tsx", "utf8");
    expect(shell).not.toMatch(/tcs-paige-authority/);
    expect(shell).not.toMatch(/<LockKeyhole aria-hidden size=\{13\} \/>Ask first/);
  });
});
