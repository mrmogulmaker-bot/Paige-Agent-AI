// Build the self-contained Mind Gate-1 prototype:
//   command-center-mind-gate1.src.html  +  orb.bundle.js (real three.js engine, IIFE)
//     → command-center-mind-gate1.html   (single file, no network beyond fonts)
//
// The bundle is produced from _build/orb-entry.mjs by esbuild:
//   node_modules/.bin/esbuild docs/prototypes/_build/orb-entry.mjs \
//     --bundle --format=iife --minify --outfile=docs/prototypes/_build/orb.bundle.js
//
// This script only INLINES that bundle at the <!--ORB_BUNDLE--> marker so the delivered
// prototype has zero runtime dependencies (§22: bundle three, don't CDN it).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const proto = path.resolve(here, "..");
const SRC = path.join(proto, "command-center-mind-gate1.src.html");
const BUNDLE = path.join(here, "orb.bundle.js");
const OUT = path.join(proto, "command-center-mind-gate1.html");

const MARK = "<!--ORB_BUNDLE-->";

let html = fs.readFileSync(SRC, "utf8");
const bundle = fs.readFileSync(BUNDLE, "utf8");

if (!html.includes(MARK)) {
  console.error(`FATAL: marker ${MARK} not found in ${SRC}`);
  process.exit(1);
}
// Guard: a stray </script> inside the bundle would close our wrapper early.
if (/<\/script/i.test(bundle)) {
  console.error("FATAL: bundle contains a </script> sequence; would break inlining.");
  process.exit(1);
}

const inlined = `<script>/* Mind Orb — real three.js r0.169 engine, bundled self-contained (esbuild IIFE). Source: docs/prototypes/_build/orb-entry.mjs */\n${bundle}\n</script>`;
// NOTE: use split/join, NOT String.replace — the minified bundle contains `$&`/`$\`` sequences
// which String.replace would interpret as special replacement patterns and corrupt the JS.
html = html.split(MARK).join(inlined);

fs.writeFileSync(OUT, html);
console.log(`built ${path.relative(proto, OUT)} — ${html.length} bytes (bundle ${bundle.length} bytes inlined)`);
