// Bundle the production engine factory and drive it headless (SwiftShader). Proves createMindOrb()
// renders lit pixels and disposes cleanly. Run: node docs/prototypes/_build/mind-engine-smoke.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";

const { chromium } = pw;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const OUT = "/tmp/claude-0/-home-user-Paige-Agent-AI/a6cb6320-ebae-5c67-923e-03f9ced8b78a/scratchpad";
const BUNDLE = path.join(OUT, "mind-engine-smoke.bundle.js");

// 1. bundle the TS entry (+ three) via the repo's esbuild
execFileSync("node_modules/.bin/esbuild", [
  "docs/prototypes/_build/mind-engine-smoke.entry.ts",
  "--bundle", "--format=iife", "--outfile=" + BUNDLE, "--log-level=warning",
], { cwd: ROOT, stdio: "inherit" });

const bundle = fs.readFileSync(BUNDLE, "utf8");
const html = `<!doctype html><html><body style="margin:0;background:#08070b">
<canvas id="orb" style="width:900px;height:600px;display:block"></canvas>
<script>${bundle}</script></body></html>`;
const HTML = path.join(OUT, "mind-engine-smoke.html");
fs.writeFileSync(HTML, html);

const GL = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: GL });
const p = await b.newPage({ viewport: { width: 940, height: 640 } });
const errs = [];
p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("file://" + HTML, { waitUntil: "load" });

const R = await p.evaluate(async () => {
  const { createMindOrb, nodes, rings } = window.__mindSmoke;
  const canvas = document.getElementById("orb");
  const res = createMindOrb(canvas, { nodes, rings, dark: true, running: true, reduced: false, onPick: () => {} });
  if ("error" in res) return { ok: false, error: res.error };
  await new Promise((r) => setTimeout(r, 700)); // let it animate a few frames
  const avail = res.handle.available();
  res.handle.dispose();
  const availAfterDispose = res.handle.available();
  return { ok: true, avail, availAfterDispose, nodeCount: nodes.length };
});

// lit-pixel proof via element screenshot decoded on a fresh 2D canvas (compositor path)
async function litPixels() {
  const buf = await (await p.$("#orb")).screenshot();
  const dataUrl = "data:image/png;base64," + buf.toString("base64");
  return await p.evaluate(async (u) => {
    const img = new Image(); img.src = u; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 53) { n++; if (d[i + 3] > 8 && d[i] + d[i + 1] + d[i + 2] > 40) lit++; }
    return { samples: n, lit, litFrac: +(lit / n).toFixed(3) };
  }, dataUrl);
}

// re-create for the screenshot (we disposed above); prove a fresh instance paints
await p.evaluate(() => {
  const { createMindOrb, nodes, rings } = window.__mindSmoke;
  const res = createMindOrb(document.getElementById("orb"), { nodes, rings, dark: true, running: true, reduced: false, onPick: () => {} });
  window.__mindLive = "error" in res ? null : res.handle;
});
await p.waitForTimeout(700);
R.lit = await litPixels();
await p.evaluate(() => window.__mindLive && window.__mindLive.dispose());
R.errors = errs;

console.log(JSON.stringify(R, null, 1));
await b.close();
