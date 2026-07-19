#!/usr/bin/env node
// gold-discipline-lint — CLAUDE.md §11 gold-budget enforcement over generated + hand-built markup.
//
// WHY THIS EXISTS (grounding, 2026-07-19): nothing programmatically validated a model-*generated*
// artifact's CSS/HTML against the §11 gold budget. The only guards were (a) an advisory `Avoid:`
// clause in the generation prompt and (b) a human critic reading source. A generated page that
// painted `background: gold` on a hero/section/card passed typecheck, passed our primitive-level
// guards (they only bind OUR components, not generated markup), and had no automated gate. This is
// that gate: a post-generation lint of produced JSX/TSX/HTML against the rule that gold is spent
// ONLY on the act — never as a background fill on a hero/section/card surface.
//
// THE RULE (§11): gold (--accent / --gold / --gold-light / --gold-dark / --gradient-gold) is ONLY
// for the primary CTA fill (Button variant="gold") and on/active/selected pill states
// (StatePill state="on"). Gold as a BACKGROUND FILL on a large surface — a hero masthead, a
// <section>, a Card/panel — is a BLOCKER, not a should-fix.
//
// HEURISTIC (deliberately conservative — two signals must BOTH fire on the same element):
//   Signal A  GOLD_FILL     — the element paints a SOLID gold background (className utility or an
//                             inline style background that is a solid gold, not a soft radial glow).
//   Signal B  LARGE_SURFACE — the element is a structural/large surface (a section/header/main tag,
//                             a Card/SectionCard/PageHeader/Hero component, or a hero/banner/
//                             masthead/full-screen class).
// Only when A AND B fire is it a violation. This is why the linter does NOT flag the legitimate
// act-moment gold in the real codebase — those live on <Button>, <StatePill>, badges, and small
// dots/icon plates, none of which are large surfaces. A soft low-alpha radial gold GLOW behind a
// header (the owner-approved hero glow, e.g. `radial-gradient(..., hsl(var(--gold)/0.28), transparent)`)
// is a glow, not a fill, and is intentionally NOT flagged.
//
// This is a HEURISTIC over source text, not a full JSX parser — it reads opening tags tolerantly.
// It is tuned to zero false positives on our real `src/` (verified) while catching the generated-
// artifact failure mode. Token-only by construction: it enforces the budget, it never emits color.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, extname, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const SCANNED_EXT = new Set([".tsx", ".jsx", ".html", ".htm"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".claude", "coverage"]);

// ── Signal A: does an element's attribute text paint a SOLID gold background? ──────────────────

// Tailwind gold-fill utility classes (each captures any trailing `/opacity` so softness is judged
// on the whole token). bg-gold, bg-gold-light/-dark, bg-gradient-gold, bg-yellow-*, bg-amber-*, and
// arbitrary `bg-[...gold...]` (hsl var or gradient). The BLOCKER is a SOLID gold FILL; a low-alpha
// wash (<50%) is treated the same as a soft glow — a tint, not the masthead-fill failure §11 targets.
const GOLD_UTILITY_RES = [
  /\bbg-gradient-gold(?:\/\d{1,3})?\b/,
  /\bbg-gold(?:-light|-dark)?(?:\/\d{1,3})?\b/,
  /\bbg-(?:yellow|amber)-\d{2,3}(?:\/\d{1,3})?\b/,
  /\bbg-\[[^\]]*gold[^\]]*\](?:\/\d{1,3})?/, // arbitrary value referencing --gold / --gradient-gold
];

// A gold background is a soft WASH (not a §11 fill blocker) when it carries a sub-50% alpha —
// either a Tailwind `/NN` opacity modifier (< 50) or a decimal alpha inside the value (< 0.5).
// This mirrors the inline-style glow exclusion: gold is fine as a soft tint, never as a fill.
function isSoftWash(token) {
  const decimal = token.match(/\/\s*(0?\.\d+)/); // e.g. /0.28  /.05
  if (decimal && parseFloat(decimal[1]) < 0.5) return true;
  const pct = token.match(/\/(\d{1,3})(?!\d)/); // e.g. /5  /40  (Tailwind opacity)
  if (pct && parseInt(pct[1], 10) < 50) return true;
  return false;
}

