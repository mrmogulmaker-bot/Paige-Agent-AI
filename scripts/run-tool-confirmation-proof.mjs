#!/usr/bin/env node
/**
 * Run the confirm-binding SQL proof and judge it by its OWN result line.
 *
 * WHY A WRAPPER. The proof ends in `raise exception` so the transaction aborts by construction —
 * so psql exits NON-ZERO on success. Reading the exit code would invert the verdict. The only
 * truthful signal is the `PROOF RESULT pass=N fail=M` line the block raises.
 *
 * WHY THIS EXISTS AT ALL. The lesson shipped alongside it ("Every gate we run is blind to SQL") is
 * on its THIRD occurrence, and the thing standing between us and a fourth was a human remembering
 * to run a file by hand (§24). This is that automation.
 *
 *   SUPABASE_DB_URL=postgres://... npm run proof:tool-confirmation
 *
 * HONEST LIMIT (§13/§68): CI has no database connection, so this is NOT wired into a workflow. With
 * no URL it exits 1 and says NOT RUN — it never reports a pass it did not earn, because a green
 * that proves nothing is worse than a red.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SQL = "scripts/tool-confirmation-sql-proof.sql";
const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";

if (!url) {
  console.error(`NOT RUN — no SUPABASE_DB_URL / DATABASE_URL in the environment.
The proof needs a database. Set one and re-run, or execute ${SQL} against the target
database directly (it aborts its own transaction; nothing is persisted).`);
  process.exit(1);
}
if (!fs.existsSync(SQL)) {
  console.error(`NOT RUN — ${SQL} is missing.`);
  process.exit(1);
}

let out = "";
try {
  out = execFileSync("psql", [url, "-v", "ON_ERROR_STOP=0", "-f", SQL], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  // Expected: the proof raises, so psql reports failure. The output still carries the verdict.
  out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
}

const m = out.match(/PROOF RESULT\s+pass=(\d+)\s+fail=(\d+)/);
if (!m) {
  console.error("NOT RUN — the proof produced no PROOF RESULT line. Raw output:\n" + out.slice(0, 4000));
  process.exit(1);
}
const [, pass, fail] = m;
console.log(out.slice(out.indexOf("PROOF RESULT")).slice(0, 4000));
if (Number(fail) > 0) {
  console.error(`\nFAILED — ${fail} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nOK — ${pass} assertions passed, 0 failed. Transaction aborted; nothing persisted.`);
