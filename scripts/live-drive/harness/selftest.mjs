import path from "node:path";
import { runHarness } from "./shell-harness.mjs";
const F = (n) => "file://" + path.resolve(import.meta.dirname, "fixtures", n);
const cases = [
  ["clean.html",            null,        "control — all five must pass"],
  ["five-slots.html",       "slots",     "a five-slot rail"],
  ["missing-minwidth.html", "minWidth",  "a child without min-width:0"],
  ["doc-scroll.html",       "scrollbar", "a document scrollbar"],
  ["low-contrast.html",     "contrast",  "a sub-AA pair against --pg-env"],
  // Added 2026-08-23 after the first real-shell run. `grid` counted tracks only, so a rail that
  // drifted off 216 kept three tracks and passed; `minWidth` flagged every flex child, which on
  // the real shell was 16 hits of noise to 4 real ones. The second fixture carries BOTH a
  // shrinkable text child (must fire) and a flex-none icon (must not) — without the icon it would
  // prove the check still catches, but not that the narrowing is safe.
  ["drifted-rail.html",     "grid",      "a 300px rail that still has three tracks"],
  ["shrinkable-nomin.html", "minWidth",  "a shrinkable text child with no min-width:0"],
];
let bad = 0;
for (const [file, expect, desc] of cases) {
  const r = await runHarness({ url: F(file), slots: ["fleet","relationships","campaigns","marketplace","analytics","settings"], name: file.replace(".html","") });
  if (expect === null) {
    const ok = r.ok;
    if (!ok) bad++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${desc} → failed=[${r.failed.join(",")}]`);
  } else {
    const caught = r.failed.includes(expect);
    const onlyThis = r.failed.length === 1;
    if (!caught) bad++;
    console.log(`${caught ? "CAUGHT" : "MISSED"} ${desc} → failed=[${r.failed.join(",")}]${caught && !onlyThis ? "  (also tripped others)" : ""}`);
    if (caught) console.log(`        detail: ${r.checks[expect].detail}`);
  }
}
console.log(bad === 0 ? "\nharness is falsifiable on every arm" : `\n${bad} arm(s) did not behave`);
process.exit(bad === 0 ? 0 : 1);
