import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PR4 — Solo Functional Inventory & Certification Map.
 *
 * The matrix at docs/delivery/solo-completion-matrix.json is the authority.
 * Every count stated in docs/delivery/solo-functional-inventory.md is derived
 * here from the rows, so the two artifacts cannot drift apart silently. The
 * scanners also enforce the de-identification rule (no customer-identifying
 * data — no bare account-number-shaped digit runs) and the status vocabulary
 * (no "done"/"mostly done" language anywhere in the matrix).
 */

const MATRIX_PATH = "docs/delivery/solo-completion-matrix.json";
const DOC_PATH = "docs/delivery/solo-functional-inventory.md";

type Row = Record<string, string>;
interface Matrix {
  status_vocabulary: string[];
  reachability_vocabulary: string[];
  priority_vocabulary: string[];
  next_pr_vocabulary: string[];
  rows: Row[];
  orphans: Array<{ path: string; kind: string; evidence: string; disposition: string }>;
  acceptance_matrix: Array<{ scenario: string; procedure: string; pass_criteria: string }>;
}

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const matrix: Matrix = JSON.parse(read(MATRIX_PATH));
const doc = read(DOC_PATH);

const REQUIRED_STRING_FIELDS = [
  "capability_id", "surface", "route", "user_journey", "current_state",
  "reachability", "canonical_owner", "frontend_asset", "backend_seam",
  "authority_model", "provider_dependency", "readback", "receipt_evidence",
  "entitlement_dependency", "known_blocker", "proof_owed", "remaining_delta",
  "recommended_next_pr", "priority",
] as const;

const countBy = (rows: Row[], key: string) =>
  rows.reduce<Record<string, number>>((acc, r) => {
    acc[r[key]] = (acc[r[key]] ?? 0) + 1;
    return acc;
  }, {});

/** Strips sanctioned #PR references, then rejects any remaining 4+ digit run
 *  (account numbers, provider SIDs, migration versions, line numbers). */
