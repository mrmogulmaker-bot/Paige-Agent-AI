import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DISPOSABLE_DATABASE_ENV_NAMES,
  GENERATOR_IMPLEMENTATION_PATH,
  GENERATOR_WORKFLOW_PATH,
  POSTGRES_IMAGE,
  POLICY_PATH,
  PRODUCTION_CREDENTIAL_ENV_NAMES,
  SANITIZER_TOOLING_PATH,
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
const TOOLING_TREE_OID = "5".repeat(40);
const GENERATED_AT = "2026-08-24T12:00:00Z";
const EXPIRES_AT = "2026-09-07T12:00:00Z";
const NOW = Date.parse("2026-08-25T12:00:00Z");
const APPROVED_ACTION_USES = new Set([
  "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
]);
const APPROVED_NODE_VERSION = "24.19.0";
const EXPECTED_PRODUCTION_CREDENTIAL_ENV_NAMES = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_TOKEN",
  "SUPA_TOKEN",
  "SUPA_ACCESS_TOKEN",
  "SB_ACCESS_TOKEN",
  "SUPABASE_PAT",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_POOLER_URL",
  "SUPABASE_CONNECTION_STRING",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SECRET_KEYS",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_PROJECT_REF",
  "DATABASE_URL",
  "DIRECT_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL_NON_POOLING",
];

function validateWorkflowSupplyChain(workflow) {
  const uses = [...workflow.matchAll(/^\s*-\s+uses:\s+([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1]);
  assert.ok(uses.length > 0, "workflow must contain approved action references");
  for (const reference of uses) {
    assert.match(reference, /^[^@\s]+@[a-f0-9]{40}$/, `action must use a full immutable commit SHA: ${reference}`);
    assert.ok(APPROVED_ACTION_USES.has(reference), `unapproved workflow action: ${reference}`);
  }
  assert.equal(uses.length, APPROVED_ACTION_USES.size, "workflow must use every approved action exactly once");
  assert.equal(new Set(uses).size, uses.length, "workflow action references must not be duplicated");

  const nodeVersions = [...workflow.matchAll(/^\s*node-version:\s*["']?([^"'#\s]+)["']?(?:\s+#.*)?$/gm)]
    .map((match) => match[1]);
  assert.deepEqual(nodeVersions, [APPROVED_NODE_VERSION], "workflow must pin the approved Node patch exactly once");
  assert.match(nodeVersions[0], /^\d+\.\d+\.\d+$/, "Node must be an exact patch version");
}

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
    sanitizerToolingTreeOid: TOOLING_TREE_OID,
    generatorWorkflowBlobOid: null,
    generatorImplementationTreeOid: null,
    generatedAt: GENERATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  });
}

const POLICY_TEXT = `${JSON.stringify({ contractVersion: 2, allowedLiteralSha256: [], reviewedRoutineStatementSha256: [] }, null, 2)}\n`;

function passingGitRunner(args) {
  if (args[0] === "merge-base") return { status: 0, stdout: "", stderr: "" };
  if (args[0] === "ls-tree") return { status: 0, stdout: "", stderr: "" };
  if (args[0] === "rev-parse") {
    const spec = args[1];
    if (spec.endsWith(":supabase/migrations")) return { status: 0, stdout: `${TREE_OID}\n`, stderr: "" };
    if (spec.endsWith(`:${SANITIZER_TOOLING_PATH}`)) return { status: 0, stdout: `${TOOLING_TREE_OID}\n`, stderr: "" };
    if (spec.endsWith(`:${GENERATOR_WORKFLOW_PATH}`) || spec.endsWith(`:${GENERATOR_IMPLEMENTATION_PATH}`)) {
      return { status: 128, stdout: "", stderr: "path does not exist" };
    }
  }
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

test("manifest binds schema, engine, public-safety policy, sanitizer tooling, and absent generator", async () => {
  const artifact = await safeArtifact();
  const manifest = validateArtifactShape(artifact, { now: NOW });
  assert.equal(manifest.postgres.image, POSTGRES_IMAGE);
  assert.equal(manifest.sanitizer.policyPath, POLICY_PATH);
  assert.deepEqual(manifest.securityTooling, {
    sanitizer: { path: SANITIZER_TOOLING_PATH, treeOid: TOOLING_TREE_OID },
    generator: {
      workflowPath: GENERATOR_WORKFLOW_PATH,
      workflowBlobOid: null,
      implementationPath: GENERATOR_IMPLEMENTATION_PATH,
      implementationTreeOid: null,
    },
  });
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
    sanitizerToolingTreeOid: TOOLING_TREE_OID,
    generatorWorkflowBlobOid: null,
    generatorImplementationTreeOid: null,
  });
  assert.throws(() => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: () => ({ status: 1, stdout: "", stderr: "" }) }), /not an ancestor/);
  const staleTree = (args) => {
    if (args[0] === "rev-parse" && args[1] === `${BASE_MAIN_SHA}:supabase/migrations`) {
      return { status: 0, stdout: `${"4".repeat(40)}\n`, stderr: "" };
    }
    return passingGitRunner(args);
  };
  assert.throws(() => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: staleTree }), /baseline is stale/);
});

