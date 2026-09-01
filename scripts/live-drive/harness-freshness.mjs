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
/**
 * @param base     harness origin, e.g. http://127.0.0.1:5203
 * @param expected [{ file, markers }] — `markers` are STRING LITERALS from the
 *                 change under test. Literals survive Vite's TS/TSX transform;
 *                 source LINES do not, which is how the first version of this
 *                 check went wrong. It sampled the last 40 substantial lines of
 *                 each file, and in a .tsx file those are JSX — compiled into
 *                 `jsx(...)` calls, so they were absent from the served module
 *                 whether the build was stale or fresh. It reported 40/40 missing
 *                 either way, and its apparent catch of a genuinely stale server
 *                 was luck, not detection.
 *
 * Each marker must be present on DISK too. A marker that no longer exists in the
 * source is a stale expectation, and silently passing on one would rebuild the
 * blind spot this exists to remove.
 *
 * `absent` is the other half, and it was missing until a REMOVAL slipped past.
 * Presence markers can only ever catch a build that is behind on an ADDITION. A
 * change that DELETES something — a component, a branch, a call — leaves every
 * surviving marker intact, so the check passed while the server still served the
 * deleted code. That cost a real debugging detour: a component removed from the
 * source kept rendering, threw on data that no longer existed, and read exactly
 * like a crash in the new code. So a drive whose change removes something names
 * the removed literals here, and they must be absent from the served module AND
 * from disk.
 */
export async function assertHarnessServesWorkingTree(base, expected) {
  const problems = [];
  for (const { file, markers = [], absent = [] } of expected) {
    const abs = path.resolve(file);
    const onDisk = fs.readFileSync(abs, "utf8");
    const absentFromDisk = markers.filter((m) => !onDisk.includes(m));
    if (absentFromDisk.length) {
      problems.push(`${file}: marker(s) no longer in the source — ${JSON.stringify(absentFromDisk)}`);
      continue;
    }
    let served;
    try {
      const res = await fetch(`${base}/@fs${abs}`);
      served = res.ok ? await res.text() : null;
    } catch (e) {
      throw new Error(`harness freshness: could not fetch ${file} from ${base} — ${e.message}`);
    }
    if (served === null) { problems.push(`${file}: not served`); continue; }
    const absentFromServed = markers.filter((m) => !served.includes(m));
    if (absentFromServed.length) {
      problems.push(`${file}: served module is missing ${JSON.stringify(absentFromServed)}`);
    }
    // The removal half. A literal the change DELETED must be gone from disk
    // (or the expectation is stale) and gone from what the server hands out.
    const stillOnDisk = absent.filter((m) => onDisk.includes(m));
    if (stillOnDisk.length) {
      problems.push(`${file}: expected-removed marker(s) still in the SOURCE — ${JSON.stringify(stillOnDisk)}`);
      continue;
    }
    const stillServed = absent.filter((m) => served.includes(m));
    if (stillServed.length) {
      problems.push(`${file}: served module STILL CONTAINS removed ${JSON.stringify(stillServed)}`);
    }
  }
  if (problems.length) {
    throw new Error(
      "HARNESS IS SERVING A STALE BUILD — refusing to measure it.\n  " +
        problems.join("\n  ") +
        "\n  Restart the harness so it serves the working tree, then re-run.",
    );
  }
  console.log(`   harness freshness: ${expected.length} file(s) serve the working tree`);
}
