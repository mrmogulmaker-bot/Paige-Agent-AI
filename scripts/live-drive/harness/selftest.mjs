import path from "node:path";
import { runHarness } from "./shell-harness.mjs";
const F = (n) => "file://" + path.resolve(import.meta.dirname, "fixtures", n);
const cases = [
  ["clean.html",            null,        "control — all five must pass"],
  ["five-slots.html",       "slots",     "a five-slot rail"],
  ["missing-minwidth.html", "minWidth",  "a child without min-width:0"],
  ["doc-scroll.html",       "scrollbar", "a document scrollbar"],
  ["low-contrast.html",     "contrast",  "a sub-AA pair against --pg-env"],
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
