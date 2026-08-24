#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_KIND,
  CONTRACT_VERSION,
  GENERATOR_IMPLEMENTATION_PATH,
  GENERATOR_WORKFLOW_PATH,
  MAX_RETENTION_MS,
  POLICY_PATH,
  POSTGRES_IMAGE,
  POSTGRES_SERVER_VERSION,
  POSTGRES_SERVER_VERSION_NUM,
  PUBLIC_SAFETY_ASSERTIONS,
  REPOSITORY,
  SANITIZER_TOOLING_PATH,
  SOURCE_REF,
  assertCommitSha,
  assertSha256,
  assertTreeOid,
  parseTimestamp,
  sha256,
  stableJson,
  validatePolicy,
} from "./contract.mjs";

const MAX_INPUT_BYTES = 32 * 1024 * 1024;

const DENIED_STATEMENT_PREFIXES = [
  "INSERT", "UPDATE", "DELETE", "MERGE", "COPY", "CALL", "DO", "GRANT", "REVOKE",
  "CREATE ROLE", "ALTER ROLE", "DROP ROLE", "CREATE USER", "ALTER USER", "DROP USER",
  "CREATE DATABASE", "ALTER DATABASE", "DROP DATABASE", "COMMENT", "SECURITY LABEL",
  "CREATE SERVER", "ALTER SERVER", "CREATE USER MAPPING", "ALTER USER MAPPING",
  "CREATE SUBSCRIPTION", "ALTER SUBSCRIPTION", "CREATE PUBLICATION", "ALTER PUBLICATION",
  "TRUNCATE", "VACUUM", "ANALYZE", "CLUSTER", "REFRESH MATERIALIZED VIEW", "SELECT",
];

const ALLOWED_STATEMENT_PREFIXES = [
  "CREATE SCHEMA", "CREATE TYPE", "ALTER TYPE", "CREATE DOMAIN", "ALTER DOMAIN",
  "CREATE TABLE", "ALTER TABLE", "CREATE SEQUENCE", "ALTER SEQUENCE",
  "CREATE INDEX", "CREATE UNIQUE INDEX", "CREATE VIEW", "CREATE MATERIALIZED VIEW",
  "ALTER MATERIALIZED VIEW", "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION",
  "CREATE PROCEDURE", "CREATE OR REPLACE PROCEDURE", "CREATE TRIGGER",
  "CREATE POLICY", "ALTER POLICY", "CREATE EXTENSION", "ALTER EXTENSION",
  "CREATE COLLATION", "CREATE AGGREGATE", "CREATE OPERATOR", "ALTER OPERATOR",
  "CREATE CAST", "CREATE TEXT SEARCH", "ALTER TEXT SEARCH",
];

const ROUTINE_PREFIXES = ["CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", "CREATE PROCEDURE", "CREATE OR REPLACE PROCEDURE"];

