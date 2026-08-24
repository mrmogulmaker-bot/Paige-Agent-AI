#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PHASES = [
  "environment_restoration",
  "candidate_identification",
  "candidate_application",
  "behavioral_verification",
];

const MIGRATION_PATTERN = /^supabase\/migrations\/([0-9]{14})_[^/]+\.sql$/;
const PROOF_PATTERN = /^supabase\/tests\/.+\.sql$/;
const FIXTURE_MIGRATION_PATTERN = /^\.github\/scripts\/fixtures\/migration-proof\/migrations\/([0-9]{14})_[^/]+\.sql$/;
const FIXTURE_PROOF_PATTERN = /^\.github\/scripts\/fixtures\/migration-proof\/proof\.sql$/;

export class ProofFailure extends Error {
  constructor(phase, message) {
    super(`${phase}: ${message}`);
    this.name = "ProofFailure";
    this.phase = phase;
  }
}

function normalizeRepoPath(path) {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

export function readPathList(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map(normalizeRepoPath)
    .filter(Boolean);
}

export function selectCandidates(paths, { fixtureMode = false } = {}) {
  const pattern = fixtureMode ? FIXTURE_MIGRATION_PATTERN : MIGRATION_PATTERN;
  const normalized = paths.map(normalizeRepoPath).filter(Boolean);
  if (normalized.length === 0) {
    throw new ProofFailure("candidate_identification", "at least one candidate migration is required; found 0");
  }
  const invalid = normalized.filter((path) => !pattern.test(path));
  if (invalid.length > 0) {
    throw new ProofFailure(
      "candidate_identification",
      `candidate paths are invalid or outside the migration directory: ${invalid.join(", ")}`,
    );
  }
  const candidates = normalized.map((path) => ({ path, version: path.match(pattern)[1] }));
  const duplicatePaths = candidates.filter(({ path }, index) => candidates.findIndex((item) => item.path === path) !== index);
  if (duplicatePaths.length > 0) {
    throw new ProofFailure("candidate_identification", `duplicate candidate path(s): ${duplicatePaths.map(({ path }) => path).join(", ")}`);
  }
  const duplicateVersions = candidates.filter(({ version }, index) => candidates.findIndex((item) => item.version === version) !== index);
  if (duplicateVersions.length > 0) {
    throw new ProofFailure(
      "candidate_identification",
      `duplicate migration version(s): ${[...new Set(duplicateVersions.map(({ version }) => version))].join(", ")}`,
    );
  }
  return candidates.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function selectProofs(paths, { fixtureMode = false } = {}) {
  const pattern = fixtureMode ? FIXTURE_PROOF_PATTERN : PROOF_PATTERN;
  const proofs = paths.map(normalizeRepoPath).filter((path) => pattern.test(path)).sort();
  if (proofs.length === 0) {
    throw new ProofFailure(
      "candidate_identification",
      "at least one changed SQL behavioral proof under supabase/tests is required",
    );
  }
  return proofs;
}

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function createState() {
  return {
    verdict: "inconclusive",
    phases: Object.fromEntries(PHASES.map((phase) => [phase, { status: "pending" }])),
    candidates: [],
    appliedCandidates: [],
    proofs: [],
    schemaSnapshot: null,
  };
}

export function markPhase(state, phase, status, detail = undefined) {
  if (!PHASES.includes(phase)) throw new Error(`unknown proof phase: ${phase}`);
  state.phases[phase] = detail ? { status, detail } : { status };
}

export function finalVerdict(state) {
  const incomplete = PHASES.filter((phase) => state.phases[phase]?.status !== "passed");
  if (incomplete.length > 0) {
    state.verdict = "failed";
    throw new ProofFailure("final_verdict", `proof is not complete; non-passing phases: ${incomplete.join(", ")}`);
  }
  if (state.candidates.length === 0 || state.appliedCandidates.length !== state.candidates.length) {
    state.verdict = "failed";
    throw new ProofFailure("final_verdict", "candidate application evidence is missing or incomplete");
  }
  for (let index = 0; index < state.candidates.length; index += 1) {
    const candidate = state.candidates[index];
    const applied = state.appliedCandidates[index];
    if (candidate.path !== applied?.path || candidate.sha256 !== applied?.sha256) {
      state.verdict = "failed";
      throw new ProofFailure("final_verdict", `applied migration ${index + 1} does not match the identified PR candidate`);
    }
  }
  if (!state.schemaSnapshot || state.schemaSnapshot.bytes <= 0 || !state.schemaSnapshot.sha256) {
    state.verdict = "failed";
    throw new ProofFailure("final_verdict", "post-application schema evidence is missing or empty");
  }
  if (state.proofs.length === 0 || state.proofs.some((proof) => proof.status !== "passed")) {
    state.verdict = "failed";
    throw new ProofFailure("final_verdict", "behavioral proof evidence is missing or failed");
  }
  state.verdict = "passed";
  return state;
}

function ensureInside(root, path, label, phase = "candidate_identification") {
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(root, path);
  const rel = relative(absoluteRoot, absolutePath);
  if (rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new ProofFailure(phase, `${label} escapes the repository root: ${path}`);
  }
  if (!existsSync(absolutePath)) {
    throw new ProofFailure(phase, `${label} does not exist: ${path}`);
  }
  return absolutePath;
}

export function assertCompatibilityShimConfined(root, shimPath) {
  const normalized = normalizeRepoPath(shimPath);
  if (!normalized.startsWith(".github/scripts/fixtures/migration-proof/") || normalized.startsWith("supabase/migrations/")) {
    throw new ProofFailure(
      "environment_restoration",
      "the auth compatibility shim must live only under .github/scripts/fixtures/migration-proof",
    );
  }
  return ensureInside(root, normalized, "compatibility shim");
}

export function assertDisposableDatabaseTarget(env = process.env) {
  const host = env.PGHOST;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new ProofFailure(
      "environment_restoration",
      `database execution must target the disposable local service; refusing PGHOST=${host ?? "<unset>"}`,
    );
  }
}

function group(name, logger) {
  logger(`::group::${name}`);
  return () => logger("::endgroup::");
}

export function createProcessAdapter({ env = process.env, logger = console.log } = {}) {
  assertDisposableDatabaseTarget(env);
  const run = (command, args, options = {}) =>
    new Promise((resolvePromise, rejectPromise) => {
      logger(`$ ${command} ${args.join(" ")}`);
      const child = spawn(command, args, {
        cwd: options.cwd,
        env,
        stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk) => { stdout += chunk; });
      child.stderr?.on("data", (chunk) => { stderr += chunk; });
      child.on("error", rejectPromise);
      child.on("close", (code) => {
        if (code === 0) resolvePromise({ stdout, stderr });
        else rejectPromise(new Error(`${command} exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
      });
    });

  return {
    async psqlFile(path, cwd) {
      await run("psql", ["-X", "--set", "ON_ERROR_STOP=1", "--file", path], { cwd });
    },
    async psqlCommand(sql, cwd) {
      await run("psql", ["-X", "--set", "ON_ERROR_STOP=1", "--command", sql], { cwd });
    },
    async schemaSnapshot(path, cwd) {
      const { stdout } = await run(
        "pg_dump",
        ["--schema-only", "--no-owner", "--no-privileges", env.PGDATABASE ?? "postgres"],
        { cwd, capture: true },
      );
      writeFileSync(path, stdout, "utf8");
    },
  };
}

export async function runProof({
  root,
  candidatePaths,
  proofPaths,
  baselineRoles,
  baselineSchema,
  compatibilityShim,
  schemaSnapshot,
  statePath,
  fixtureMode = false,
  adapter = createProcessAdapter(),
  logger = console.log,
}) {
  const state = createState();
  let primaryFailure = null;

  const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  const fail = (phase, error) => {
    const message = error instanceof Error ? error.message : String(error);
    markPhase(state, phase, "failed", message);
    primaryFailure ??= new ProofFailure(phase, message);
    logger(`::error title=${phase.replaceAll("_", " ")}::${message}`);
  };

  try {
    const end = group("1/5 environment restoration", logger);
    try {
      const shim = assertCompatibilityShimConfined(root, compatibilityShim);
      const roles = ensureInside(root, baselineRoles, "baseline roles dump");
      const schema = ensureInside(root, baselineSchema, "baseline schema dump");
      await adapter.psqlFile(roles, root);
      await adapter.psqlFile(shim, root);
      await adapter.psqlFile(schema, root);
      await adapter.psqlCommand('ALTER DATABASE postgres SET search_path TO "$user", public, extensions;', root);
      markPhase(state, "environment_restoration", "passed", "representative baseline restored");
    } catch (error) {
      fail("environment_restoration", error);
    } finally {
      end();
    }

    if (!primaryFailure) {
      const end = group("2/5 candidate identification", logger);
      try {
        const selected = selectCandidates(candidatePaths, { fixtureMode });
        const proofs = selectProofs(proofPaths, { fixtureMode });
        for (const candidate of selected) {
          const absolute = ensureInside(root, candidate.path, "candidate migration");
          state.candidates.push({ path: candidate.path, version: candidate.version, sha256: sha256(absolute) });
        }
        for (const proof of proofs) ensureInside(root, proof, "behavioral proof");
        state.proofs = proofs.map((path) => ({ path, status: "pending" }));
        markPhase(
          state,
          "candidate_identification",
          "passed",
          `${state.candidates.length} ordered candidate(s): ${state.candidates.map(({ path, sha256: hash }) => `${path} sha256=${hash}`).join("; ")}`,
        );
      } catch (error) {
        fail("candidate_identification", error);
      } finally {
        end();
      }
    }

    if (!primaryFailure) {
      const end = group("3/5 candidate application", logger);
      try {
        for (const identified of state.candidates) {
          const candidate = ensureInside(root, identified.path, "candidate migration");
          const before = sha256(candidate);
          if (before !== identified.sha256) throw new Error(`candidate changed after identification: ${identified.path}`);
          await adapter.psqlFile(candidate, root);
          const after = sha256(candidate);
          if (after !== before) throw new Error(`candidate changed during application: ${identified.path}`);
          state.appliedCandidates.push({ path: identified.path, version: identified.version, sha256: after });
        }
        const snapshotPath = resolve(root, schemaSnapshot);
        await adapter.schemaSnapshot(snapshotPath, root);
        const snapshot = ensureInside(root, schemaSnapshot, "post-application schema snapshot", "candidate_application");
        state.schemaSnapshot = { path: normalizeRepoPath(schemaSnapshot), bytes: statSync(snapshot).size, sha256: sha256(snapshot) };
        markPhase(
          state,
          "candidate_application",
          "passed",
          `applied ${state.appliedCandidates.length} exact fingerprint(s) in version/name order`,
        );
      } catch (error) {
        fail("candidate_application", error);
      } finally {
        end();
      }
    }

    if (!primaryFailure) {
      const end = group("4/5 behavioral verification", logger);
      try {
        for (const proof of state.proofs) {
          await adapter.psqlFile(ensureInside(root, proof.path, "behavioral proof"), root);
          proof.status = "passed";
        }
        markPhase(state, "behavioral_verification", "passed", `${state.proofs.length} SQL proof file(s) passed`);
      } catch (error) {
        fail("behavioral_verification", error);
      } finally {
        end();
      }
    }
  } finally {
    const end = group("5/5 final verdict", logger);
    try {
      finalVerdict(state);
      logger(`MIGRATION_PROOF_PASSED candidates=${state.candidates.map(({ path, sha256: hash }) => `${path}@${hash}`).join(",")}`);
    } catch (error) {
      primaryFailure ??= error;
      logger(`MIGRATION_PROOF_FAILED ${error.message}`);
    } finally {
      save();
      end();
    }
  }

  if (primaryFailure) throw primaryFailure;
  return state;
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`unexpected argument: ${key}`);
    if (key === "--fixture-mode") args.set(key, true);
    else args.set(key, argv[++index]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(args.get("--root") ?? process.cwd());
  const required = (key) => {
    const value = args.get(key);
    if (!value) throw new Error(`missing required argument ${key}`);
    return value;
  };
  if (args.has("--assert-state")) {
    const statePath = resolve(root, required("--assert-state"));
    if (!existsSync(statePath)) {
      throw new ProofFailure("final_verdict", `proof state is missing: ${statePath}`);
    }
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    finalVerdict(state);
    console.log(`MIGRATION_PROOF_PASSED candidates=${state.candidates.map(({ path, sha256: hash }) => `${path}@${hash}`).join(",")}`);
    return;
  }
  await runProof({
    root,
    candidatePaths: readPathList(resolve(root, required("--candidate-list"))),
    proofPaths: readPathList(resolve(root, required("--proof-list"))),
    baselineRoles: required("--baseline-roles"),
    baselineSchema: required("--baseline-schema"),
    compatibilityShim: required("--compatibility-shim"),
    schemaSnapshot: required("--schema-snapshot"),
    statePath: resolve(root, required("--state")),
    fixtureMode: Boolean(args.get("--fixture-mode")),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
