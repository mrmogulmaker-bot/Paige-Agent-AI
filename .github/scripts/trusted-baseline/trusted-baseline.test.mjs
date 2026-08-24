import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  POSTGRES_IMAGE,
  POLICY_PATH,
  PRODUCTION_CREDENTIAL_ENV_NAMES,
  SIGNER_WORKFLOW,
  sha256,
} from "./contract.mjs";
import { buildBaselineArtifact, lexSql, sanitizeSql } from "./sanitize.mjs";
import {
  buildAttestationVerificationArgs,
  validateArtifactShape,
  verifyBaselineArtifact,
  verifyBaseMainCompatibility,
} from "./verify.mjs";

const FIXTURES = new URL("../fixtures/trusted-baseline/", import.meta.url);
const SOURCE_COMMIT = "1".repeat(40);
const BASE_MAIN_SHA = "2".repeat(40);
const TREE_OID = "3".repeat(40);
const GENERATED_AT = "2026-08-24T12:00:00Z";
const EXPIRES_AT = "2026-09-07T12:00:00Z";
const NOW = Date.parse("2026-08-25T12:00:00Z");

async function fixture(name) {
  return readFile(new URL(name, FIXTURES), "utf8");
}

async function safePolicy() {
  return JSON.parse(await fixture("safe-policy.json"));
}

async function safeArtifact(overrides = {}) {
  return buildBaselineArtifact({
    sql: await fixture("safe-schema.sql"),
    policy: await safePolicy(),
    sourceCommit: SOURCE_COMMIT,
    migrationsTreeOid: TREE_OID,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  });
}

const POLICY_TEXT = `${JSON.stringify({ contractVersion: 1, allowedLiteralSha256: [], reviewedRoutineStatementSha256: [] }, null, 2)}\n`;

function passingGitRunner(args) {
  if (args[0] === "merge-base") return { status: 0, stdout: "", stderr: "" };
  if (args[0] === "rev-parse") return { status: 0, stdout: `${TREE_OID}\n`, stderr: "" };
  if (args[0] === "show") return { status: 0, stdout: POLICY_TEXT, stderr: "" };
  throw new Error(`unexpected git invocation: ${args.join(" ")}`);
}

test("sanitizer produces deterministic schema-only output and removes comments", async () => {
  const result = sanitizeSql(await fixture("safe-schema.sql"), await safePolicy());
  assert.equal(result.statementCount, 4);
  assert.equal(result.commentsRemoved, 1);
  assert.doesNotMatch(result.schema, /Synthetic schema/);
  assert.match(result.schema, /ENABLE ROW LEVEL SECURITY/);
});

test("row data statements fail closed", async () => {
  const [sql, policy] = await Promise.all([fixture("adversarial-copy.sql"), safePolicy()]);
  assert.throws(() => sanitizeSql(sql, policy), /prohibited SQL statement: COPY/);
});

test("role and password DDL fails closed", async () => {
  const [sql, policy] = await Promise.all([fixture("adversarial-role.sql"), safePolicy()]);
  assert.throws(() => sanitizeSql(sql, policy), /prohibited SQL statement: CREATE ROLE/);
});

test("connection material in a literal fails before literal allowlisting", async () => {
  const [sql, policy] = await Promise.all([fixture("adversarial-secret.sql"), safePolicy()]);
  assert.throws(() => sanitizeSql(sql, policy), /prohibited URL/);
});

test("psql meta-commands fail closed", async () => {
  const sql = await fixture("adversarial-psql.sql");
  assert.throws(() => lexSql(sql), /psql meta-commands are prohibited/);
});

test("routine bodies require an exact reviewed statement fingerprint", async () => {
  const sql = await fixture("adversarial-routine.sql");
  const policy = await safePolicy();
  assert.throws(() => sanitizeSql(sql, policy), /routine statement is not reviewed/);
  const [statement] = lexSql(sql).statements;
  policy.reviewedRoutineStatementSha256.push(sha256(statement));
  assert.equal(sanitizeSql(sql, policy).statementCount, 1);
  assert.throws(() => sanitizeSql(sql.replace("count(*)", "count(id)"), policy), /routine statement is not reviewed/);
});

test("every non-routine string literal requires an exact reviewed value fingerprint", async () => {
  const sql = "CREATE TABLE public.states (status text DEFAULT 'ready');";
  const policy = await safePolicy();
  assert.throws(() => sanitizeSql(sql, policy), /string literal is not reviewed/);
  policy.allowedLiteralSha256.push(sha256("ready"));
  assert.equal(sanitizeSql(sql, policy).statementCount, 1);
});

test("manifest binds schema bytes, digest, approved engine, and public-safety assertions", async () => {
  const artifact = await safeArtifact();
  const manifest = validateArtifactShape(artifact, { now: NOW });
  assert.equal(manifest.postgres.image, POSTGRES_IMAGE);
  assert.equal(manifest.sanitizer.policyPath, POLICY_PATH);
  assert.equal(manifest.schema.sha256, sha256(artifact.schema));
  assert.equal(manifest.publicSafety.safeForPublicDisclosure, true);
});

