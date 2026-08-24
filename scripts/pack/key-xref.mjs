#!/usr/bin/env node
/**
 * pack key-xref — for a v3 builder, which of its keys does the markup actually RENDER?
 *
 * WHY THIS EXISTS, and it is one specific mistake rather than a general worry. Porting Layer 5 I
 * read `mindVals`, found `scratchBody` — two fully authored ceiling arms, sitting right beside the
 * code keys — and drew it on the Code face. The pack draws a tokenized editor there. `scratchBody`
 * is computed and rendered at NO site in the 11,358-line shell, and neither is `sandboxActs`. An
 * unrendered key became a shipped surface for an afternoon, and the only reason it was caught is
 * that porting `codeVals` the next day put the two side by side.
 *
 * Reading a builder tells you what the pack COMPUTES. It does not tell you what the pack DRAWS,
 * and those are not the same set. This closes that gap mechanically (§24 — automate the repeat):
 *
 *   node scripts/pack/key-xref.mjs codeVals            one builder
 *   node scripts/pack/key-xref.mjs --all               every builder, dead keys only
 *   node scripts/pack/key-xref.mjs setupVals --verbose  every key, rendered or not
 *
 * HOW IT DECIDES. Keys come from the builder's own `return { … }` literals — ALL of them, because
 * these builders early-return an off-state object and a full one, and a key present in only one
 * arm is normal. A key is RENDERED if `{{ key }}` or `{{ key.… }}` appears anywhere in the file's
 * markup. Row fields inside an `sc-for` are aliased (`cf.name` for a row of `codeFiles`), so the
 * COLLECTION is what has to appear, and it does — `list="{{ codeFiles }}"`.
 *
 * WHAT IT IS NOT. It is a lexical cross-reference, not a JS parser: it tracks strings, template
 * literals, regex and comments well enough to find object depth, and it will not resolve a
 * computed key or a spread (`...this.codeVals(…)`) — a spread is reported as such so the caller
 * knows to run the spread builder too. A "dead" result is a QUESTION for CD, never a licence to
 * delete: the honest reading is "computed and drawn nowhere in this delivery", which may mean a
 * cut key or a block that lost its markup. Both have happened.
 */
import fs from "node:fs";
import path from "node:path";

const PACK = path.resolve(
  "docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell v3.dc.html",
);

if (!fs.existsSync(PACK)) {
  console.error(`pack not found at ${PACK}`);
  process.exit(2);
}
const src = fs.readFileSync(PACK, "utf8");

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const VERBOSE = args.includes("--verbose");
const names = args.filter((a) => !a.startsWith("--"));

