// Review aid — drives docs/prototypes/campaigns-overview.html headless, asserts every state
// renders without a JS error, and (optionally) captures a screenshot per state × theme.
// Throwaway with the prototype; not product tooling.
// Run from the repo root:  node docs/prototypes/campaigns-overview.drive.mjs
// Screenshots (if written) land in docs/evidence/ui-delivery/campaigns-overview/ (gitignored-in-spirit;
// not committed — the repo keeps this reproducible script, not 8MB of PNGs).
// Resolves `playwright` from the repo devDependency first, then a global install.
async function loadChromium() {
  for (const spec of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs", "/opt/node22/lib/node_modules/playwright/index.js"]) {
    try { return (await import(spec)).chromium; } catch {}
  }
  throw new Error("playwright not found — npm ci, or install it globally");
}
import { readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const chromium = await loadChromium();
function findChromium(){ const root="/opt/pw-browsers"; try{ for (const d of readdirSync(root)) { for (const c of ["chrome-linux/chrome","chrome-linux/headless_shell","chrome"]) { const p=join(root,d,c); try{ if(statSync(p).isFile()) return p; }catch{} } } }catch{} return undefined; }
const exe = process.env.PW_EXECUTABLE_PATH || findChromium();
const SHOOT = process.env.SHOOT === "1";
const OUT = process.cwd() + "/docs/evidence/ui-delivery/campaigns-overview";
if (SHOOT) mkdirSync(OUT, { recursive: true });

const STATES = ["multi","first-run","one","partial","blocked","approval","active","loading","source-fail","provider-off","stale","brief","dossier","workspace","unavailable","readonly"];
const errors = [];
const browser = await chromium.launch({ executablePath: exe, args:["--no-sandbox"] });
const page = await browser.newContext({ viewport:{ width:2200, height:1400 } }).then(c=>c.newPage());
page.on("pageerror", e=>errors.push("[pageerror] "+String(e)));
// A blocked Google Fonts fetch is a network fact, not a prototype defect; everything else counts.
page.on("console", m=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on("requestfailed", r=>{ if(!/fonts\.g(oogleapis|static)\.com/.test(r.url())) errors.push("requestfailed "+r.url()); });
page.on("dialog", d=>d.dismiss());

await page.goto("file://"+process.cwd()+"/docs/prototypes/campaigns-overview.html", { waitUntil:"networkidle" });
await page.waitForTimeout(300);

const shot = async (name)=>{ if(!SHOOT) return; const el = await page.$("#c-vp-el"); await el.screenshot({ path: join(OUT, name+".png") }); };

for (const th of ["light","dark"]) {
  await page.selectOption("#c-th", th);
  await page.selectOption("#c-vp", "1366x768");
  await page.selectOption("#c-paige", "off");
  await page.selectOption("#c-ws", "meridian");
  for (const s of STATES) {
    await page.click(`.rv-steps button[data-sc="${s}"]`);
    await page.waitForTimeout(s==="loading"?120:200);
    // assert the surface actually rendered content (not a blank frame)
    const filled = await page.$eval("#app", e => e.textContent.trim().length > 40);
    if(!filled) errors.push(`state '${th}/${s}' rendered blank`);
    await shot(`${th}-1366-${s}`);
  }
}

// Interaction assertions: dossier Escape closes + focus, and the honest save error→retry lifecycle.
await page.selectOption("#c-th","light");
await page.click('.rv-steps button[data-sc="multi"]'); await page.waitForTimeout(120);
await page.click('[data-dossier="br1"]'); await page.waitForTimeout(220);
const focusOnOpen = await page.evaluate(()=>document.activeElement && document.activeElement.id);
await page.keyboard.press("Escape"); await page.waitForTimeout(160);
const drawerGone = await page.evaluate(()=>!document.getElementById("dw"));

await page.click('.rv-steps button[data-sc="brief"]'); await page.waitForTimeout(160);
await page.click('[data-act="bb-save-draft"]'); await page.waitForTimeout(1000);
const showsError = !!(await page.$('[data-act="save-retry"]'));
await page.click('[data-act="save-retry"]'); await page.waitForTimeout(2000);
const recovered = await page.evaluate(()=>!document.getElementById("dw")); // success closes the drawer

await browser.close();

const ok = errors.length===0 && drawerGone && focusOnOpen==="dw-x" && showsError && recovered;
console.log(JSON.stringify({ states: STATES.length*2, drawerClosedByEscape: drawerGone, focusOnOpen, saveShowsError: showsError, saveRecovered: recovered, errorCount: errors.length, errors, ok }, null, 2));
process.exit(ok ? 0 : 1);
