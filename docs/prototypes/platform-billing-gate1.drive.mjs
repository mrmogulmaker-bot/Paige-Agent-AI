// Gate 1 review aid — drives docs/prototypes/platform-billing-gate1.html headless and asserts
// every required data-state is reachable. Throwaway with the prototype; not product tooling.
// Run from the repo root: node docs/prototypes/platform-billing-gate1.drive.mjs
// Resolves `playwright` from the repo devDependency first, then a global install.
async function loadChromium() {
  for (const spec of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
    try { return (await import(spec)).chromium; } catch {}
  }
  throw new Error("playwright not found — npm ci, or install it globally");
}
const chromium = await loadChromium();
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const REQUIRED = ["plan-current","plan-beta","plan-trialing","plan-promo","plan-trial-ended","plan-cancel-scheduled","plan-canceled","plan-unsupported","billing-unavailable","plan-none","plan-loading","plan-error","plan-subaccount","portal-entry","portal-unavailable","usage-included","usage-warn-75","usage-warn-90","usage-exhausted","usage-no-meter","addon-available","addon-included","addon-not-billable","addon-selected","addon-pending","addon-active","addon-declined","addon-failed","addon-cancel-scheduled","role-refusal","account-switch","client-billing-boundary","operator-plan-config","operator-addon-config"];
function findChromium(){ const root="/opt/pw-browsers"; for (const d of readdirSync(root)) { for (const c of ["chrome-linux/chrome","chrome-linux/headless_shell","chrome"]) { const p=join(root,d,c); try{ if(statSync(p).isFile()) return p; }catch{} } } return undefined; }
const exe = process.env.PW_EXECUTABLE_PATH || findChromium();
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport:{width:1600,height:1000} });
const errors=[]; page.on("pageerror", e=>errors.push(String(e))); // A blocked Google Fonts fetch is a network fact, not a prototype defect; everything else counts.
page.on("console", m=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on("requestfailed", r=>{ if(!/fonts\.g(oogleapis|static)\.com/.test(r.url())) errors.push("requestfailed "+r.url()); });
page.on("dialog", d=>d.dismiss());
await page.goto("file://"+process.cwd()+"/docs/prototypes/platform-billing-gate1.html");
const seen = new Set();
const collect = async (label) => { const ids = await page.$$eval("[data-state]", els => els.filter(e=>!e.closest("[hidden]") && !e.hidden).map(e=>e.getAttribute("data-state"))); ids.forEach(i=>seen.add(i)); };
const visible = async (sel) => page.$eval(sel, e => !e.closest("[hidden]") && e.offsetParent !== null);
await collect("initial");
for (const v of ["current","beta","trialing","promo","trialended","cancelsched","canceled","unsupported","unavailable","none","loading","error"]) { await page.click(`[data-plan="${v}"]`); await collect("plan:"+v); }
for (const v of ["included","warn75","warn90","exhausted","nometer"]) { await page.click(`[data-usage="${v}"]`); await collect("usage:"+v); }
for (const v of ["entry","unavailable"]) { await page.click(`[data-portal="${v}"]`); await collect("portal:"+v); }
await page.click('[data-viewer="member"]'); await collect("member");
const memberButtonsDisabled = await page.$$eval("#addonList button", bs => bs.every(b=>b.disabled));
await page.click('[data-viewer="adminonly"]'); await collect("admin");
const adminButtonsDisabled = await page.$$eval("#addonList button", bs => bs.every(b=>b.disabled)) && await page.$eval("#roleRefusal", e=>!e.hidden);
await page.click('[data-viewer="sub"]'); await collect("sub");
await page.click('[data-viewer="switch"]'); await collect("switch");
await page.click('[data-viewer="admin"]'); await collect("admin");
// add-on journey
await page.click('[data-enable="voice"]'); await collect("selected");
await page.click('[data-decline="voice"]'); await collect("declined");
await page.click('[data-enable="voice"]'); await page.click('[data-continue="voice"]'); await collect("pending");
await page.click('[data-mock="voice:failed"]'); await collect("failed");
await page.click('[data-enable="voice"]'); await page.click('[data-continue="voice"]'); await page.click('[data-mock="voice:active"]'); await collect("active");
await page.click('[data-cancel="voice"]'); await collect("cancel-scheduled");
await page.click('[data-screen="boundary"]'); await collect("boundary");
await page.click('[data-screen="operator"]'); await collect("operator");
await page.click('[data-pgtheme="dark"]'); await page.click('[data-vp="900x1000"]'); await collect("dark-narrow");
const missing = REQUIRED.filter(r=>!seen.has(r));
console.log(JSON.stringify({ required: REQUIRED.length, seen: [...seen].filter(s=>REQUIRED.includes(s)).length, missing, memberButtonsDisabled, adminButtonsDisabled, pageErrors: errors }, null, 2));
await browser.close();
process.exit(missing.length||errors.length||!memberButtonsDisabled||!adminButtonsDisabled?1:0);
