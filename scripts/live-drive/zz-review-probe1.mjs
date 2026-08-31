import { chromium } from "playwright";
const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = "http://127.0.0.1:5203";
const b = await chromium.launch({ executablePath: EXE });

const measure = `(() => {
  const h = document.querySelector("[data-solo-screen-host]");
  if (!h) return { none: true };
  const cs = getComputedStyle(h);
  return {
    cls: String(h.className), tabindex: h.getAttribute("tabindex"),
    ov: cs.overflowY, sh: h.scrollHeight, ch: h.clientHeight, st: h.scrollTop,
    active: document.activeElement ? (document.activeElement.tagName + "#" + (document.activeElement.id||"") + "." + String(document.activeElement.className).slice(0,50)) : "null",
    activeIsHost: document.activeElement === h,
    text: (h.textContent||"").trim().slice(0,90),
  };
})()`;

// ---- 1. locked surfaces: is assertion 2 vacuous?
for (const r of ["clients","growth","compass"]) {
  const p = await b.newPage({ viewport:{width:1536,height:770} });
  await p.goto(`${BASE}/?route=${r}&theme=dark`, { waitUntil:"networkidle" });
  await p.waitForSelector("[data-solo-screen-host]"); await p.waitForTimeout(1500);
  const bd = await p.$(".tcs-paige-backdrop"); if (bd && await bd.isVisible()) { await bd.click(); await p.waitForTimeout(200); }
  const m = await p.evaluate(measure);
  console.log(`[LOCKED ${r}] ov=${m.ov} sh=${m.sh} ch=${m.ch} overflowBy=${m.sh-m.ch} cls="${m.cls}" text="${m.text}"`);
  await p.close();
}

// ---- 2. settings cold load
const p = await b.newPage({ viewport:{width:1536,height:770} });
await p.goto(`${BASE}/?route=settings&theme=dark`, { waitUntil:"networkidle" });
await p.waitForSelector("[data-solo-screen-host]"); await p.waitForTimeout(2000);
const bd = await p.$(".tcs-paige-backdrop"); if (bd && await bd.isVisible()) { await bd.click(); await p.waitForTimeout(300); }
console.log("[SETTINGS cold]", JSON.stringify(await p.evaluate(measure)));

// ---- 3. what nav links exist (to drive an in-app route change)
const links = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map(a=>({t:(a.textContent||"").trim().slice(0,28), h:a.getAttribute("href"), inMain: !!a.closest("[data-solo-screen-host]")})).filter(x=>x.h&&x.h.startsWith("/solo")));
console.log("[LINKS]", JSON.stringify(links, null, 0).slice(0,2500));
await p.close();
await b.close();