test("base-main compatibility rejects a substituted or stale public-safety policy", async () => {
  const manifest = (await safeArtifact()).manifest;
  const changedPolicyRunner = (args) => {
    if (args[0] === "show") {
      return { status: 0, stdout: `${JSON.stringify({ contractVersion: 2, allowedLiteralSha256: ["a".repeat(64)], reviewedRoutineStatementSha256: [] })}\n`, stderr: "" };
    }
    return passingGitRunner(args);
  };
  assert.throws(() => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: changedPolicyRunner }), /policy digest does not match/);
});

test("unchanged migrations and policy cannot keep an old baseline valid after sanitizer tooling changes", async () => {
  const manifest = (await safeArtifact()).manifest;
  const changedToolingRunner = (args) => {
    if (args[0] === "rev-parse" && args[1] === `${BASE_MAIN_SHA}:${SANITIZER_TOOLING_PATH}`) {
      return { status: 0, stdout: `${"6".repeat(40)}\n`, stderr: "" };
    }
    return passingGitRunner(args);
  };
  assert.throws(
    () => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: changedToolingRunner }),
    /sanitizer tooling tree implementation differs/,
  );
});

test("an old absent-generator baseline is rejected when a generator appears on reviewed base main", async () => {
  const manifest = (await safeArtifact()).manifest;
  const introducedGeneratorRunner = (args) => {
    if (args[0] === "ls-tree" && args[2] === BASE_MAIN_SHA && args[4] === GENERATOR_WORKFLOW_PATH) {
      return { status: 0, stdout: `100644 blob ${"7".repeat(40)}\t${GENERATOR_WORKFLOW_PATH}\n`, stderr: "" };
    }
    return passingGitRunner(args);
  };
  assert.throws(
    () => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: introducedGeneratorRunner }),
    /generator workflow was absent at generation but now exists/,
  );
  const inconclusiveAbsenceRunner = (args) => {
    if (args[0] === "ls-tree") return { status: 128, stdout: "", stderr: "synthetic git failure" };
    return passingGitRunner(args);
  };
  assert.throws(
    () => verifyBaseMainCompatibility(manifest, BASE_MAIN_SHA, { gitRunner: inconclusiveAbsenceRunner }),
    /cannot prove source generator workflow is absent/,
  );
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
  assert.deepEqual([...PRODUCTION_CREDENTIAL_ENV_NAMES], EXPECTED_PRODUCTION_CREDENTIAL_ENV_NAMES);
  for (const name of EXPECTED_PRODUCTION_CREDENTIAL_ENV_NAMES) {
    await assert.rejects(() => verifyBaselineArtifact({
      artifactPath: path, baseMainSha: BASE_MAIN_SHA, now: NOW, env: { [name]: "not-a-real-value" }, gitRunner: passingGitRunner,
      attestationVerifier: async () => [{}],
    }), new RegExp(name));
  }
});

test("explicitly local disposable PostgreSQL variables remain usable while remote aliases fail closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paige-baseline-local-db-"));
  const path = join(directory, "trusted-migration-baseline.json");
  await writeFile(path, `${JSON.stringify(await safeArtifact())}\n`);
  const verify = (env) => verifyBaselineArtifact({
    artifactPath: path,
    baseMainSha: BASE_MAIN_SHA,
    now: NOW,
    env,
    gitRunner: passingGitRunner,
    attestationVerifier: async () => [{}],
  });

  const localPg = { PGHOST: "127.0.0.1", PGPORT: "5432", PGUSER: "postgres", PGPASSWORD: "local-only", PGDATABASE: "postgres" };
  assert.equal((await verify(localPg)).ok, true);
  assert.equal((await verify({ PAIGE_DISPOSABLE_DATABASE_URL: "postgresql://postgres:local-only@localhost:5432/postgres" })).ok, true);
  await assert.rejects(() => verify({ PGHOST: "db.production.example", PGPASSWORD: "not-a-real-value" }), /explicitly local/);
  await assert.rejects(
    () => verify({ PAIGE_DISPOSABLE_DATABASE_URL: "postgresql://user:not-a-real-value@db.production.example/postgres" }),
    /explicitly local/,
  );
  assert.ok(DISPOSABLE_DATABASE_ENV_NAMES.includes("PGPASSWORD"));
  assert.ok(DISPOSABLE_DATABASE_ENV_NAMES.includes("PAIGE_DISPOSABLE_DATABASE_URL"));
});

test("the tooling workflow is offline and cannot request repository or environment secrets", async () => {
  const workflow = await readFile(new URL("../../workflows/trusted-baseline-tooling.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /^\s*environment\s*:/m);
  for (const name of PRODUCTION_CREDENTIAL_ENV_NAMES) assert.doesNotMatch(workflow, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(workflow, /supabase\s+(?:link|db\s+dump|db\s+push)/i);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/);
});

test("the tooling workflow supply chain uses only approved immutable actions and an exact Node patch", async () => {
  const workflow = await readFile(new URL("../../workflows/trusted-baseline-tooling.yml", import.meta.url), "utf8");
  validateWorkflowSupplyChain(workflow);
  assert.throws(() => validateWorkflowSupplyChain(workflow.replace(/actions\/checkout@[a-f0-9]{40}/, "actions/checkout@v4")), /full immutable commit SHA/);
  assert.throws(() => validateWorkflowSupplyChain(workflow.replace('node-version: "24.19.0"', 'node-version: "24"')), /approved Node patch/);
  assert.throws(
    () => validateWorkflowSupplyChain(`${workflow}\n      - uses: example/unapproved@${"a".repeat(40)}\n`),
    /unapproved workflow action/,
  );
});
