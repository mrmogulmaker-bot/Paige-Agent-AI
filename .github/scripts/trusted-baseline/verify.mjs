#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_KIND,
  CONTRACT_VERSION,
  MAX_RETENTION_MS,
  POLICY_PATH,
  POSTGRES_IMAGE,
  POSTGRES_SERVER_VERSION,
  POSTGRES_SERVER_VERSION_NUM,
  PREDICATE_TYPE,
  PUBLIC_SAFETY_ASSERTIONS,
  REPOSITORY,
  SIGNER_WORKFLOW,
  SOURCE_REF,
  assertCommitSha,
  assertNoProductionCredentialEnvironment,
  assertPlainObject,
  assertSha256,
  assertTreeOid,
  parseTimestamp,
  sha256,
  stableJson,
  validatePolicy,
} from "./contract.mjs";

function assertExactKeys(object, expected, label) {
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}`);
  }
}

export function validateArtifactShape(artifact, { now = Date.now() } = {}) {
  assertPlainObject(artifact, "artifact");
  assertExactKeys(artifact, ["manifest", "schema"], "artifact");
  if (typeof artifact.schema !== "string" || artifact.schema.length === 0) throw new Error("artifact.schema must be non-empty text");

  const manifest = artifact.manifest;
  assertPlainObject(manifest, "manifest");
  assertExactKeys(manifest, ["contractVersion", "kind", "generatedAt", "expiresAt", "source", "postgres", "sanitizer", "publicSafety", "schema"], "manifest");
  if (manifest.contractVersion !== CONTRACT_VERSION) throw new Error(`manifest.contractVersion must equal ${CONTRACT_VERSION}`);
  if (manifest.kind !== ARTIFACT_KIND) throw new Error(`manifest.kind must equal ${ARTIFACT_KIND}`);

  const generatedMs = parseTimestamp(manifest.generatedAt, "manifest.generatedAt");
  const expiresMs = parseTimestamp(manifest.expiresAt, "manifest.expiresAt");
  if (generatedMs > now + 5 * 60 * 1000) throw new Error("baseline generatedAt is in the future");
  if (expiresMs <= now) throw new Error("baseline has expired");
  if (expiresMs <= generatedMs) throw new Error("baseline expiresAt must be after generatedAt");
  if (expiresMs - generatedMs > MAX_RETENTION_MS) throw new Error("baseline retention exceeds 14 days");

  assertPlainObject(manifest.source, "manifest.source");
  assertExactKeys(manifest.source, ["repository", "ref", "commit", "migrationsTreeOid"], "manifest.source");
  if (manifest.source.repository !== REPOSITORY) throw new Error(`baseline repository must be ${REPOSITORY}`);
  if (manifest.source.ref !== SOURCE_REF) throw new Error(`baseline source ref must be ${SOURCE_REF}`);
  assertCommitSha(manifest.source.commit, "manifest.source.commit");
  assertTreeOid(manifest.source.migrationsTreeOid, "manifest.source.migrationsTreeOid");

  assertPlainObject(manifest.postgres, "manifest.postgres");
  assertExactKeys(manifest.postgres, ["serverVersion", "serverVersionNum", "image"], "manifest.postgres");
  if (manifest.postgres.serverVersion !== POSTGRES_SERVER_VERSION || manifest.postgres.serverVersionNum !== POSTGRES_SERVER_VERSION_NUM) {
    throw new Error(`baseline PostgreSQL version must be ${POSTGRES_SERVER_VERSION} (${POSTGRES_SERVER_VERSION_NUM})`);
  }
  if (manifest.postgres.image !== POSTGRES_IMAGE) throw new Error("baseline PostgreSQL image pin does not match the approved immutable digest");

  assertPlainObject(manifest.sanitizer, "manifest.sanitizer");
  assertExactKeys(manifest.sanitizer, ["contractVersion", "policyPath", "policySha256", "commentsRemoved", "statementCount"], "manifest.sanitizer");
  if (manifest.sanitizer.contractVersion !== CONTRACT_VERSION) throw new Error("sanitizer contract version mismatch");
  if (manifest.sanitizer.policyPath !== POLICY_PATH) throw new Error(`sanitizer policy path must be ${POLICY_PATH}`);
  assertSha256(manifest.sanitizer.policySha256, "manifest.sanitizer.policySha256");
  if (!Number.isSafeInteger(manifest.sanitizer.commentsRemoved) || manifest.sanitizer.commentsRemoved < 0) throw new Error("commentsRemoved must be a non-negative integer");
  if (!Number.isSafeInteger(manifest.sanitizer.statementCount) || manifest.sanitizer.statementCount < 1) throw new Error("statementCount must be a positive integer");

  assertPlainObject(manifest.publicSafety, "manifest.publicSafety");
  assertExactKeys(manifest.publicSafety, ["safeForPublicDisclosure", "assertions"], "manifest.publicSafety");
  if (manifest.publicSafety.safeForPublicDisclosure !== true) throw new Error("baseline is not declared safe for public disclosure");
  if (JSON.stringify(manifest.publicSafety.assertions) !== JSON.stringify([...PUBLIC_SAFETY_ASSERTIONS])) {
    throw new Error("public-safety assertions are missing, reordered, or altered");
  }

  assertPlainObject(manifest.schema, "manifest.schema");
  assertExactKeys(manifest.schema, ["encoding", "bytes", "sha256"], "manifest.schema");
  if (manifest.schema.encoding !== "utf-8") throw new Error("schema encoding must be utf-8");
  if (!Number.isSafeInteger(manifest.schema.bytes) || manifest.schema.bytes < 1) throw new Error("schema bytes must be a positive integer");
  assertSha256(manifest.schema.sha256, "manifest.schema.sha256");
  if (Buffer.byteLength(artifact.schema, "utf8") !== manifest.schema.bytes) throw new Error("schema byte count does not match manifest");
  if (sha256(artifact.schema) !== manifest.schema.sha256) throw new Error("schema SHA-256 does not match manifest");
  return manifest;
}

function defaultGitRunner(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}

export function verifyBaseMainCompatibility(manifest, baseMainSha, { repoRoot = process.cwd(), gitRunner = defaultGitRunner } = {}) {
  assertCommitSha(baseMainSha, "baseMainSha");
  const ancestor = gitRunner(["merge-base", "--is-ancestor", manifest.source.commit, baseMainSha], repoRoot);
  if (ancestor.status !== 0) throw new Error("baseline source commit is not an ancestor of the PR base main SHA");

  const sourceTree = gitRunner(["rev-parse", `${manifest.source.commit}:supabase/migrations`], repoRoot);
  if (sourceTree.status !== 0) throw new Error(`cannot resolve baseline source migration tree: ${(sourceTree.stderr || "").trim()}`);
  if (sourceTree.stdout.trim() !== manifest.source.migrationsTreeOid) throw new Error("manifest migration tree does not match its source commit");

  const baseTree = gitRunner(["rev-parse", `${baseMainSha}:supabase/migrations`], repoRoot);
  if (baseTree.status !== 0) throw new Error(`cannot resolve base-main migration tree: ${(baseTree.stderr || "").trim()}`);
  if (baseTree.stdout.trim() !== manifest.source.migrationsTreeOid) {
    throw new Error("baseline is stale: supabase/migrations changed between generation and PR base main");
  }

  for (const [label, commit] of [["source", manifest.source.commit], ["base-main", baseMainSha]]) {
    const policyResult = gitRunner(["show", `${commit}:${POLICY_PATH}`], repoRoot);
    if (policyResult.status !== 0) throw new Error(`cannot resolve ${label} public-safety policy: ${(policyResult.stderr || "").trim()}`);
    let policy;
    try { policy = validatePolicy(JSON.parse(policyResult.stdout)); } catch (error) { throw new Error(`${label} public-safety policy is invalid: ${error.message}`); }
    if (sha256(stableJson(policy)) !== manifest.sanitizer.policySha256) {
      throw new Error(`baseline is stale or substituted: ${label} public-safety policy digest does not match manifest`);
    }
  }
  return { sourceCommit: manifest.source.commit, baseMainSha, migrationsTreeOid: manifest.source.migrationsTreeOid };
}

export function buildAttestationVerificationArgs(artifactPath, manifest) {
  return [
    "attestation", "verify", artifactPath,
    "--repo", REPOSITORY,
    "--signer-workflow", SIGNER_WORKFLOW,
    "--source-ref", SOURCE_REF,
    "--source-digest", manifest.source.commit,
    "--predicate-type", PREDICATE_TYPE,
    "--deny-self-hosted-runners",
    "--format", "json",
  ];
}

function defaultAttestationVerifier(artifactPath, manifest) {
  const result = spawnSync("gh", buildAttestationVerificationArgs(artifactPath, manifest), { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`GitHub attestation verification failed: ${(result.stderr || result.stdout || "no output").trim()}`);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error("GitHub attestation verifier did not return JSON"); }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("GitHub attestation verifier returned no verified attestations");
  return parsed;
}

export async function verifyBaselineArtifact({ artifactPath, baseMainSha, repoRoot = process.cwd(), now = Date.now(), env = process.env, gitRunner, attestationVerifier = defaultAttestationVerifier }) {
  assertNoProductionCredentialEnvironment(env);
  const text = await readFile(artifactPath, "utf8");
  let artifact;
  try { artifact = JSON.parse(text); } catch { throw new Error("baseline artifact is not valid JSON"); }
  const manifest = validateArtifactShape(artifact, { now });
  const compatibility = verifyBaseMainCompatibility(manifest, baseMainSha, { repoRoot, gitRunner });
  const attestations = await attestationVerifier(artifactPath, manifest, buildAttestationVerificationArgs(artifactPath, manifest));
  if (!Array.isArray(attestations) || attestations.length === 0) throw new Error("attestation verifier returned no verified attestations");
  return {
    ok: true,
    schemaSha256: manifest.schema.sha256,
    sourceCommit: manifest.source.commit,
    baseMainSha: compatibility.baseMainSha,
    migrationsTreeOid: compatibility.migrationsTreeOid,
    expiresAt: manifest.expiresAt,
    verifiedAttestations: attestations.length,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid argument near ${key ?? "<end>"}`);
    args[key.slice(2)] = value;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.artifact || !args["base-main-sha"]) throw new Error("--artifact and --base-main-sha are required");
  const verdict = await verifyBaselineArtifact({ artifactPath: args.artifact, baseMainSha: args["base-main-sha"], repoRoot: args["repo-root"] ?? process.cwd() });
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`trusted-baseline verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
