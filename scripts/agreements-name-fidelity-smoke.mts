// scripts/agreements-name-fidelity-smoke.mts
//
// §32: a green typecheck proves nothing about what the PDF actually says. This RUNS the real
// validation and the real render against the real strings and asserts they agree.
//
// THE DEFECT THIS LOCKS SHUT. `normaliseFormatting` was private to `_shared/agreements/document.ts`
// and reached only from `wouldLoseCharacters` — the VALIDATION. The RENDER path called
// `sanitizeWinAnsi` on the raw original. So for every codepoint that `normaliseFormatting` handles
// and `sanitizeWinAnsi`'s allow-list does not, a name PASSED the check at send and was then stamped
// into the executed PDF as `?`. These characters arrive from ordinary copy-paste, and the result is
// a legally executed document bearing a name that is not the signer's.
//
// Run: node --experimental-strip-types scripts/agreements-name-fidelity-smoke.mts

import { normaliseFormatting, sanitizeWinAnsi } from "../supabase/functions/_shared/doc-render.ts";
import { wouldLoseCharacters, assertNamesAreStampable } from "../supabase/functions/_shared/agreements/document.ts";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) { failures++; console.error(`FAIL  ${label}${detail ? " — " + detail : ""}`); }
  else console.log(`ok    ${label}`);
};

// Every codepoint `normaliseFormatting` handles that `sanitizeWinAnsi`'s allow-list would map to `?`.
// U+00A0 is deliberately absent: it IS inside the allow-list range \xA0-\xFF, so it never diverged.
const DIVERGENT: Array<[string, string]> = [
  ["U+202F narrow no-break space", " "],
  ["U+2007 figure space", " "],
  ["U+200B zero-width space", "​"],
  ["U+200C zero-width non-joiner", "‌"],
  ["U+200D zero-width joiner", "‍"],
  ["U+2060 word joiner", "⁠"],
  ["U+FEFF byte-order mark", "﻿"],
  ["CR (Windows paste)", "\r"],
];

console.log("── a name that PASSES validation must RENDER faithfully ──");
for (const [label, ch] of DIVERGENT) {
  const name = `Antonia${ch}Daniels`;

  // 1. Validation accepts it (this was already true — it is why the defect was silent).
  const validationPasses = wouldLoseCharacters(name) === false;
  let asserted = true;
  try { assertNamesAreStampable([name]); } catch { asserted = false; }

  // 2. The RENDER must now agree: no `?` may appear in the stamped string.
  const rendered = sanitizeWinAnsi(name);
  const renderClean = !rendered.includes("?");

  check(
    `${label}: validated=${validationPasses && asserted}, rendered="${rendered.replace(/\n/g, "\\n")}"`,
    validationPasses && asserted && renderClean,
    renderClean ? "" : `render produced "${rendered}" — the PDF would carry a name that is not the signer's`,
  );

  // 3. And the two must be the SAME string — "render what you validated", exactly.
  check(
    `${label}: render === sanitize(normalise(name))`,
    sanitizeWinAnsi(name) === sanitizeWinAnsi(normaliseFormatting(name)),
  );
}

console.log("\n── the guard must still REFUSE a name it genuinely cannot stamp ──");
for (const [label, name] of [
  ["Cyrillic", "Пётр Ильич"],
  ["Japanese", "山田太郎"],
  ["Arabic", "محمد عبد"],
  ["emoji", "Dan 🎉 Smith"],
] as Array<[string, string]>) {
  let threw = false;
  try { assertNamesAreStampable([name]); } catch { threw = true; }
  check(`${label} still refused at send`, threw && wouldLoseCharacters(name) === true);
}

console.log("\n── ordinary names are untouched ──");
for (const name of ["Antonio Daniel", "Zoë Müller", "Jean-Luc O'Brien", "José Álvarez"]) {
  check(`"${name}" renders verbatim`, sanitizeWinAnsi(name) === name && !wouldLoseCharacters(name));
}

console.log(failures === 0 ? "\nPASS — all checks green" : `\nFAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