// Inline style background properties: `background: …`, `background-color: …`, `backgroundColor: …`.
// Value groups are examined for a SOLID gold fill vs. a soft glow (see isSolidGoldValue).
const STYLE_BG_RE = /(?:background|background-color|backgroundColor)\s*:\s*(['"`]?)([^;'"`}]+)\1/gi;

function hexToHsl(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  return { h: hue * 360, s: s * 100, l: l * 100 };
}

// A hex is "gold/amber/yellow" if its hue sits in the warm-gold band with real saturation and a
// mid/high lightness (so it reads as a gold FILL, not a near-black or near-white).
function isGoldHex(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return false;
  return hsl.h >= 38 && hsl.h <= 60 && hsl.s >= 45 && hsl.l >= 35 && hsl.l <= 85;
}

// Is a style-background VALUE a solid gold fill (flag it) rather than a soft glow (leave it)?
// A soft glow fades to `transparent` and/or carries an alpha (`/0.28`, `/ .3`) — that is the
// owner-approved hero glow, not a fill. A solid gold keyword, a gold hex, a full-opacity
// hsl(var(--gold…)) fill, or `var(--gradient-gold)` IS a fill.
function isSolidGoldValue(value) {
  const v = value.toLowerCase().trim();
  const mentionsGold =
    /\bgold(?:enrod)?\b/.test(v) || /--gold/.test(v) || /--gradient-gold/.test(v);
  const goldHex = (v.match(/#[0-9a-f]{3,6}\b/g) || []).some(isGoldHex);
  if (!mentionsGold && !goldHex) return false;
  // Soft-glow escape hatch: fades to transparent OR carries an alpha channel on the gold stop.
  const isGlow = /\btransparent\b/.test(v) || /\/\s*(?:0?\.\d+|0)\b/.test(v);
  // `var(--gradient-gold)` is a solid gold→gold gradient (a fill), never a glow.
  if (/--gradient-gold/.test(v)) return true;
  return !isGlow;
}

function detectGoldFill(attrs) {
  for (const re of GOLD_UTILITY_RES) {
    const m = attrs.match(re);
    if (m && !isSoftWash(m[0])) return m[0];
  }
  let sm;
  STYLE_BG_RE.lastIndex = 0;
  while ((sm = STYLE_BG_RE.exec(attrs)) !== null) {
    if (isSolidGoldValue(sm[2])) return sm[0].trim();
  }
  // Arbitrary hardcoded gold hex used directly as a bg utility: bg-[#e6b34d] (with optional /opacity).
  const hexUtil = attrs.match(/\bbg-\[(#[0-9a-fA-F]{3,6})\](?:\/\d{1,3})?/);
  if (hexUtil && isGoldHex(hexUtil[1]) && !isSoftWash(hexUtil[0])) return hexUtil[0];
  return null;
}

// ── Signal B: is this element a large/structural surface? ─────────────────────────────────────

const LARGE_SURFACE_TAGS = new Set(["section", "header", "main", "article", "aside"]);
const LARGE_SURFACE_COMPONENTS = new Set([
  "Card", "CardHeader", "CardContent", "CardFooter",
  "SectionCard", "PageHeader", "PageShell", "PageHero",
  "Hero", "HeroSection", "Masthead", "Banner", "Panel",
]);
const LARGE_SURFACE_CLASS_RES = [
  /\bhero\b/, /\bmasthead\b/, /\bbanner\b/, /\bcard\b/, /\bsection\b/, /\bpanel\b/,
  /\bmin-h-screen\b/, /\bh-screen\b/, /\bw-screen\b/,
  /\bmin-h-\[100d?vh\]/,
];

function detectLargeSurface(tagName, attrs) {
  const lower = tagName.toLowerCase();
  if (LARGE_SURFACE_TAGS.has(lower)) return `<${tagName}>`;
  if (LARGE_SURFACE_COMPONENTS.has(tagName)) return `<${tagName}>`;
  for (const re of LARGE_SURFACE_CLASS_RES) {
    const m = attrs.match(re);
    if (m) return `class "${m[0]}"`;
  }
  return null;
}

// ── Tag walker (tolerant opening-tag scan; heuristic, not a full parser) ───────────────────────

// Matches an opening tag: name + attribute text (quoted strings, `{…}` up to 2 brace levels,
// template literals, or any non-<> chars), up to the first `>`.
const TAG_RE =
  /<([A-Za-z][A-Za-z0-9.]*)((?:"[^"]*"|'[^']*'|`[^`]*`|\{(?:[^{}]|\{[^{}]*\})*\}|[^<>])*?)\/?>/g;

function lineOf(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) if (source[i] === "\n") line++;
  return line;
}

/** Lint one source string. Returns [{ line, tag, fill, surface, snippet }]. */
export function lintGoldDisciplineSource(source, _filename = "<source>") {
  const violations = [];
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(source)) !== null) {
    const tagName = m[1];
    const attrs = m[2] || "";
    const fill = detectGoldFill(attrs);
    if (!fill) continue;
    const surface = detectLargeSurface(tagName, attrs);
    if (!surface) continue;
    const start = m.index;
    const rawLine = source.slice(start, source.indexOf("\n", start) === -1 ? undefined : source.indexOf("\n", start));
    violations.push({
      line: lineOf(source, start),
      tag: tagName,
      fill,
      surface,
      snippet: rawLine.trim().slice(0, 160),
    });
  }
  return violations;
}

// ── File walking + CLI ─────────────────────────────────────────────────────────────────────────

function walk(target, out) {
  const st = statSync(target);
  if (st.isDirectory()) {
    if (SKIP_DIRS.has(target.split("/").pop())) return;
    for (const entry of readdirSync(target)) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(join(target, entry), out);
    }
  } else if (SCANNED_EXT.has(extname(target))) {
    out.push(target);
  }
}

function lintPaths(paths) {
  const files = [];
  for (const p of paths) {
    const abs = resolve(p);
    try { walk(abs, files); } catch { /* ignore missing path */ }
  }
  const results = [];
  for (const file of files) {
    let src;
    try { src = readFileSync(file, "utf8"); } catch { continue; }
    const v = lintGoldDisciplineSource(src, file);
    if (v.length) results.push({ file, violations: v });
  }
  return results;
}

function relOr(p) {
  const r = relative(REPO_ROOT, p);
  return r.startsWith("..") ? p : r;
}

function printReport(results) {
  let total = 0;
  for (const { file, violations } of results) {
    for (const v of violations) {
      total++;
      console.error(
        `  ${relOr(file)}:${v.line}  §11 gold-as-background BLOCKER\n` +
        `      gold fill: ${v.fill}   on large surface: ${v.surface}\n` +
        `      ${v.snippet}`
      );
    }
  }
  return total;
}

// Self-test: prove the linter FAILS the failing fixture and PASSES the passing fixture.
function selfTest() {
  const fixtures = join(__dirname, "fixtures", "gold-discipline");
  const failSrc = readFileSync(join(fixtures, "fail.tsx"), "utf8");
  const passSrc = readFileSync(join(fixtures, "pass.tsx"), "utf8");
  const failV = lintGoldDisciplineSource(failSrc, "fail.tsx");
  const passV = lintGoldDisciplineSource(passSrc, "pass.tsx");

  let ok = true;
  if (failV.length === 0) {
    ok = false;
    console.error("SELF-TEST FAIL: fail.tsx produced 0 violations (expected >= 1).");
  } else {
    console.log(`SELF-TEST: fail.tsx correctly flagged ${failV.length} gold-as-background violation(s):`);
    for (const v of failV) console.log(`    line ${v.line}: ${v.fill} on ${v.surface}`);
  }
  if (passV.length !== 0) {
    ok = false;
    console.error(`SELF-TEST FAIL: pass.tsx produced ${passV.length} violation(s) (expected 0):`);
    for (const v of passV) console.error(`    line ${v.line}: ${v.fill} on ${v.surface}`);
  } else {
    console.log("SELF-TEST: pass.tsx correctly produced 0 violations (act-moment gold + soft glow allowed).");
  }
  console.log(ok ? "SELF-TEST: PASS — linter behaves correctly." : "SELF-TEST: FAIL.");
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }
  const paths = argv.filter((a) => !a.startsWith("--"));
  const targets = paths.length ? paths : ["src"];
  const results = lintPaths(targets);
  const total = printReport(results);
  if (total > 0) {
    console.error(
      `\n✗ gold-discipline: ${total} §11 violation(s) — gold used as a background fill on a ` +
      `hero/section/card surface. Gold is spent ONLY on the act (Button variant="gold", ` +
      `StatePill state="on"). See docs/design-references/DESIGN-CRITIC-PROMPT.md.`
    );
    process.exit(1);
  }
  console.log(`✓ gold-discipline: no gold-as-background violations in ${targets.join(", ")}.`);
  process.exit(0);
}

// Run as CLI only when invoked directly (not when imported by a test).
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
