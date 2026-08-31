/**
 * ABORT RATHER THAN MEASURE A STALE BUILD.
 *
 * The drive harnesses are Vite dev servers. When a source file changes while a
 * server is up — a revert during a failing-first proof, an edit mid-run, an HMR
 * that does not land — the server can keep serving the PREVIOUS module while the
 * working tree holds the new one. Every check then measures a build nobody has,
 * and the result looks like a product defect.
 *
 * That has happened three times in this workstream. Twice it produced red rows
 * that were investigated as real regressions; once it produced a GREEN run that
 * was quoted as proof. The green case is the dangerous one, and being careful is
 * not a defence against it — nothing in a passing drive says which build it saw.
 *
 * So every drive calls this first. It fetches each file the way Vite serves it and
 * compares against the bytes on disk, and it THROWS rather than returning a
 * warning: a drive that keeps going after this has failed is exactly the failure
 * mode being closed.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @param base   harness origin, e.g. http://127.0.0.1:5203
 * @param files  repo-relative source paths whose freshness actually matters
 */
export async function assertHarnessServesWorkingTree(base, files) {
  const stale = [];
  for (const rel of files) {
    const abs = path.resolve(rel);
    const onDisk = fs.readFileSync(abs, "utf8");
    let served;
    try {
      const res = await fetch(`${base}/@fs${abs}`);
      served = res.ok ? await res.text() : null;
    } catch (e) {
      throw new Error(`harness freshness: could not fetch ${rel} from ${base} — ${e.message}`);
    }
    if (served === null) { stale.push(`${rel}: not served`); continue; }

    // Vite transforms TS/TSX, so the served text is not byte-identical. Compare on
    // distinctive lines instead: every non-trivial line of source that survives
    // transformation should appear. Comments and types are stripped, so only
    // executable-looking lines are sampled.
    const sample = onDisk
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 28 && !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
      .slice(-40);
    const missing = sample.filter((l) => !served.includes(l));
    // A transform can legitimately reshape a minority of lines; a stale module
    // misses nearly all of the recent ones.
    if (sample.length && missing.length > sample.length * 0.6) {
      stale.push(`${rel}: ${missing.length}/${sample.length} recent source lines absent from the served module`);
    }
  }
  if (stale.length) {
    throw new Error(
      "HARNESS IS SERVING A STALE BUILD — refusing to measure it.\n  " +
        stale.join("\n  ") +
        "\n  Restart the harness so it serves the working tree, then re-run.",
    );
  }
  console.log(`   harness freshness: ${files.length} file(s) match the working tree`);
}