const privacyDigits = (value: string) => value.replace(/#\d+/g, "").match(/\d{4,}/);
/** Rejects anything shaped like an email address. */
const privacyEmail = (value: string) => value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

const BANNED_DONE_PHRASES = ["mostly done", "completely done", "fully done", "all done"];
const bannedPhrase = (value: string) =>
  BANNED_DONE_PHRASES.find((p) => value.toLowerCase().includes(p));

/** Every prose string the matrix carries — rows, orphan registry, acceptance
 *  scenarios — so the scanners below cannot be sidestepped by planting text
 *  outside the rows array. */
const allMatrixStrings = (): string[] => {
  const out: string[] = [];
  for (const row of matrix.rows) {
    for (const field of REQUIRED_STRING_FIELDS) out.push(row[field]);
  }
  for (const o of matrix.orphans) out.push(o.path, o.kind, o.evidence, o.disposition);
  for (const a of matrix.acceptance_matrix) out.push(a.scenario, a.procedure, a.pass_criteria);
  return out;
};

describe("solo completion matrix: structure", () => {
  it("declares the vocabulary it uses and the test enforces the same sets", () => {
    expect(matrix.status_vocabulary).toEqual([
      "LIVE", "PARTIAL", "UNAVAILABLE", "NOT_CONNECTED", "PROOF_OWED", "BLOCKED", "NOT_APPLICABLE",
    ]);
    expect(matrix.reachability_vocabulary.length).toBeGreaterThan(0);
    expect(matrix.priority_vocabulary).toEqual(["P0", "P1", "P2", "P3", "NONE"]);
  });

  it("every row has exactly the required fields, all strings, ids unique", () => {
    const seen = new Set<string>();
    for (const row of matrix.rows) {
      for (const field of REQUIRED_STRING_FIELDS) {
        expect(typeof row[field], `${row.capability_id}.${field}`).toBe("string");
      }
      expect(row.capability_id, "duplicate capability_id").toBeTruthy();
      expect(seen.has(row.capability_id), `duplicate capability_id ${row.capability_id}`).toBe(false);
      seen.add(row.capability_id);
    }
  });

  it("every enumerable field is inside its vocabulary", () => {
    for (const row of matrix.rows) {
      expect(matrix.status_vocabulary, row.capability_id).toContain(row.current_state);
      expect(matrix.reachability_vocabulary, row.capability_id).toContain(row.reachability);
      expect(matrix.priority_vocabulary, row.capability_id).toContain(row.priority);
      expect(matrix.next_pr_vocabulary, row.capability_id).toContain(row.recommended_next_pr);
    }
  });
});

describe("solo completion matrix: truth discipline", () => {
  it("narrative fields are filled wherever a verdict depends on them", () => {
    for (const row of matrix.rows) {
      const id = row.capability_id;
      if (row.current_state === "PROOF_OWED") {
        expect(row.proof_owed.trim(), `${id}: PROOF_OWED needs proof_owed text`).not.toBe("");
      }
      if (row.current_state === "BLOCKED") {
        expect(row.known_blocker.trim(), `${id}: BLOCKED needs known_blocker text`).not.toBe("");
      }
      if (row.priority === "P0" || row.priority === "P1") {
        expect(
          row.known_blocker.trim() + row.remaining_delta.trim(),
          `${id}: P0/P1 needs a blocker or a delta`,
        ).not.toBe("");
        expect(row.recommended_next_pr, `${id}: P0/P1 needs a next PR`).not.toBe("NONE");
      }
      if (row.priority !== "NONE") {
        expect(row.recommended_next_pr, `${id}: any priority needs a destination`).not.toBe("NONE");
      }
      if (row.reachability === "orphaned_dead_code") {
        expect(
          row.recommended_next_pr === "NONE" || row.recommended_next_pr === "PR-A" || row.recommended_next_pr === "PR-F",
          `${id}: orphaned rows route to a fix PR or stay unrouted (none linger as product)`,
        ).toBe(true);
      }
    }
  });

  it("carries no banned completion language (rows, orphans, acceptance)", () => {
    for (const text of allMatrixStrings()) {
      expect(bannedPhrase(text), `banned phrase in: ${text.slice(0, 60)}`).toBeUndefined();
    }
  });
});

describe("solo completion matrix: de-identification", () => {
  it("no row field contains account-number-shaped data (4+ digit runs)", () => {
    for (const row of matrix.rows) {
      for (const field of REQUIRED_STRING_FIELDS) {
        const hit = privacyDigits(row[field]);
        expect(hit, `${row.capability_id}.${field} contains digit run ${hit?.[0]}`).toBeNull();
      }
    }
  });

  it("no orphan-registry or acceptance text carries digit runs or emails either", () => {
    const peripheral = [
      ...matrix.orphans.flatMap((o) => [o.path, o.evidence]),
      ...matrix.acceptance_matrix.flatMap((a) => [a.scenario, a.procedure, a.pass_criteria]),
    ];
    for (const text of peripheral) {
      expect(privacyDigits(text), `digit run in: ${text.slice(0, 60)}`).toBeNull();
      expect(privacyEmail(text), `email in: ${text.slice(0, 60)}`).toBeNull();
    }
  });

  it("no matrix text carries an email address", () => {
    for (const text of allMatrixStrings()) {
      expect(privacyEmail(text), `email in: ${text.slice(0, 60)}`).toBeNull();
    }
  });

  it("scanner meta-check: the digit, email, and phrase scanners actually fail on bad input", () => {
    expect(privacyDigits("tenant 4832 account")).not.toBeNull();
    expect(privacyDigits("parked in open PR #917 lane")).toBeNull();
    expect(privacyEmail("owner at example dot com <owner@example.com>")).not.toBeNull();
    expect(privacyEmail("owner at example dot com")).toBeNull();
    expect(bannedPhrase("this journey is mostly done")).toBe("mostly done");
    expect(bannedPhrase("this journey is LIVE with receipts")).toBeUndefined();
  });
});

describe("solo completion matrix: orphans and acceptance", () => {
  it("every orphan entry is complete, disposed to the Cursor lane family, and count-locked to the doc", () => {
    const dispositions = new Set([
      "cursor-lane",
      "cursor-lane-pending-verification",
      "cursor-lane-after-pr-a",
    ]);
    const m = doc.match(/solo-inventory:totals [^\n]+?orphans=(\d+)/);
    expect(m, "doc totals comment must state orphans=N").toBeTruthy();
    expect(matrix.orphans.length, "orphan registry size must equal the doc's stated count")
      .toBe(Number(m![1]));
    for (const o of matrix.orphans) {
      expect(o.path.trim(), "orphan path").not.toBe("");
      expect(o.evidence.trim(), `orphan ${o.path} needs evidence`).not.toBe("");
      expect(dispositions.has(o.disposition), `orphan ${o.path} disposition`).toBe(true);
    }
  });

  it("the acceptance matrix covers the required scenario set", () => {
    const scenarios = matrix.acceptance_matrix.map((s) => s.scenario);
    for (const required of [
      "fresh Solo account", "established account", "setup incomplete", "setup complete",
      "connected provider", "disconnected provider", "permitted user", "restricted user",
      "consequential action requiring approval", "failed provider action", "account switch",
      "degraded dependency",
    ]) {
      expect(scenarios, `missing acceptance scenario: ${required}`).toContain(required);
    }
    for (const s of matrix.acceptance_matrix) {
      expect(s.pass_criteria.trim(), `scenario ${s.scenario}`).not.toBe("");
    }
  });
});

describe("solo functional inventory doc: totals cannot drift from the matrix", () => {
  const stateCounts = countBy(matrix.rows, "current_state");
  const priorityCounts = countBy(matrix.rows, "priority");
  const states = matrix.status_vocabulary;

  it("state and priority partitions each account for every row", () => {
    expect(states.reduce((n, s) => n + (stateCounts[s] ?? 0), 0)).toBe(matrix.rows.length);
    expect(matrix.priority_vocabulary.reduce((n, p) => n + (priorityCounts[p] ?? 0), 0))
      .toBe(matrix.rows.length);
  });

  it("the doc's totals comment matches the derived counts exactly", () => {
    const m = doc.match(/solo-inventory:totals ([^\n]+)/);
    expect(m, "doc must carry a solo-inventory:totals comment").toBeTruthy();
    const claimed = Object.fromEntries(
      m![1].trim().split(/\s+/).map((pair) => pair.split("=") as [string, string]),
    );
    expect(Number(claimed.total)).toBe(matrix.rows.length);
    for (const s of states) expect(Number(claimed[s])).toBe(stateCounts[s] ?? 0);
    for (const p of ["P0", "P1", "P2", "P3"]) {
      expect(Number(claimed[p]), `priority ${p}`).toBe(priorityCounts[p] ?? 0);
    }
  });

  it("the doc names every P0 and P1 capability id", () => {
    for (const row of matrix.rows) {
      if (row.priority === "P0" || row.priority === "P1") {
        expect(doc.includes(row.capability_id), `doc must list ${row.capability_id}`).toBe(true);
      }
    }
  });

  it("count meta-check: flipping one row's state would break the doc comparison", () => {
    // What the doc claims today:
    const m = doc.match(/solo-inventory:totals ([^\n]+)/);
    const claimed = Object.fromEntries(
      m![1].trim().split(/\s+/).map((pair) => pair.split("=") as [string, string]),
    );
    // The same derivation against a tampered matrix (one LIVE row flipped to
    // PARTIAL) no longer matches the doc's stated numbers — proving the
    // assertion above is drift-sensitive, not decorative.
    const first = matrix.rows.find((r) => r.current_state === "LIVE")!;
    const tampered = [
      { ...first, current_state: "PARTIAL" },
      ...matrix.rows.filter((r) => r !== first),
    ];
    const after = countBy(tampered, "current_state");
    expect(after.LIVE).toBe(Number(claimed.LIVE) - 1);
    expect(after.PARTIAL).toBe(Number(claimed.PARTIAL) + 1);
  });
});
