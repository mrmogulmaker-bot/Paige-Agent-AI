// Negative controls for the owner's reject-on-sight criteria (2026-08-23).
// Each fixture must turn exactly its own check red; a clean control must pass all three.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { spineFloor, typeLadder, goldOnlyOnAct } from "./assertions.mjs";

const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
const exe = fs.readdirSync(base).filter((d) => d.startsWith("chromium-"))
  .map((d) => path.join(base, d, "chrome-linux/chrome")).find((p) => fs.existsSync(p));
const F = (n) => "file://" + path.resolve(import.meta.dirname, "fixtures", n);

const cases = [
  ["clean-geometry.html", null, "control — all three must pass"],
  ["thin-spine.html", "spineFloor", "a 300px spine (floor is 340)"],
  ["five-type-sizes.html", "typeLadder", "a fifth type size"],
  ["gold-fill-resting.html", "goldOnlyOnAct", "gold fill on a resting rail slot"],
];

const b = await chromium.launch(exe ? { executablePath: exe } : {});
let bad = 0;
for (const [file, expect, desc] of cases) {
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: "dark" });
  await p.goto(F(file), { waitUntil: "load" });
  const r = {
    spineFloor: await spineFloor(p),
    typeLadder: await typeLadder(p),
    goldOnlyOnAct: await goldOnlyOnAct(p),
  };
  await p.close();
  const failed = Object.entries(r).filter(([, v]) => !v.ok).map(([k]) => k);
  if (expect === null) {
    if (failed.length) bad++;
    console.log(`${failed.length ? "FAIL" : "PASS"}  ${desc} → failed=[${failed}]`);
    for (const [k, v] of Object.entries(r)) if (!v.ok) console.log(`        ${k}: ${v.detail}`);
  } else {
    const caught = failed.includes(expect);
    if (!caught) bad++;
    console.log(`${caught ? "CAUGHT" : "MISSED"} ${desc} → failed=[${failed}]`);
    if (caught) console.log(`        ${r[expect].detail}`);
  }
}
await b.close();
console.log(bad === 0 ? "\nall three new arms falsifiable" : `\n${bad} arm(s) misbehaved`);
process.exit(bad ? 1 : 0);