/** Every `name(args) {` at class-method indentation — the builders. */
function builderNames() {
  return [...src.matchAll(/^ {2}([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].map((m) => m[1]);
}

/**
 * Walk from `start` counting braces, skipping over anything that is not code. Returns the index
 * just past the matching close brace. The skip set is what makes the depth count trustworthy: a
 * `}` inside a string or a comment is not a close brace, and these builders are full of both.
 */
function scanBlock(text, start, onChar) {
  let i = start;
  let depth = 0;
  let started = false;
  /**
   * Brace depth alone is not enough to find a property position. `...this.codeVals(face ===
   * 'code', ceilingHeld, btn)` puts a bare ARGUMENT at brace-depth 1 preceded by a comma, which
   * reads exactly like a shorthand property — that is how `ceilingHeld` was reported as a dead
   * key. A property lives at brace depth 1 with NO open paren and NO open bracket around it.
   */
  let paren = 0;
  let bracket = 0;
  while (i < text.length) {
    const c = text[i];
    // Line comment
    if (c === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i);
      i = nl < 0 ? text.length : nl;
      continue;
    }
    // Block comment
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    // String or template literal
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") { i += 2; continue; }
        if (text[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    // Regex literal — only where one can legally start, which is after these.
    if (c === "/") {
      let j = i - 1;
      while (j >= 0 && /\s/.test(text[j])) j -= 1;
      if (j < 0 || "(,=:[!&|?{};+-*%~^".includes(text[j])) {
        i += 1;
        let cls = false;
        while (i < text.length) {
          if (text[i] === "\\") { i += 2; continue; }
          if (text[i] === "[") cls = true;
          else if (text[i] === "]") cls = false;
          else if (text[i] === "/" && !cls) { i += 1; break; }
          else if (text[i] === "\n") break;
          i += 1;
        }
        continue;
      }
    }
    if (c === "{") { depth += 1; started = true; }
    else if (c === "}") {
      depth -= 1;
      if (started && depth === 0) return i + 1;
    } else if (c === "(") paren += 1;
    else if (c === ")") paren -= 1;
    else if (c === "[") bracket += 1;
    else if (c === "]") bracket -= 1;
    if (onChar) onChar(i, depth, c, paren, bracket);
    i += 1;
  }
  return text.length;
}

/** Every byte offset where a builder of this name is DECLARED. Usually one; see below. */
function builderOffsets(name) {
  const re = new RegExp(`^ {2}${name}\\s*\\([^)]*\\)\\s*\\{`, "gm");
  return [...src.matchAll(re)].map((m) => m.index);
}

/**
 * The keys of every `return { … }` literal inside one builder, plus any spreads it carries.
 *
 * `occurrence` exists because THE PACK DECLARES `alertVals` TWICE, at L7570 and L8694, and
 * BUILD-ORDER's own instruction is *"Read both, port the second (8694) — it is the later authored
 * version and carries the repair model."* A tool that silently reads the first would report the
 * superseded one as clean and say nothing about the one being ported. Every duplicate is
 * reported, in file order, so the choice is made with both in view.
 */
function builderKeys(name, occurrence = 0) {
  const offsets = builderOffsets(name);
  const at = offsets[occurrence] ?? -1;
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  const end = scanBlock(src, open);
  const body = src.slice(open, end);
  const startLine = src.slice(0, at).split("\n").length;

  const keys = new Map(); // key -> line in the pack
  const spreads = new Set();
  const localSpreads = new Set();

  /**
   * Depth at every index of the body, so a `return {` can be told from a `return {` INSIDE a
   * callback. The builders are full of the latter — `act:() => this.setState(x => { … return
   * { codeDrafts:d, editing:false } })` is a return literal three functions deep, and the first
   * run of this tool reported `codeDrafts` and `editing` as builder keys because of it. Only a
   * return at the METHOD's own top level (depth 1) is a builder return.
   */
  const depthAt = new Int16Array(body.length);
  const parenAt = new Int16Array(body.length);
  const bracketAt = new Int16Array(body.length);
  /**
   * Which indices are CODE. `scanBlock` already skips comments and string interiors, so the
   * callback firing IS the definition of code — and having that as a mask is what makes the
   * backward "is this a property position?" walk correct. Without it the walk stepped over raw
   * text: a key preceded by a comment line saw the comment's full stop, decided it was not after
   * a `{` or `,`, and dropped the key. `composerPlaceholder` is preceded by exactly such a
   * comment, which is how a key I had read in the builder myself came back as an ORPHAN.
   */
  const isCode = new Uint8Array(body.length);
  scanBlock(body, 0, (i, depth, _c, paren, bracket) => {
    depthAt[i] = depth;
    parenAt[i] = paren;
    bracketAt[i] = bracket;
    isCode[i] = 1;
  });

  for (const m of body.matchAll(/\breturn\s*\{/g)) {
    if (depthAt[m.index] !== 1) continue;
    const objOpen = body.indexOf("{", m.index);
    const parenBase = parenAt[objOpen];
    const bracketBase = bracketAt[objOpen];
    scanBlock(body, objOpen, (i, depth) => {
      if (depth !== 1) return;
      if (parenAt[i] !== parenBase || bracketAt[i] !== bracketBase) return;
      const rest = body.slice(i);
      /**
       * SHORTHAND COUNTS. `mindVals` writes `memGroups,` and `skillGroups,` — real keys with no
       * colon. Matching only `ident:` missed them, and because the orphan pass checks markup keys
       * against the union of all builder keys, every miss here became a false ORPHAN: the first
       * run reported 77, including keys I had read in the builder myself. A checker that reports
       * 77 things that are fine is not a checker, so both property forms are matched.
       */
      const key =
        /^([a-zA-Z_$][\w$]*)\s*:/.exec(rest) ?? /^([a-zA-Z_$][\w$]*)\s*[,}]/.exec(rest);
      if (key && !keys.has(key[1])) {
        /**
         * A PROPERTY, NOT A TERNARY. `repo ? rCeil : ''` puts a bare identifier in front of a
         * colon and reads exactly like `rCeil:` to a lexer — which is how the first run of this
         * tool reported `rCeil` and `repoKind` as dead keys that are not keys at all. A property
         * name can only follow the object's `{` or a `,`, so that is what is required. Getting
         * this wrong in the loose direction is worse than not having the tool: a check that
         * reports things that are fine trains you to skim its output.
         */
        let j = i - 1;
        while (j >= 0 && (!isCode[j] || /[\s\n]/.test(body[j]))) j -= 1;
        const before = j < 0 ? "{" : body[j];
        if ((before === "{" || before === ",") && !/[\w$.]/.test(body[i - 1] ?? " ")) {
          keys.set(key[1], startLine + body.slice(0, i).split("\n").length - 1);
        }
      }
      const sp = /^\.\.\.this\.([a-zA-Z_$][\w$]*)\s*\(/.exec(rest);
      if (sp) spreads.add(sp[1]);
      /**
       * A LOCAL SPREAD IS STILL A KEY SOURCE. `renderVals` builds `const base = { theme,
       * markState, announcement }` and returns `{ ...base, … }` — so `announcement` is produced,
       * and reporting it as an ORPHAN said the shell draws a key nothing supplies, which is the
       * exact defect class this pass exists to find. A checker that manufactures instances of
       * the thing it looks for is worse than no checker.
       */
      const local = /^\.\.\.([a-zA-Z_$][\w$]*)\s*[,}]/.exec(rest);
      if (local) localSpreads.add(local[1]);
    });
  }
  // Resolve `...base` to the keys of the `const base = { … }` it names, in this same body.
  for (const name of localSpreads) {
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*\\{`).exec(body);
    if (!decl) continue;
    const objOpen = body.indexOf("{", decl.index);
    scanBlock(body, objOpen, (i, depth) => {
      if (depth !== 1) return;
      const rest = body.slice(i);
      const k =
        /^([a-zA-Z_$][\w$]*)\s*:/.exec(rest) ?? /^([a-zA-Z_$][\w$]*)\s*[,}]/.exec(rest);
      if (!k || keys.has(k[1])) return;
      let j = i - 1;
      while (j >= 0 && (!isCode[j] || /[\s\n]/.test(body[j]))) j -= 1;
      const before = j < 0 ? "{" : body[j];
      if ((before === "{" || before === ",") && !/[\w$.]/.test(body[i - 1] ?? " ")) {
        keys.set(k[1], startLine + body.slice(0, i).split("\n").length - 1);
      }
    });
  }

  return { keys, spreads, line: startLine };
}

/** `{{ key }}` / `{{ key.field }}` anywhere in the file. The markup is the only consumer. */
const renderedCache = new Map();
function isRendered(key) {
  if (renderedCache.has(key)) return renderedCache.get(key);
  const re = new RegExp(`\\{\\{\\s*${key}(\\s*\\}\\}|\\.)`);
  const hit = re.test(src);
  renderedCache.set(key, hit);
  return hit;
}

/**
 * THE OTHER DIRECTION OF THE SAME DEFECT. A key can be computed and drawn nowhere (above), or
 * DRAWN and computed nowhere — markup interpolating `{{ emptyLine }}` that no builder produces,
 * which renders as nothing and reads as a surface with no copy for its commonest state. That is
 * pack finding #9, and it was found by hand. Both directions are one lexical question, so both
 * belong in one tool rather than one automated and one remembered.
 *
 * `sc-for` aliases are locally bound (`as="cf"` makes every `{{ cf.… }}` legitimate), so their
 * roots are excluded — otherwise every row field in the shell reports as an orphan.
 */
function orphans() {
  const bound = new Set(
    [...src.matchAll(/\bas="([a-zA-Z_$][\w$]*)"/g)].map((m) => m[1]),
  );

  /**
   * THE LOOSEST SOUND TEST, deliberately, and not the precise one.
   *
   * The first version asked "which builder produces this key?" and compared against extracted
   * builder keys. That is a harder question than the one being asked, and it got it wrong three
   * ways: shorthand properties, keys behind local spreads (`...base`), and keys computed in a
   * nested closure whose result is spread in (`briefLine`, written in a `return` nine levels
   * deep at L11038). Every miss became a false ORPHAN — the checker manufacturing instances of
   * the very defect it hunts.
   *
   * An orphan only needs "is this key written ANYWHERE in the script?" — so that is what is
   * asked. A property `key:` anywhere, or a `const key =` it could be spread from. The failure
   * mode of a loose test is a missed orphan, not a fabricated one, and for a tool whose output
   * has to be trusted at a glance that is the right direction to be wrong in.
   */
  const written = (key) =>
    new RegExp(`\\b${key}\\s*:`).test(src) ||
    new RegExp(`\\b(?:const|let|var)\\s+${key}\\b`).test(src);

  const seen = new Map(); // key -> first line it is drawn on
  for (const m of src.matchAll(/\{\{\s*([a-zA-Z_$][\w$]*)\s*(\}\}|\.)/g)) {
    const key = m[1];
    if (bound.has(key) || seen.has(key)) continue;
    // A literal (`{{ false }}`, `{{ true }}`) is a placeholder hint, not a key.
    if (key === "true" || key === "false" || key === "null" || key === "undefined") continue;
    if (written(key)) continue;
    seen.set(key, src.slice(0, m.index).split("\n").length);
  }
  return seen;
}

if (args.includes("--orphans")) {
  const found = orphans();
  for (const [k, ln] of found) {
    console.log(`  ORPHAN  ${k}  (L${ln}) — drawn in the markup, produced by no builder`);
  }
  console.log(
    `\n${found.size} markup key(s) with no producer.` +
      (found.size
        ? "\nEach renders as nothing. Owed from CD — never filled with invented copy (§00)."
        : ""),
  );
  process.exit(0);
}

const targets = ALL ? builderNames() : names;
if (!targets.length) {
  console.error("usage: key-xref.mjs <builderName> [--verbose] | --all | --orphans");
  process.exit(2);
}

let deadTotal = 0;
let checked = 0;

const expanded = [];
for (const name of targets) {
  const n = builderOffsets(name).length;
  if (n === 0) expanded.push([name, 0, 1]);
  else for (let i = 0; i < n; i += 1) expanded.push([name, i, n]);
}

for (const [name, occurrence, total] of expanded) {
  const found = builderKeys(name, occurrence);
  if (!found) {
    console.error(`  ?  ${name} — no builder by that name in the pack`);
    continue;
  }
  checked += 1;
  const dead = [...found.keys].filter(([k]) => !isRendered(k));
  const live = [...found.keys].filter(([k]) => isRendered(k));
  deadTotal += dead.length;

  if (ALL && !dead.length) continue;

  console.log(
    `\n${name}  (L${found.line})${total > 1 ? `  [declaration ${occurrence + 1} of ${total} — the pack declares this name more than once]` : ""}` +
      `  ${found.keys.size} key(s) · ${live.length} rendered · ${dead.length} drawn nowhere`,
  );
  if (found.spreads.size) {
    console.log(`  spreads: ${[...found.spreads].join(", ")} — run those too, their keys are not counted here`);
  }
  /**
   * A HELPER, NOT A SURFACE. `kindMark` (L9586) returns `{ glyph, hue, wrapStyle, … }` that
   * ANOTHER builder consumes programmatically — nothing about it is interpolated, so it reads as
   * 5-of-5 dead. Zero rendered is the tell, and saying so here stops the next session filing a
   * helper as a pack defect.
   */
  if (live.length === 0 && found.keys.size > 0) {
    console.log("  ^ 0 of these render — this is almost certainly a HELPER whose return another builder consumes, not a dead surface.");
  }
  if (VERBOSE) for (const [k, ln] of live) console.log(`  ok    ${k}  (L${ln})`);
  for (const [k, ln] of dead) console.log(`  DEAD  ${k}  (L${ln}) — computed, no {{ ${k} }} in the markup`);
}

console.log(
  `\n${checked} builder(s) checked · ${deadTotal} key(s) computed and drawn nowhere.` +
    (deadTotal ? "\nA dead key is a QUESTION for CD (cut key, or a block that lost its markup) — never a licence to invent one." : ""),
);