const SECRET_PATTERNS = [
  ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["URL", /\b(?:https?|postgres(?:ql)?|redis|amqp|mysql):\/\//i],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/i],
  ["JWT", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/],
  ["credential prefix", /\b(?:sb_secret_|sk-(?:live|test|proj)-|AKIA|ASIA)[A-Za-z0-9_-]{8,}\b/i],
  ["UUID literal", /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i],
  ["IPv4 address", /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
  ["high-entropy value", /\b[A-Za-z0-9_+\/=.-]{40,}\b/],
];

function decodeSingleQuoted(raw) {
  const prefixLength = /^[eE]'/.test(raw) ? 2 : 1;
  const body = raw.slice(prefixLength, -1).replace(/''/g, "'");
  return prefixLength === 2 ? body.replace(/\\(['\\])/g, "$1") : body;
}

function scanSensitive(value, label) {
  for (const [kind, pattern] of SECRET_PATTERNS) {
    if (pattern.test(value)) throw new Error(`${label} contains a prohibited ${kind}`);
  }
}

export function lexSql(input) {
  if (typeof input !== "string") throw new Error("SQL input must be text");
  if (Buffer.byteLength(input, "utf8") > MAX_INPUT_BYTES) throw new Error(`SQL input exceeds ${MAX_INPUT_BYTES} bytes`);
  if (input.includes("\0")) throw new Error("SQL input contains a NUL byte");

  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const statements = [];
  let current = "";
  let commentsRemoved = 0;
  let index = 0;
  let lineStart = true;

  const append = (value) => {
    current += value;
    if (value.length > 0) lineStart = value.endsWith("\n");
  };

  while (index < normalized.length) {
    const rest = normalized.slice(index);
    if (lineStart && /^\s*\\/.test(rest.split("\n", 1)[0])) {
      throw new Error("psql meta-commands are prohibited");
    }

    if (rest.startsWith("--")) {
      const end = normalized.indexOf("\n", index + 2);
      commentsRemoved += 1;
      if (end === -1) { index = normalized.length; break; }
      append("\n");
      index = end + 1;
      continue;
    }

    if (rest.startsWith("/*")) {
      let depth = 1;
      let cursor = index + 2;
      while (cursor < normalized.length && depth > 0) {
        if (normalized.startsWith("/*", cursor)) { depth += 1; cursor += 2; continue; }
        if (normalized.startsWith("*/", cursor)) { depth -= 1; cursor += 2; continue; }
        cursor += 1;
      }
      if (depth !== 0) throw new Error("unterminated block comment");
      commentsRemoved += 1;
      append(" ");
      index = cursor;
      continue;
    }

    const dollarMatch = rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dollarMatch) {
      const delimiter = dollarMatch[0];
      const end = normalized.indexOf(delimiter, index + delimiter.length);
      if (end === -1) throw new Error(`unterminated dollar quote ${delimiter}`);
      const raw = normalized.slice(index, end + delimiter.length);
      append(raw);
      index = end + delimiter.length;
      continue;
    }

    const char = normalized[index];
    const isEscapeString = char === "'" && /[eE]/.test(normalized[index - 1] ?? "") && !/[A-Za-z0-9_$]/.test(normalized[index - 2] ?? "");
    if (char === "'") {
      let cursor = index + 1;
      while (cursor < normalized.length) {
        if (isEscapeString && normalized[cursor] === "\\") { cursor += 2; continue; }
        if (normalized[cursor] === "'" && normalized[cursor + 1] === "'") { cursor += 2; continue; }
        if (normalized[cursor] === "'") { cursor += 1; break; }
        cursor += 1;
      }
      if (normalized[cursor - 1] !== "'") throw new Error("unterminated string literal");
      append(normalized.slice(index, cursor));
      index = cursor;
      continue;
    }

    if (char === '"') {
      let cursor = index + 1;
      while (cursor < normalized.length) {
        if (normalized[cursor] === '"' && normalized[cursor + 1] === '"') { cursor += 2; continue; }
        if (normalized[cursor] === '"') { cursor += 1; break; }
        cursor += 1;
      }
      if (normalized[cursor - 1] !== '"') throw new Error("unterminated quoted identifier");
      const identifier = normalized.slice(index + 1, cursor - 1).replace(/""/g, '"');
      scanSensitive(identifier, "quoted identifier");
      append(normalized.slice(index, cursor));
      index = cursor;
      continue;
    }

    append(char);
    index += 1;
    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      lineStart = true;
    }
  }

  if (current.trim()) throw new Error("every SQL statement must end with a semicolon");
  if (statements.length === 0) throw new Error("sanitized baseline contains no SQL statements");
  return { statements, commentsRemoved };
}

function normalizedPrefix(statement) {
  return statement.slice(0, 160).replace(/\s+/g, " ").trim().toUpperCase();
}

function extractLiteralTokens(statement) {
  const literals = [];
  let index = 0;
  while (index < statement.length) {
    const rest = statement.slice(index);
    const dollarMatch = rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dollarMatch) {
      const delimiter = dollarMatch[0];
      const end = statement.indexOf(delimiter, index + delimiter.length);
      if (end === -1) throw new Error(`unterminated dollar quote ${delimiter}`);
      literals.push({ kind: "dollar", value: statement.slice(index + delimiter.length, end) });
      index = end + delimiter.length;
      continue;
    }
    if (statement[index] === "'") {
      const startsEscape = /[eE]/.test(statement[index - 1] ?? "") && !/[A-Za-z0-9_$]/.test(statement[index - 2] ?? "");
      let cursor = index + 1;
      while (cursor < statement.length) {
        if (startsEscape && statement[cursor] === "\\") { cursor += 2; continue; }
        if (statement[cursor] === "'" && statement[cursor + 1] === "'") { cursor += 2; continue; }
        if (statement[cursor] === "'") { cursor += 1; break; }
        cursor += 1;
      }
      const raw = statement.slice(startsEscape ? index - 1 : index, cursor);
      literals.push({ kind: "single", value: decodeSingleQuoted(raw) });
      index = cursor;
      continue;
    }
    index += 1;
  }
  return literals;
}

export function sanitizeSql(input, policyInput) {
  const policy = validatePolicy(policyInput);
  const allowedLiterals = new Set(policy.allowedLiteralSha256);
  const reviewedRoutines = new Set(policy.reviewedRoutineStatementSha256);
  const { statements, commentsRemoved } = lexSql(input);
  const output = [];

  for (const statement of statements) {
    const prefix = normalizedPrefix(statement);
    if (DENIED_STATEMENT_PREFIXES.some((item) => prefix === item || prefix.startsWith(`${item} `))) {
      throw new Error(`prohibited SQL statement: ${prefix.slice(0, 72)}`);
    }
    if (!ALLOWED_STATEMENT_PREFIXES.some((item) => prefix === item || prefix.startsWith(`${item} `))) {
      throw new Error(`unrecognized SQL statement fails closed: ${prefix.slice(0, 72)}`);
    }
    if (/\bOWNER\s+TO\b/i.test(statement) || /\bSESSION\s+AUTHORIZATION\b/i.test(statement)) {
      throw new Error("owner and session-authorization statements are prohibited");
    }

    const routine = ROUTINE_PREFIXES.some((item) => prefix.startsWith(`${item} `));
    const statementDigest = sha256(statement);
    if (routine && !reviewedRoutines.has(statementDigest)) {
      throw new Error(`routine statement is not reviewed: sha256:${statementDigest}`);
    }

    for (const literal of extractLiteralTokens(statement)) {
      scanSensitive(literal.value, `${literal.kind} literal`);
      if (literal.kind === "dollar") {
        if (!routine) throw new Error("dollar-quoted text is allowed only in reviewed routines");
      } else {
        const digest = sha256(literal.value);
        if (!allowedLiterals.has(digest)) throw new Error(`string literal is not reviewed: sha256:${digest}`);
      }
    }
    output.push(statement);
  }

  const schema = `${output.join("\n\n")}\n`;
  return { schema, commentsRemoved, statementCount: output.length };
}

export function buildBaselineArtifact({
  sql,
  policy,
  sourceCommit,
  migrationsTreeOid,
  sanitizerToolingTreeOid,
  generatorWorkflowBlobOid,
  generatorImplementationTreeOid,
  generatedAt,
  expiresAt,
}) {
  assertCommitSha(sourceCommit, "sourceCommit");
  assertTreeOid(migrationsTreeOid, "migrationsTreeOid");
  assertTreeOid(sanitizerToolingTreeOid, "sanitizerToolingTreeOid");
  for (const [value, label] of [
    [generatorWorkflowBlobOid, "generatorWorkflowBlobOid"],
    [generatorImplementationTreeOid, "generatorImplementationTreeOid"],
  ]) {
    if (value !== null) assertTreeOid(value, label);
  }
  const generatedMs = parseTimestamp(generatedAt, "generatedAt");
  const expiresMs = parseTimestamp(expiresAt, "expiresAt");
  if (expiresMs <= generatedMs) throw new Error("expiresAt must be after generatedAt");
  if (expiresMs - generatedMs > MAX_RETENTION_MS) throw new Error("baseline retention exceeds 14 days");

  const validatedPolicy = validatePolicy(policy);
  const result = sanitizeSql(sql, validatedPolicy);
  const manifest = {
    contractVersion: CONTRACT_VERSION,
    kind: ARTIFACT_KIND,
    generatedAt,
    expiresAt,
    source: {
      repository: REPOSITORY,
      ref: SOURCE_REF,
      commit: sourceCommit,
      migrationsTreeOid,
    },
    postgres: {
      serverVersion: POSTGRES_SERVER_VERSION,
      serverVersionNum: POSTGRES_SERVER_VERSION_NUM,
      image: POSTGRES_IMAGE,
    },
    sanitizer: {
      contractVersion: CONTRACT_VERSION,
      policyPath: POLICY_PATH,
      policySha256: sha256(stableJson(validatedPolicy)),
      commentsRemoved: result.commentsRemoved,
      statementCount: result.statementCount,
    },
    securityTooling: {
      sanitizer: {
        path: SANITIZER_TOOLING_PATH,
        treeOid: sanitizerToolingTreeOid,
      },
      generator: {
        workflowPath: GENERATOR_WORKFLOW_PATH,
        workflowBlobOid: generatorWorkflowBlobOid,
        implementationPath: GENERATOR_IMPLEMENTATION_PATH,
        implementationTreeOid: generatorImplementationTreeOid,
      },
    },
    publicSafety: {
      safeForPublicDisclosure: true,
      assertions: [...PUBLIC_SAFETY_ASSERTIONS],
    },
    schema: {
      encoding: "utf-8",
      bytes: Buffer.byteLength(result.schema, "utf8"),
      sha256: sha256(result.schema),
    },
  };
  assertSha256(manifest.schema.sha256, "manifest.schema.sha256");
  return { manifest, schema: result.schema };
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
  for (const required of [
    "input", "policy", "output", "source-commit", "migrations-tree-oid", "sanitizer-tooling-tree-oid",
    "generator-workflow-blob-oid", "generator-implementation-tree-oid", "generated-at", "expires-at",
  ]) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  const optionalOid = (name) => {
    const value = args[name];
    if (value === "absent") return null;
    assertTreeOid(value, name);
    return value;
  };
  const [sql, policyText] = await Promise.all([readFile(args.input, "utf8"), readFile(args.policy, "utf8")]);
  const artifact = buildBaselineArtifact({
    sql,
    policy: JSON.parse(policyText),
    sourceCommit: args["source-commit"],
    migrationsTreeOid: args["migrations-tree-oid"],
    sanitizerToolingTreeOid: args["sanitizer-tooling-tree-oid"],
    generatorWorkflowBlobOid: optionalOid("generator-workflow-blob-oid"),
    generatorImplementationTreeOid: optionalOid("generator-implementation-tree-oid"),
    generatedAt: args["generated-at"],
    expiresAt: args["expires-at"],
  });
  await writeFile(args.output, `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`wrote public-safe baseline ${args.output} (${artifact.manifest.sanitizer.statementCount} statements, sha256:${artifact.manifest.schema.sha256})\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`trusted-baseline sanitizer failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
