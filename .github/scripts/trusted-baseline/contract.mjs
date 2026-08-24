import { createHash } from "node:crypto";

export const CONTRACT_VERSION = 2;
export const ARTIFACT_KIND = "paige.trusted-migration-baseline";
export const REPOSITORY = "mrmogulmaker-bot/Paige-Agent-AI";
export const SOURCE_REF = "refs/heads/main";
export const POLICY_PATH = ".github/migration-baseline/public-safety-policy.json";
export const SANITIZER_TOOLING_PATH = ".github/scripts/trusted-baseline";
export const GENERATOR_WORKFLOW_PATH = ".github/workflows/generate-trusted-migration-baseline.yml";
export const GENERATOR_IMPLEMENTATION_PATH = ".github/scripts/trusted-baseline-generator";
export const SIGNER_WORKFLOW = `${REPOSITORY}/${GENERATOR_WORKFLOW_PATH}`;
export const PREDICATE_TYPE = "https://slsa.dev/provenance/v1";
export const MAX_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const POSTGRES_IMAGE = "supabase/postgres:17.6.1.021@sha256:80f75ea6bfeaa18ffa0d5ede501b46ecd40f1f7b9c98e1fdc9e5c22cfe25c9b7";
export const POSTGRES_SERVER_VERSION = "17.6";
export const POSTGRES_SERVER_VERSION_NUM = 170006;

export const PUBLIC_SAFETY_ASSERTIONS = Object.freeze([
  "schema-only-no-row-data",
  "no-role-or-membership-ddl",
  "no-grants-or-acls",
  "no-comments",
  "no-psql-meta-commands",
  "no-connection-material",
  "no-secret-shaped-literals",
  "all-string-literals-reviewed",
  "all-routine-bodies-reviewed",
]);

export const PRODUCTION_CREDENTIAL_ENV_NAMES = Object.freeze([
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
]);

export const DISPOSABLE_DATABASE_ENV_NAMES = Object.freeze([
  "PAIGE_DISPOSABLE_DATABASE_URL",
  "PGHOST",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "POSTGRES_PASSWORD",
]);

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

export function assertSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

export function assertCommitSha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${label} must be a full lowercase git commit SHA`);
  }
}

export function assertTreeOid(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40,64}$/.test(value)) {
    throw new Error(`${label} must be a full git object ID`);
  }
}

export function parseTimestamp(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${label} is invalid`);
  return timestamp;
}

export function assertNoProductionCredentialEnvironment(env = process.env) {
  const present = PRODUCTION_CREDENTIAL_ENV_NAMES.filter((name) => Object.hasOwn(env, name));
  if (present.length > 0) {
    throw new Error(`trusted-baseline verification refuses production credential environment variables: ${present.join(", ")}`);
  }
}

function assertLocalDatabaseHost(host, label) {
  if (!LOCAL_DATABASE_HOSTS.has(host)) {
    throw new Error(`${label} must target an explicitly local disposable database host`);
  }
}

export function assertDisposableDatabaseEnvironment(env = process.env) {
  const urlValue = env.PAIGE_DISPOSABLE_DATABASE_URL;
  if (urlValue !== undefined) {
    let parsed;
    try { parsed = new URL(urlValue); } catch { throw new Error("PAIGE_DISPOSABLE_DATABASE_URL must be a valid URL"); }
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
      throw new Error("PAIGE_DISPOSABLE_DATABASE_URL must use postgres:// or postgresql://");
    }
    assertLocalDatabaseHost(parsed.hostname, "PAIGE_DISPOSABLE_DATABASE_URL");
  }

  const pgNamesPresent = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "POSTGRES_PASSWORD"]
    .filter((name) => Object.hasOwn(env, name));
  if (pgNamesPresent.length > 0) {
    if (!env.PGHOST) throw new Error(`local PostgreSQL variables require PGHOST: ${pgNamesPresent.join(", ")}`);
    assertLocalDatabaseHost(env.PGHOST, "PGHOST");
  }
}

export function validatePolicy(policy) {
  assertPlainObject(policy, "policy");
  const keys = Object.keys(policy).sort();
  const expected = ["allowedLiteralSha256", "contractVersion", "reviewedRoutineStatementSha256"].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) throw new Error(`policy keys must be exactly ${expected.join(", ")}`);
  if (policy.contractVersion !== CONTRACT_VERSION) throw new Error(`policy.contractVersion must equal ${CONTRACT_VERSION}`);
  for (const field of ["allowedLiteralSha256", "reviewedRoutineStatementSha256"]) {
    if (!Array.isArray(policy[field])) throw new Error(`policy.${field} must be an array`);
    const unique = new Set(policy[field]);
    if (unique.size !== policy[field].length) throw new Error(`policy.${field} contains duplicates`);
    for (const [index, digest] of policy[field].entries()) assertSha256(digest, `policy.${field}[${index}]`);
  }
  return policy;
}
