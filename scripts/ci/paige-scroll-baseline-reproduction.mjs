#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const baselineRef = process.argv[2] ?? "origin/main";
const baselineSha = execFileSync("git", ["rev-parse", baselineRef], { cwd: root, encoding: "utf8" }).trim();
const show = (file) => execFileSync("git", ["show", `${baselineSha}:${file}`], { cwd: root, encoding: "utf8" });
const normalSource = show("src/components/app/PaigeChat.tsx");
const shellSource = show("src/pages/AppShell.tsx");

const sourceChecks = {
  unconditionalMessageUpdateScroll: /useEffect\(\(\) => \{\s*if \(scrollRef\.current\) \{\s*scrollRef\.current\.scrollTop = scrollRef\.current\.scrollHeight;\s*\}\s*\}, \[messages\]\)/s.test(normalSource),
  unstableIndexMessageKey: /messages\.map\(\(message, index\).*?key=\{index\}/s.test(normalSource),
  duplicateResponsiveChatMounts: (shellSource.match(/<PaigeChat\b/g) ?? []).length === 2,
};

const output = path.join(root, "evidence/verification/paige-scroll-baseline");
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.setContent(`<!doctype html><style>
  body{font:15px system-ui;background:#171520;color:#f7f4ff;padding:24px}
  #owner{height:300px;overflow:auto;border:2px solid #9d8cff;border-radius:12px;width:560px}
  article{box-sizing:border-box;height:82px;padding:16px;border-bottom:1px solid #464052}
  .label{margin:0 0 12px;color:#d2c9ff}
</style><p class="label">Source-bound baseline scroll mechanism reproduction — synthetic content</p><div id="owner"></div>`);
await page.evaluate(() => {
  const owner = document.querySelector("#owner");
  for (let index = 0; index < 40; index += 1) {
    const row = document.createElement("article");
    row.dataset.messageId = `baseline-message-${index + 1}`;
    row.textContent = `Baseline conversation item ${index + 1} — chosen reading-position evidence.`;
    owner.append(row);
  }
  owner.scrollTop = 1_230;
});
const measure = () => page.evaluate(() => {
  const owner = document.querySelector("#owner");
  const viewport = owner.getBoundingClientRect();
  const anchor = [...owner.children].find((row) => row.getBoundingClientRect().bottom > viewport.top);
  return {
    anchor: anchor?.dataset.messageId ?? null,
    offset: anchor ? Math.round((anchor.getBoundingClientRect().top - viewport.top) * 100) / 100 : null,
    scrollTop: owner.scrollTop,
    bottomGap: owner.scrollHeight - owner.scrollTop - owner.clientHeight,
  };
});

const before = await measure();
await page.screenshot({ path: path.join(output, "before-update.png") });

// This is the exact assignment present in the baseline PaigeChat message effect.
await page.evaluate(() => {
  const scrollRef = { current: document.querySelector("#owner") };
  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
});
const afterOrdinaryUpdate = await measure();
await page.screenshot({ path: path.join(output, "after-ordinary-update.png") });

await page.evaluate(() => {
  const previous = document.querySelector("#owner");
  const replacement = previous.cloneNode(true);
  previous.replaceWith(replacement);
});
const afterResponsiveRemount = await measure();
await page.screenshot({ path: path.join(output, "after-responsive-remount.png") });
await browser.close();

const results = {
  sourceChecks,
  before,
  afterOrdinaryUpdate,
  afterResponsiveRemount,
  ordinaryUpdateLostChosenAnchor: before.anchor !== afterOrdinaryUpdate.anchor && afterOrdinaryUpdate.bottomGap === 0,
  remountResetToTop: afterResponsiveRemount.scrollTop === 0 && afterResponsiveRemount.anchor === "baseline-message-1",
};
const report = {
  generatedAt: new Date().toISOString(),
  baselineSha,
  evidenceClass: "Source-bound browser reproduction of exact legacy scroll assignment and browser remount default; synthetic transcript, not authenticated product runtime",
  results,
};
fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));

const passed = Object.values(sourceChecks).every(Boolean)
  && results.ordinaryUpdateLostChosenAnchor
  && results.remountResetToTop;
console.log(`${passed ? "PASS" : "FAIL"} baseline ${baselineSha}: update anchor ${before.anchor} -> ${afterOrdinaryUpdate.anchor}; remount -> ${afterResponsiveRemount.anchor}`);
if (!passed) process.exitCode = 1;
