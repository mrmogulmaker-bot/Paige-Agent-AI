#!/usr/bin/env node
// skeleton-content-lint (§18/§24/§64) — the extensible guard born from Task #126's §32.c
// stale-content finding. Replaces the earlier pricing-only idea with an ANY-duplicated-content
// primitive, per owner ruling 2026-08-12.
//
// THE PROBLEM: index.html carries a static no-JS/SEO skeleton inside <div id="root">. React
// (createRoot) clears #root and renders the live app for JS visitors, but crawlers / no-JS clients /
// a headless reader (Paige's own verify_deployed_surface) see the SKELETON. When product-decision
// content (pricing, features, security specifics) is DUPLICATED into that skeleton, it drifts the
// moment the React source changes — which is exactly how a stale price reached a headless read.
//
// THE RULE (owner-ruled): the skeleton may carry ONLY stable, SEO-legitimate copy that does NOT
// change with product decisions — declared here as an explicit WHITELIST. Anything else inside
// #root fails the build. This catches ANY future duplication class (pricing, features, testimonials,
// whatever), not just the one we found. To legitimately add SEO copy to the skeleton, add its exact
// text to ALLOWED_ROOT_TEXT below WITH a rationale comment — that is the declared, reviewed surface.
//
// Runs in CI (cloud, §64), sibling of lint:views / lint:definer-fns / lint:tier-features.
//
// §13 honest scope: this checks the STATIC #root text of index.html. It does not (and need not)
// inspect the React bundle — the whole point is that product content lives in React ALONE and the
// skeleton stays minimal.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const INDEX_HTML = resolve(ROOT, "index.html");

// ── The whitelist manifest: EXACT visible text the static #root skeleton is allowed to carry. ──
// Add here (with a one-line rationale) to legitimately extend the SEO fallback. Keep it minimal:
// hero H1 + one value-prop paragraph + one primary CTA. NO product-decision-driven content.
const ALLOWED_ROOT_TEXT = [
  "Paige — Your AI Business Operations Partner",            // hero H1 (brand + category; stable)
  "Built for coaches, consultants, and agencies who are serious about scaling. Paige manages your clients, automates your busywork, drafts your outreach, and keeps your entire operation moving — in one conversation.", // value-prop paragraph
  "Get started",                                            // primary CTA
];

// ── Belt-and-suspenders: tokens that must NEVER appear in the skeleton, even if a whitelist entry
// were mis-added. These are the drift-prone / product-decision classes. ──
const BANNED = [
  { re: /\$\s?\d/, why: "a price figure (pricing lives in React alone)" },
  { re: /Founding Beta/i, why: '"Founding Beta" pricing/launch claim' },
  { re: /locked for life/i, why: '"locked for life" pricing-lock claim' },
  { re: /MOST POPULAR/i, why: 'a pricing-tier badge ("MOST POPULAR")' },
  { re: /Waitlist/i, why: "waitlist gate copy" },
  { re: /\/month\b/i, why: "a per-month price cadence" },
  { re: /SOC ?2|AES-?256|TLS ?1\.3/i, why: "specific security/compliance claims (belong in React)" },
];

function fail(msg) {
  console.error(`\n❌  skeleton-content-lint FAILED\n${msg}\n`);
  process.exit(1);
}

let html;
try {
  html = readFileSync(INDEX_HTML, "utf8");
} catch (e) {
  fail(`could not read ${INDEX_HTML}: ${e.message}`);
}

// Extract the inner content of <div id="root"> ... </div> that precedes the module script.
const m = html.match(/<div id="root">([\s\S]*?)<\/div>\s*<script type="module"/);
if (!m) {
  fail('could not locate the <div id="root"> ... </div> block before <script type="module"> — the parser may need updating; refusing to pass blindly.');
}
let rootInner = m[1];

// Strip HTML comments (not served-rendered content; must neither trip nor hide the check).
rootInner = rootInner.replace(/<!--[\s\S]*?-->/g, " ");

// 1) Banned-token scan on the comment-stripped inner (raw, before tag strip — catches attrs too).
for (const { re, why } of BANNED) {
  const hit = rootInner.match(re);
  if (hit) {
    fail(`index.html #root skeleton contains ${why} — matched "${hit[0]}". Product-decision content must live in React alone, never duplicated into the static skeleton (Task #126 §18).`);
  }
}

// 2) Whitelist residue check — strip tags, normalize, remove each allowed string, and fail on any
//    non-trivial leftover (that leftover is undeclared content that would drift).
let text = rootInner
  .replace(/<[^>]+>/g, " ")   // strip tags
  .replace(/&nbsp;/g, " ")
  .replace(/&#\d+;/g, " ")    // numeric entities → space
  .replace(/&[a-z]+;/gi, (e) => (e === "&amp;" ? "&" : " ")) // named entities in ONE pass;
  //                              &amp; decoded here and NOT again below — avoids double-unescaping
  //                              (CodeQL js/double-unescaping). The skeleton carries no entities today;
  //                              this only keeps the text extractor robust if stable SEO copy adds one.
  .replace(/\s+/g, " ")
  .trim();

for (const allowed of ALLOWED_ROOT_TEXT) {
  const norm = allowed.replace(/\s+/g, " ").trim();
  text = text.split(norm).join(" "); // remove ALL occurrences of each allowed string
}

// Residue after removing whitelisted text + trivial punctuation/whitespace.
const residue = text.replace(/[·•\-–—|©,.]/g, " ").replace(/\s+/g, " ").trim();
if (residue.length > 0) {
  fail(
    `index.html #root skeleton contains UNDECLARED text (not in the whitelist manifest):\n  "${residue.slice(0, 300)}"\n` +
      `→ Either move it to React (product content), or — if it is genuinely stable SEO copy — add its exact text to ALLOWED_ROOT_TEXT in scripts/ci/skeleton-content-lint.mjs WITH a rationale comment.`,
  );
}

console.log(`✅  skeleton-content-lint OK — index.html #root carries only whitelisted SEO copy (${ALLOWED_ROOT_TEXT.length} declared strings); no product-decision content, no banned tokens.`);