test("schema tampering fails verification", async () => {
  const artifact = await safeArtifact();
  artifact.schema += "\nCREATE TABLE public.tampered (id bigint);\n";
  assert.throws(() => validateArtifactShape(artifact, { now: NOW }), /byte count does not match/);
});

test("expired and over-retained baselines fail verification", async () => {
  const expired = await safeArtifact({ expiresAt: "2026-08-25T11:59:59Z" });
  assert.throws(() => validateArtifactShape(expired, { now: NOW }), /has expired/);
  await assert.rejects(async () => safeArtifact({ expiresAt: "2026-09-08T12:00:01Z" }), /retention exceeds 14 days/);
});

test("wrong PostgreSQL image fails verification", async () => {
  const artifact = await safeArtifact();
  artifact.manifest.postgres.image = "supabase/postgres:17";
  assert.throws(() => validateArtifactShape(artifact, { now: NOW }), /immutable digest/);
});

test("base-main compatibility requires ancestry and an unchanged migrations tree", async () => {
  const manifest = (await safeArtifact()).manifest;
  assert.deepEqual(verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: passingGitRunner }), {
    sourceCommit: SOURCE_COMMIT,
    baseMainSha: BASE_MAIN_SHA,
    migrationsTreeOid: TREE_OID,
  });
  assert.throws(() => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: () => ({ status: 1, stdout: "", stderr: "" }) }), /not an ancestor/);
  let revParseCalls = 0;
  const staleTree = (args) => {
    if (args[0] === "merge-base") return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "show") return { status: 0, stdout: POLICY_TEXT, stderr: "" };
    revParseCalls += 1;
    return { status: 0, stdout: `${revParseCalls === 1 ? TREE_OID : "4".repeat(40)}\n`, stderr: "" };
  };
  assert.throws(() => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: staleTree }), /baseline is stale/);
});

test("base-main compatibility rejects a substituted or stale public-safety policy", async () => {
  const manifest = (await safeArtifact()).manifest;
  const changedPolicyRunner = (args) => {
    if (args[0] === "merge-base") return { status: 0, stdout: "", stderr: "" };
    if (args[0] === "rev-parse") return { status: 0, stdout: `${TREE_OID}\n`, stderr: "" };
    return { status: 0, stdout: `${JSON.stringify({ contractVersion: 1, allowedLiteralSha256: ["a".repeat(64)], reviewedRoutineStatementSha256: [] })}\n`, stderr: "" };
  };
  assert.throws(() => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: changedPolicyRunner }), /policy digest does not match/);
});

test("attestation contract pins repository, signer workflow, main ref, source digest, and SLSA predicate", async () => {
  const artifact = await safeArtifact();
  const args = buildAttestationVerificationArgs("trusted-migration-baseline.json", artifact.manifest);
  assert.deepEqual(args, [
    "attestation", "verify", "trusted-migration-baseline.json",
    "--repo", "mrmogulmaker-bot/Paige-Agent-AI",
    "--signer-workflow", SIGNER_WORKFLOW,
    "--source-ref", "refs/heads/main",
    "--source-digest", SOURCE_COMMIT,
    "--predicate-type", "https://slsa.dev/provenance/v1",
    "--deny-self-hosted-runners",
    "--format", "json",
  ]);
});

test("end-to-end consumer verification fails on missing attestation and succeeds only with every phase", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paige-baseline-"));
  const path = join(directory, "trusted-migration-baseline.json");
  await writeFile(path, `${JSON.stringify(await safeArtifact())}\n`);
  await assert.rejects(() => verifyBaselineArtifact({
    artifactPath: path, baseMainSha: BASE_MAIN_SHA, now: NOW, env: {}, gitRunner: passingGitRunner,
    attestationVerifier: async () => [],
  }), /no verified attestations/);
  const verdict = await verifyBaselineArtifact({
    artifactPath: path, baseMainSha: BASE_MAIN_SHA, now: NOW, env: {}, gitRunner: passingGitRunner,
    attestationVerifier: async (_path, _manifest, args) => {
      assert.equal(args[0], "attestation");
      return [{ verificationResult: { statement: { predicateType: "https://slsa.dev/provenance/v1" } } }];
    },
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.verifiedAttestations, 1);
});

test("consumer verifier refuses production credential environments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paige-baseline-env-"));
  const path = join(directory, "trusted-migration-baseline.json");
  await writeFile(path, `${JSON.stringify(await safeArtifact())}\n`);
  for (const name of PRODUCTION_CREDENTIAL_ENV_NAMES) {
    await assert.rejects(() => verifyBaselineArtifact({
      artifactPath: path, baseMainSha: BASE_MAIN_SHA, now: NOW, env: { [name]: "not-a-real-value" }, gitRunner: passingGitRunner,
      attestationVerifier: async () => [{}],
    }), new RegExp(name));
  }
});

test("the tooling workflow is offline and cannot request repository or environment secrets", async () => {
  const workflow = await readFile(new URL("../../workflows/trusted-baseline-tooling.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /^\s*environment\s*:/m);
  assert.doesNotMatch(workflow, /SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|PROJECT_ID)/);
  assert.doesNotMatch(workflow, /supabase\s+(?:link|db\s+dump|db\s+push)/i);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
});
