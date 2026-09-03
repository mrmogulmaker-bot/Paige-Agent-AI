import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  ProofFailure,
  assertCompatibilityShimConfined,
  assertDisposableDatabaseTarget,
  createState,
  finalVerdict,
  markPhase,
  runProof,
  selectCandidates,
  selectProofs,
  sha256,
} from "./premerge-migration-proof.mjs";

function write(root, path, contents) {
  const absolute = join(root, ...path.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents, "utf8");
  return absolute;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "paige-migration-proof-"));
  write(root, "baseline_roles.sql", "select 1;\n");
  write(root, "baseline_schema.sql", "create table baseline_ready(id int);\n");
  write(root, ".github/scripts/fixtures/migration-proof/disposable-auth-compat.sql", "create function auth.jwt() returns jsonb;\n");
  write(root, "supabase/migrations/20260824000000_candidate.sql", "create table candidate_ready(id int);\n");
  write(root, "supabase/migrations/20260824010000_other.sql", "create table other_ready(id int);\n");
  write(root, "supabase/tests/candidate_proof.sql", "select 1;\n");
  return root;
}

function adapter({ failAt } = {}) {
  const calls = [];
  return {
    calls,
    async psqlFile(path) {
      calls.push(["psqlFile", path.replaceAll("\\", "/")]);
      if (failAt && path.replaceAll("\\", "/").includes(failAt)) throw new Error(`forced failure at ${failAt}`);
    },
    async psqlCommand(sql) {
      calls.push(["psqlCommand", sql]);
      if (failAt === "psqlCommand") throw new Error("forced restore command failure");
    },
    async schemaSnapshot(path) {
      calls.push(["schemaSnapshot", path.replaceAll("\\", "/")]);
      if (failAt === "schemaSnapshot") throw new Error("forced snapshot failure");
      writeFileSync(path, "create table candidate_ready(id integer);\n", "utf8");
    },
  };
}

function options(root, overrides = {}) {
  return {
    root,
    candidatePaths: ["supabase/migrations/20260824000000_candidate.sql"],
    proofPaths: ["supabase/tests/candidate_proof.sql"],
    baselineRoles: "baseline_roles.sql",
    baselineSchema: "baseline_schema.sql",
    compatibilityShim: ".github/scripts/fixtures/migration-proof/disposable-auth-compat.sql",
    schemaSnapshot: "candidate_schema.sql",
    statePath: join(root, "proof-state.json"),
    adapter: adapter(),
    logger: () => {},
    ...overrides,
  };
}

test("restore failure is non-green and candidate application never runs", async () => {
  const root = fixture();
  const fake = adapter({ failAt: "baseline_schema.sql" });
  await assert.rejects(runProof(options(root, { adapter: fake })), /environment_restoration/u);
  const state = JSON.parse(readFileSync(join(root, "proof-state.json"), "utf8"));
  assert.equal(state.verdict, "failed");
  assert.equal(state.phases.environment_restoration.status, "failed");
  assert.equal(state.phases.candidate_application.status, "pending");
  assert.equal(fake.calls.some(([, path]) => path.includes("20260824000000_candidate.sql")), false);
});

test("missing candidate fails identification", () => {
  assert.throws(() => selectCandidates([]), /found 0/u);
});

test("candidates outside the migration directory fail identification", () => {
  assert.throws(
    () => selectCandidates([
      "supabase/migrations/20260824000000_candidate.sql",
      "docs/20260824010000_other.sql",
    ]),
    /outside the migration directory/u,
  );
});

test("duplicate migration versions fail identification", () => {
  assert.throws(
    () => selectCandidates([
      "supabase/migrations/20260824000000_candidate.sql",
      "supabase/migrations/20260824000000_other.sql",
    ]),
    /duplicate migration version/u,
  );
});

test("a migration PR without a changed behavioral SQL proof fails identification", () => {
  assert.throws(() => selectProofs([]), /at least one changed SQL behavioral proof/u);
});

test("a skipped candidate application can never produce a passing verdict", () => {
  const state = createState();
  markPhase(state, "environment_restoration", "passed");
  markPhase(state, "candidate_identification", "passed");
  markPhase(state, "behavioral_verification", "passed");
  assert.throws(() => finalVerdict(state), /candidate_application/u);
  assert.equal(state.verdict, "failed");
});

test("candidate syntax or execution failure is non-green", async () => {
  const root = fixture();
  const fake = adapter({ failAt: "20260824000000_candidate.sql" });
  await assert.rejects(runProof(options(root, { adapter: fake })), /candidate_application/u);
  const state = JSON.parse(readFileSync(join(root, "proof-state.json"), "utf8"));
  assert.equal(state.verdict, "failed");
  assert.equal(state.phases.candidate_application.status, "failed");
  assert.equal(state.phases.behavioral_verification.status, "pending");
});

