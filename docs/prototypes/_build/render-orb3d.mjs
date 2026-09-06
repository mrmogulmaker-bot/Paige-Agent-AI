// §32 headless render + behavioural proof for the real-three.js Mind orb.
// WebGL via SwiftShader (software rasteriser) so it runs in CI/headless.
// Screenshots → scratchpad/orb3dshots/. Prints a JSON assertion report.
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs"; import path from "node:path";

const FILE = "file://" + path.resolve("docs/prototypes/command-center-mind-gate1.html");
const OUT = "/tmp/claude-0/-home-user-Paige-Agent-AI/a6cb6320-ebae-5c67-923e-03f9ced8b78a/scratchpad/orb3dshots";
fs.mkdirSync(OUT, { recursive: true });

const GL_FLAGS = ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];

const R = {};
async function litPixels(page, sel) {
  // screenshot the element → decode as a static PNG in a fresh 2D canvas → count lit pixels.
  // (avoids the preserveDrawingBuffer:false readback artefact; the compositor path is truthful)
  const el = await page.$(sel);
  const buf = await el.screenshot();
  const dataUrl = "data:image/png;base64," + buf.toString("base64");
  return await page.evaluate(async (u) => {
    const img = new Image(); img.src = u;
    await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, samples = 0, sum = 0;
    for (let i = 0; i < d.length; i += 4 * 53) { samples++; const v = d[i] + d[i + 1] + d[i + 2]; sum += v; if (d[i + 3] > 8 && v > 40) lit++; }
    return { samples, lit, litFrac: +(lit / samples).toFixed(3), w: c.width, h: c.height };
  }, dataUrl);
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: GL_FLAGS });
const p = await b.newPage({ viewport: { width: 1720, height: 1300 }, deviceScaleFactor: 1 });
const errs = [];
p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", e => errs.push("PAGEERR " + e.message));
await p.goto(FILE, { waitUntil: "load" });
await p.waitForTimeout(1200); // let the orb animate a few frames

const shot = async n => { const el = await p.$("#viewport"); await el.screenshot({ path: path.join(OUT, n + ".png") }); };
const setTheme = t => p.click(t === "light" ? "#t-light" : "#t-dark");
const setVp = v => p.selectOption("#vp", v);
const setScn = s => p.selectOption("#scenario", s);

// engine actually initialised (not the fallback)?
R.engineAvailable = await p.evaluate(() => window.MindOrb && window.MindOrb.available());
R.fallbackHidden = await p.evaluate(() => document.getElementById("orb-fallback").hidden);

// pixel-lit proof (the orb genuinely paints), dark then light
await setTheme("dark"); await setVp("1536x770"); await p.waitForTimeout(700);
R.lit_dark = await litPixels(p, "#orb");
await setTheme("light"); await p.waitForTimeout(700);
R.lit_light = await litPixels(p, "#orb");

// viewport × theme matrix
const vps = ["1536x770", "1366x768", "1024x768", "900x1000", "390x844"];
for (const t of ["dark", "light"]) { await setTheme(t);
  for (const v of vps) { await setVp(v); await p.waitForTimeout(600); await shot(`vp_${v}_${t}`); } }

// paige open
await setTheme("dark"); await setVp("1536x770"); await p.click("#p-open"); await p.waitForTimeout(600); await shot("paige_open_dark"); await p.click("#p-closed");

// no vertical page scroll inside the viewport
R.mindNoScroll = await p.evaluate(() => { const m = document.querySelector(".mind"); return m.scrollHeight <= m.clientHeight + 2; });

// states
for (const s of ["firstuse", "partial", "unavailable", "loading", "switching"]) { await setScn(s); await p.waitForTimeout(600); await shot(`state_${s}`); }
await setScn("populated"); await p.waitForTimeout(500);

// focus via callout, then a lit check while focused, then reset
await p.click(".callout"); await p.waitForTimeout(600); await shot("focus_domain");
R.lit_focused = await litPixels(p, "#orb");
R.calloutPressed = await p.evaluate(() => [...document.querySelectorAll(".callout")].some(c => c.getAttribute("aria-pressed") === "true"));
await p.click("#oc-reset"); await p.waitForTimeout(500);
R.resetClearedFocus = await p.evaluate(() => [...document.querySelectorAll(".callout")].every(c => c.getAttribute("aria-pressed") === "false"));

// search
await p.fill("#search", "agreement"); await p.waitForTimeout(500); await shot("search"); await p.fill("#search", "");

// pause
await p.click("#pause-btn"); await p.waitForTimeout(300);
R.paused = await p.$eval("#pause-btn", el => el.getAttribute("aria-pressed"));
R.lit_paused = await litPixels(p, "#orb");
await p.click("#pause-btn");

// evidence drawer via engine onPick path (open a fact drawer directly to prove wiring)
await p.evaluate(() => openFactDrawer(DOMAINS.find(d => d.key === "knowledge"), 0));
await p.waitForTimeout(300); R.drawerOpened = !!(await p.$(".drawer")); await shot("drawer_evidence");
R.focusOnClose = await p.evaluate(() => document.activeElement && document.activeElement.id === "dr-close");
await p.keyboard.press("Escape"); await p.waitForTimeout(200); R.drawerClosedEsc = !(await p.$(".drawer"));

// reduced motion — orb still renders (static), lit
await p.click("#rm-btn"); await p.waitForTimeout(500); await shot("reduced_motion");
R.reduced = await p.$eval("#rm-btn", el => el.getAttribute("aria-pressed"));
R.lit_reduced = await litPixels(p, "#orb");
await p.click("#rm-btn");

// keyboard orbit (ArrowRight) then reset — no crash
await p.focus("#orb"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowUp"); await p.waitForTimeout(200);
R.keyboardOk = await p.evaluate(() => window.MindOrb.available());

R.errors = errs;
console.log("=== ENGINE (SwiftShader) ===");
console.log(JSON.stringify(R, null, 1));
console.log("shots:", fs.readdirSync(OUT).length);
await b.close();

// ---- forced WebGL-failure run → fallback must show, never blank ----
const F = {};
const b2 = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--disable-3d-apis", "--disable-webgl", "--disable-webgl2"] });
const p2 = await b2.newPage({ viewport: { width: 1536, height: 900 } });
const errs2 = []; p2.on("pageerror", e => errs2.push("PAGEERR " + e.message));
await p2.goto(FILE, { waitUntil: "load" }); await p2.waitForTimeout(800);
F.engineAvailable = await p2.evaluate(() => window.MindOrb && window.MindOrb.available());
F.fallbackShown = await p2.evaluate(() => !document.getElementById("orb-fallback").hidden);
F.fallbackDomains = await p2.evaluate(() => document.querySelectorAll("#ofb-domains .ofb-dom").length);
await (await p2.$("#viewport")).screenshot({ path: path.join(OUT, "fallback_webgl_off.png") });
// clicking a fallback domain still opens the evidence drawer
await p2.click("#ofb-domains .ofb-dom"); await p2.waitForTimeout(300);
F.drawerFromFallback = !!(await p2.$(".drawer"));
F.errors = errs2;
console.log("=== FALLBACK (WebGL disabled) ===");
console.log(JSON.stringify(F, null, 1));
await b2.close();
