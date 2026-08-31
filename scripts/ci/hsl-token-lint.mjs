#!/usr/bin/env node
/**
 * hsl-token-lint — a shadcn colour token is a BARE HSL TRIPLET. Consumed outside
 * `hsl()`, the whole declaration is invalid at computed-value time and is dropped.
 *
 * THE DEFECT. `src/index.css` says it in its own header — "All colors MUST be HSL"
 * — and defines e.g. `--success: 142 76% 36%`, `--destructive: 0 72% 51%`,
 * `--accent-foreground: 258 70% 12%`. Those are three numbers, not a colour. So:
 *
 *     color: var(--destructive);                        → declaration DROPPED
 *     border-color: color-mix(in srgb, var(--success) 45%, …);  → DROPPED
 *     outline: 2px solid var(--ring);                   → DROPPED → outline: none
 *
 * Nothing errors. `tsc` is blind to it, eslint is blind to it, and jsdom asserts on
 * `textContent`, which is blind to it. The class is right there in the markup and
 * the element renders with no colour, no border, no ground — or, in the outline
 * case, silently REMOVES a working layered `:focus-visible` ring, because an
 * unlayered invalid `outline` still beats `@layer base`.
 *
 * HOW IT WAS FOUND, TWICE, IN ONE FILE. `src/solo/settings.css` opens with a note
 * describing this exact class being diagnosed and repaired for four `--pg-*`
 * aliases. It was fixed at those sites and not made unrepeatable. A later slice
 * then wrote an entire fold-and-consequence colour system against the raw
 * triplets, and a Chromium measurement found: every ok/warn/bad fold with
 * `border-width: 0` and a transparent spine; the DESTRUCTIVE action byte-identical
 * to the safe one; the gold primary with no fill; the drawer with no background;
 * and every control on the surface with `outline-style: none` on keyboard focus.
 *
 * That is the argument for a guard rather than another note. The first note did
 * not stop the second occurrence in the very file it was written in.
 *
 * THE ESCAPE. Some of these names are ALSO legitimate non-colour custom properties
 * in other design systems, and a genuinely-intended raw use can be marked:
 *
 *     color: var(--ring); /* hsl-token-exempt: <reason> *\/
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The shadcn tokens defined as bare triplets in src/index.css. */
const TRIPLET_TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground",
  "muted", "muted-foreground", "accent", "accent-foreground",
  "destructive", "destructive-foreground", "border", "input", "ring",
  "success", "success-light", "warning", "info", "gold-dark",
];
const RE = new RegExp(String.raw`var\(\s*--(${TRIPLET_TOKENS.join("|")})\s*[,)]`, "g");

function cssFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (name.endsWith(".css")) out.push(p);
  }
  return out;
}

const findings = [];
for (const file of cssFiles("src")) {
  const raw = readFileSync(file, "utf8");
  // Comments are prose, not declarations — a note ABOUT the defect is not the defect.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

  /**
   * A file that DEFINES a token owns what that name means inside it.
   * `src/prototype/tenant-redesign.css` declares its own `--muted: #…` and is
   * not consuming index.css's triplet at all; flagging it would be a false
   * positive that trains people to ignore this lint. The triplet contract binds
   * only the names index.css alone defines.
   */
  // NOT anchored to line start: these files pack several definitions onto one
  // line (`--ink: …; --muted: …; --faint: …`), and an anchored match saw only the
  // first — which is how the prototype's OWN --muted stayed flagged. A `--name:`
  // pair is a definition; `var(--name)` carries no colon and is never matched.
  const definedHere = new Set(
    Array.from(src.matchAll(/--([a-z0-9-]+)\s*:/g), (m) => m[1]),
  );

  src.split("\n").forEach((line, i) => {
    if (raw.split("\n")[i]?.includes("hsl-token-exempt")) return;
    const stripped = line.replace(/hsla?\(\s*var\(\s*--[a-z-]+\s*\)/g, "hsl(OK");
    RE.lastIndex = 0;
    let m;
    const seen = new Set();
    while ((m = RE.exec(stripped))) {
      if (definedHere.has(m[1]) || seen.has(m[1])) continue;
      seen.add(m[1]);
      const excerpt = line.trim();
      findings.push(`${file}:${i + 1}  var(--${m[1]}) used raw — it is a bare HSL triplet, so this declaration is dropped.\n    ${excerpt.length > 160 ? excerpt.slice(0, 160) + " …" : excerpt}`);
    }
  });
}

if (findings.length) {
  console.error("hsl-token-lint FAILED — a bare HSL triplet consumed outside hsl():\n");
  for (const f of findings) console.error("  " + f + "\n");
  console.error(`${findings.length} occurrence(s). Wrap it as hsl(var(--x)), use a --pg-* palette token`);
  console.error("(those are real colours in both themes), or mark a genuine exception with");
  console.error("a trailing /* hsl-token-exempt: <reason> */ comment.");
  process.exit(1);
}
console.log("✅ hsl-token-lint: no bare HSL triplet consumed outside hsl().");