test("successful restore, exact application, schema snapshot, and behavioral proof produce green", async () => {
  const root = fixture();
  const fake = adapter();
  const state = await runProof(options(root, { adapter: fake }));
  assert.equal(state.verdict, "passed");
  assert.deepEqual(Object.values(state.phases).map(({ status }) => status), ["passed", "passed", "passed", "passed"]);
  assert.equal(state.candidates[0].path, "supabase/migrations/20260824000000_candidate.sql");
  assert.deepEqual(state.appliedCandidates, state.candidates);
  assert.ok(state.schemaSnapshot.bytes > 0);
  assert.equal(state.proofs[0].status, "passed");
});

test("auth.jwt compatibility shim is confined to disposable proof fixtures", () => {
  const root = fixture();
  const shim = assertCompatibilityShimConfined(
    root,
    ".github/scripts/fixtures/migration-proof/disposable-auth-compat.sql",
  );
  assert.match(readFileSync(shim, "utf8"), /auth\.jwt/u);
  assert.throws(
    () => assertCompatibilityShimConfined(root, "supabase/migrations/20260824000000_candidate.sql"),
    /must live only/u,
  );
});

test("production migrations do not define the disposable auth.jwt compatibility helper", () => {
  const migrations = resolve(import.meta.dirname, "../../supabase/migrations");
  const files = readdirSync(migrations).filter((name) => name.endsWith(".sql"));
  const contents = files.map((name) => readFileSync(join(migrations, name), "utf8"));
  const definitions = contents.flatMap((sql) => sql.match(/create\s+(?:or\s+replace\s+)?function\s+auth\.jwt/giu) ?? []);
  assert.equal(definitions.length, 0, "the test-only helper must never be a production migration");
});

test("database execution refuses any non-disposable host", () => {
  assert.doesNotThrow(() => assertDisposableDatabaseTarget({ PGHOST: "localhost" }));
  assert.throws(
    () => assertDisposableDatabaseTarget({ PGHOST: "db.production.example" }),
    /must target the disposable local service/u,
  );
});

test("the exact changed PR migration is fingerprinted and applied instead of an unrelated file", async () => {
  const root = fixture();
  const fake = adapter();
  const expected = sha256(join(root, "supabase/migrations/20260824000000_candidate.sql"));
  const state = await runProof(options(root, {
    candidatePaths: ["supabase/migrations/20260824000000_candidate.sql"],
    adapter: fake,
  }));
  assert.equal(state.candidates[0].sha256, expected);
  assert.equal(state.appliedCandidates[0].sha256, expected);
  assert.equal(fake.calls.some(([, path]) => path.includes("20260824010000_other.sql")), false);
});

test("multiple migrations are ordered by version/name and every fingerprint is applied once", async () => {
  const root = fixture();
  const fake = adapter();
  const state = await runProof(options(root, {
    candidatePaths: [
      "supabase/migrations/20260824010000_other.sql",
      "supabase/migrations/20260824000000_candidate.sql",
    ],
    adapter: fake,
  }));
  assert.deepEqual(
    state.candidates.map(({ path }) => path),
    [
      "supabase/migrations/20260824000000_candidate.sql",
      "supabase/migrations/20260824010000_other.sql",
    ],
  );
  assert.deepEqual(state.appliedCandidates, state.candidates);
  const applied = fake.calls.filter(([kind, path]) => kind === "psqlFile" && path.includes("supabase/migrations/"));
  assert.equal(applied.length, 2);
  assert.match(applied[0][1], /20260824000000_candidate\.sql$/u);
  assert.match(applied[1][1], /20260824010000_other\.sql$/u);
});

test("final status matches every actual proof result", async () => {
  const successRoot = fixture();
  const passed = await runProof(options(successRoot));
  assert.equal(passed.verdict, "passed");

  const failedRoot = fixture();
  await assert.rejects(
    runProof(options(failedRoot, { adapter: adapter({ failAt: "candidate_proof.sql" }) })),
    ProofFailure,
  );
  const failed = JSON.parse(readFileSync(join(failedRoot, "proof-state.json"), "utf8"));
  assert.equal(failed.verdict, "failed");
  assert.equal(failed.phases.behavioral_verification.status, "failed");
});

test("workflow has an always-run fail-closed verdict and no warning-plus-success escape", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../workflows/premerge-migration-proof.yml"), "utf8");
  assert.match(workflow, /Final verdict \(missing or incomplete evidence is failure\)[\s\S]+if: always\(\)[\s\S]+--assert-state/gu);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/gu);
  assert.doesNotMatch(workflow, /exit 0/gu);
  assert.doesNotMatch(workflow, /advisory INCONCLUSIVE/gu);
  assert.doesNotMatch(workflow, /supabase db push|supabase migration up|execute_sql/gu);
  assert.match(workflow, /PGHOST: localhost/gu);
});
