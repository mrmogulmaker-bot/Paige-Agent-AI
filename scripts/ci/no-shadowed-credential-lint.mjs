#!/usr/bin/env node
/**
 * A credential must have ONE representation per request.
 *
 * This exists because the same defect landed twice in one day. First the guard ("has a
 * credential?") and the mapping ("which credential?") were separate, learned about a new
 * auth shape at different times, and refused a connection that had just been saved. They
 * were consolidated into `authFromSecret(secret)` — and that consolidation immediately
 * exposed the second instance: `call-zapier-action` kept a local `let token` copy that an
 * OAuth refresh rotated, while the auth was derived from the untouched `secret` field. The
 * first call after every token expiry went out with the dead token.
 *
 * Both are the same mistake: two representations of one fact, updated in different places.
 *
 * HONEST ABOUT WHAT THIS IS. A structural check, not a behavioural one. It cannot prove the
 * rotation reaches the wire — the sequence lives inside an edge function that this repo has
 * no harness to drive. What it CAN do is fail when the shape that caused the bug reappears,
 * which is the part that actually recurred. The behavioural half is the `authFromSecret`
 * contract assertion in scripts/mcp-transport-smoke.mjs.
 */
import { readFileSync } from "node:fs";

const FILES = [
  "supabase/functions/call-zapier-action/index.ts",
  "supabase/functions/tenant-mcp-connect/index.ts",
];

// A mutable local binding named for a credential, alongside a `secret` the auth is derived
// from, is the shape that drifted. `const` is fine: it cannot be rotated out from under
// the derivation.
const SHADOW = /^\s*let\s+(token|accessToken|credential|apiKey)\s*[:=]/;

let failures = 0;
for (const file of FILES) {
  let src;
  try { src = readFileSync(file, "utf8"); }
  catch { console.error(`no-shadowed-credential-lint: cannot read ${file}`); failures++; continue; }
  if (!src.includes("authFromSecret")) continue;
  src.split("\n").forEach((line, i) => {
    if (SHADOW.test(line)) {
      console.error(
        `${file}:${i + 1}: a mutable credential local sits beside authFromSecret(secret).\n` +
        `  Rotation must write to \`secret\` so the auth derived from it carries the new value.\n` +
        `  ${line.trim()}`,
      );
      failures++;
    }
  });
}

if (failures) {
  console.error(`\nno-shadowed-credential-lint: ${failures} problem(s).`);
  process.exit(1);
}
console.log(`no-shadowed-credential-lint: ${FILES.length} file(s); no credential has a second representation.`);
