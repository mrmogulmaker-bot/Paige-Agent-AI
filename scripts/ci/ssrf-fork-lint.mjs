#!/usr/bin/env node
/**
 * One SSRF validator, not five (§18).
 *
 * The numeric address validator was independently copied into four places before anyone
 * noticed, and every copy was missing the same three protections. A comment asking people
 * not to fork it is what failed; this fails the build instead.
 *
 * A file outside the shared home may not define the validator's internals. Import
 * `_shared/ssrfGuard.ts` — or, for an outbound call to a tenant-supplied destination,
 * `safeFetch`, which also bounds the wait and the body.
 *
 * The one grandfathered copy is named below with what it still owes, so it stays visible
 * rather than becoming permanent by silence.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const HOME = "supabase/functions/_shared/ssrfGuard.ts";

/**
 * Grandfathered forks. Each entry is a debt, not a blessing: it names the file and what
 * consolidating it would gain. Removing an entry is the goal; adding one needs a reason
 * that survives review.
 */
const GRANDFATHERED = {
  "supabase/functions/paige-n8n/index.ts":
    "n8n REST API path. Consolidating it would add the bounded wall clock and bounded " +
    "response size it currently lacks; deferred because it is a live path and the MCP " +
    "slice that introduced the shared client does not otherwise touch it.",
  "supabase/functions/_shared/ssrf-guard.ts":
    "An older, weaker guard (it permits http://) with one caller, studio-visual-critique. " +
    "Superseded by ssrfGuard.ts; its caller should move and the file should go.",
};

// The internals — not the exported entry points, which callers are supposed to use.
const FORK_MARKERS = [/function\s+ipv4Private\s*\(/, /function\s+ipUnsafe\s*\(/, /function\s+isPrivateV4\s*\(/];

const files = globSync("{supabase/functions,src,scripts}/**/*.{ts,tsx,mjs}", { exclude: (p) => p.includes("node_modules") });

const offenders = [];
for (const file of files) {
  const norm = file.replaceAll("\\", "/");
  if (norm === HOME) continue;
  const source = readFileSync(file, "utf8");
  if (!FORK_MARKERS.some((re) => re.test(source))) continue;
  if (norm in GRANDFATHERED) continue;
  offenders.push(norm);
}

if (offenders.length) {
  console.error("\nSSRF validator forked outside its one home.\n");
  for (const f of offenders) console.error(`  ${f}`);
  console.error(
    `\nImport { safeFetch } from "${HOME}" instead of redefining the address validator.` +
    "\nsafeFetch also refuses redirects and bounds the wait and the response size, which" +
    "\nevery hand-rolled copy so far has been missing.\n",
  );
  process.exit(1);
}

const debts = Object.keys(GRANDFATHERED).length;
console.log(`ssrf-fork-lint: one shared validator, ${debts} grandfathered fork(s) still owed.`);
