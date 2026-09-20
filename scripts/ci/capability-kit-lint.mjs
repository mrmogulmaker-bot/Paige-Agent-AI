#!/usr/bin/env node
/**
 * Capability Kit construction + anti-bypass guard (INT-003).
 *
 * Kit declarations are strict from day one. Existing execution/tool/risk debt is a
 * shrink-only list generated from synchronized main: an entry may disappear, but no
 * unlisted path+symbol may appear. The MCP gateway path is temporarily exempt by the
 * coordinator's PR-1 ruling and must be removed only in a separately authorized PR.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const BASELINE_PATH = path.join(HERE, "capability-kit-bypass-baseline.json");
const KIT_DIR = "supabase/functions/_shared/capability-kit/";
const MCP_GATEWAY_EXEMPT = "supabase/functions/_shared/mcp-gateway/";
const SCAN_ROOTS = ["supabase/functions", "src"];
const KIT_FILES = [
  "supabase/functions/_shared/capability-kit/types.ts",
  "supabase/functions/_shared/capability-kit/permission.ts",
  "supabase/functions/_shared/capability-kit/schema.ts",
  "supabase/functions/_shared/capability-kit/defineCapability.ts",
  "supabase/functions/_shared/capability-kit/mod.ts",
  "scripts/fixtures/capability-kit/type-contract.fixture.ts",
];

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function walk(directory) {
  const output = [];
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)) output.push(absolute);
  }
  return output;
}

function propertyName(node, sourceFile) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) return node.expression.text;
  return node.getText(sourceFile);
}

function stringArgument(call) {
  const first = call.arguments[0];
  return first && ts.isStringLiteralLike(first) ? first.text : null;
}

function calledMember(call, sourceFile) {
  const expression = call.expression;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) return propertyName(expression.argumentExpression, sourceFile);
  return ts.isIdentifier(expression) ? expression.text : null;
}

function objectProperties(object, sourceFile) {
  const properties = new Map();
  for (const member of object.properties) {
    if (ts.isPropertyAssignment(member) || ts.isShorthandPropertyAssignment(member) || ts.isMethodDeclaration(member)) {
      properties.set(propertyName(member.name, sourceFile), member);
    }
  }
  return properties;
}

function literalProperty(properties, key) {
  const node = properties.get(key);
  if (!node || !ts.isPropertyAssignment(node)) return null;
  return ts.isStringLiteralLike(node.initializer) ? node.initializer.text : null;
}

function violation(rule, file, symbol) {
  return { rule, path: file, symbol };
}

export function scanSource(source, file = "fixture.ts", options = {}) {
  const normalized = file.replaceAll("\\", "/");
  const strictOnly = options.strictOnly === true;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings = [];
  let usesGovernedExecution = false;
  const effectBindings = [];

  function visitFirst(node) {
    if (ts.isCallExpression(node)) {
      const member = calledMember(node, sourceFile);
      if (member === "decideGovernedExecution") {
        usesGovernedExecution = true;
        if (!strictOnly) {
          findings.push(violation("direct-governed-execution", normalized, "decideGovernedExecution"));
        }
      }
      if ((member === "rpc" || member === "invoke") && stringArgument(node)) {
        effectBindings.push({ member, symbol: stringArgument(node) });
      }
      if (member === "ownerGrantablePermission") {
        const key = stringArgument(node);
        if (key && (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){2,}$/.test(key) ||
          /^(?:owner|admin|coach|member|platform_operator)$/.test(key) ||
          /^(?:role|roles)[._-]/.test(key) ||
          /^marketplace[._-](?:listing|installed|installation)[._-]/.test(key))) {
          findings.push(violation("permission-literal", normalized, key));
        }
      }
      if ((member === "objectInputSchema" || member === "defineCapability") && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
        const props = objectProperties(node.arguments[0], sourceFile);
        if (member === "objectInputSchema") {
          for (const keyword of ["anyOf", "oneOf", "allOf", "not"]) {
            if (props.has(keyword)) findings.push(violation("root-schema-combinator", normalized, keyword));
          }
        } else {
          for (const required of ["idempotency", "receipt", "outcome"]) {
            if (!props.has(required)) findings.push(violation("incomplete-capability", normalized, required));
          }
          for (const forbidden of ["authoritySource", "marketplaceGrant", "marketplaceListing"]) {
            if (props.has(forbidden)) findings.push(violation("marketplace-as-authority", normalized, forbidden));
          }
        }
      }
      if (!strictOnly && member === "rpc" && stringArgument(node) === "record_capability_run") {
        findings.push(violation("direct-capability-receipt", normalized, "record_capability_run"));
      }
    }

    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      if (/\bDefinedCapability\b/.test(node.type.getText(sourceFile))) {
        findings.push(violation("fabricated-capability-brand", normalized, "DefinedCapability"));
      }
    }

    if (ts.isObjectLiteralExpression(node)) {
      const props = objectProperties(node, sourceFile);
      if (!strictOnly && props.has("name") && props.has("description") && (props.has("parameters") || props.has("input_schema"))) {
        findings.push(violation("direct-tool-definition", normalized, literalProperty(props, "name") ?? "<dynamic>"));
      }
    }
    ts.forEachChild(node, visitFirst);
  }
  visitFirst(sourceFile);

  if (!strictOnly && usesGovernedExecution) {
    for (const binding of effectBindings) {
      findings.push(violation("direct-governed-binding", normalized, `${binding.member}:${binding.symbol}`));
    }
  }

  if (!strictOnly && normalized === "supabase/functions/_shared/action-risk.ts") {
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "RISK" || !declaration.initializer) continue;
        const initializer = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
        if (!ts.isArrayLiteralExpression(initializer)) continue;
        for (const entry of initializer.elements) {
          if (!ts.isArrayLiteralExpression(entry) || !entry.elements[0] || !ts.isStringLiteralLike(entry.elements[0])) continue;
          findings.push(violation("direct-risk-entry", normalized, entry.elements[0].text));
        }
      }
    }
  }

  return findings.sort(compare);
}

function compare(a, b) {
  return a.path.localeCompare(b.path) || a.rule.localeCompare(b.rule) || a.symbol.localeCompare(b.symbol);
}

function additionsAgainstBaseline(current, baseline) {
  const admitted = new Map();
  for (const item of baseline) {
    const key = JSON.stringify(item);
    admitted.set(key, (admitted.get(key) ?? 0) + 1);
  }
  const additions = [];
  for (const item of current) {
    const key = JSON.stringify(item);
    const remaining = admitted.get(key) ?? 0;
    if (remaining > 0) admitted.set(key, remaining - 1);
    else additions.push(item);
  }
  return additions;
}

function scanRepository() {
  const strictFindings = [];
  const debtFindings = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(path.join(ROOT, root))) {
      const rel = relative(file);
      if (rel.startsWith(MCP_GATEWAY_EXEMPT)) continue;
      const source = fs.readFileSync(file, "utf8");
      if (!rel.startsWith(KIT_DIR)) {
        strictFindings.push(...scanSource(source, rel, { strictOnly: true }));
        debtFindings.push(...scanSource(source, rel));
      }
    }
  }
  return {
    strict: strictFindings.sort(compare),
    debt: debtFindings.sort(compare),
  };
}

function typecheckKit() {
  const files = KIT_FILES.map((file) => path.join(ROOT, file));
  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length) return missing.map((file) => `missing ${relative(file)}`);
  const program = ts.createProgram(files, {
    allowImportingTsExtensions: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${relative(diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`;
  });
}

function runSelfTest() {
  const cases = [
    ["governed execution", `decideGovernedExecution(input)`, "direct-governed-execution"],
    ["receipt write", `admin.rpc("record_capability_run", {})`, "direct-capability-receipt"],
    ["governed RPC binding", `decideGovernedExecution(input); admin.rpc("write_contact", {})`, "direct-governed-binding"],
    ["tool definition", `const x={name:"unsafe_tool",description:"x",parameters:{type:"object"}}`, "direct-tool-definition"],
    ["root anyOf", `objectInputSchema({properties:{},anyOf:[]})`, "root-schema-combinator"],
    ["role permission", `ownerGrantablePermission("owner")`, "permission-literal"],
    ["missing receipt", `defineCapability({idempotency:{},outcome:{}})`, "incomplete-capability"],
    ["marketplace authority", `defineCapability({idempotency:{},receipt:{},outcome:{},authoritySource:"marketplace"})`, "marketplace-as-authority"],
    ["brand cast", `const x = raw as DefinedCapability`, "fabricated-capability-brand"],
  ];
  let failed = 0;
  for (const [name, source, expected] of cases) {
    const actual = scanSource(source, "fixture.ts").map((item) => item.rule);
    if (!actual.includes(expected)) {
      failed += 1;
      console.error(`  FAIL ${name}: expected ${expected}, got ${actual.join(", ") || "nothing"}`);
    } else console.log(`  ok   ${name}`);
  }
  const exempt = "supabase/functions/_shared/mcp-gateway/temporary.ts".startsWith(MCP_GATEWAY_EXEMPT);
  if (!exempt) {
    failed += 1;
    console.error("  FAIL MCP gateway exemption");
  } else console.log("  ok   MCP gateway path exemption is exact");
  const oldA = violation("direct-tool-definition", "a.ts", "a");
  const oldB = violation("direct-tool-definition", "b.ts", "b");
  const newC = violation("direct-tool-definition", "c.ts", "c");
  if (additionsAgainstBaseline([oldA], [oldA, oldB]).length !== 0) {
    failed += 1;
    console.error("  FAIL shrink-only baseline rejected removed debt");
  } else console.log("  ok   shrink-only baseline permits debt removal");
  if (additionsAgainstBaseline([oldA, newC], [oldA, oldB]).length !== 1) {
    failed += 1;
    console.error("  FAIL shrink-only baseline admitted new debt");
  } else console.log("  ok   shrink-only baseline rejects new path+symbol debt");
  if (additionsAgainstBaseline([oldA, oldA], [oldA]).length !== 1) {
    failed += 1;
    console.error("  FAIL shrink-only baseline admitted a duplicate occurrence");
  } else console.log("  ok   shrink-only baseline preserves occurrence counts");
  if (failed) process.exit(1);
  console.log(`\n✓ capability-kit lint self-test passed — ${cases.length + 4} cases.`);
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
  process.exit(0);
}

const findings = scanRepository();
if (process.argv.includes("--print-baseline")) {
  process.stdout.write(`${JSON.stringify(findings.debt, null, 2)}\n`);
  process.exit(0);
}

const typeErrors = typecheckKit();
if (typeErrors.length) {
  console.error("✗ capability-kit type contract failed:");
  for (const error of typeErrors) console.error(`  ${error}`);
  process.exit(1);
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`✗ missing shrink-only baseline: ${relative(BASELINE_PATH)}`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
if (findings.strict.length) {
  console.error("✗ strict Capability Kit construction rule failed:");
  for (const item of findings.strict) console.error(`  ${item.rule} | ${item.path} | ${item.symbol}`);
  process.exit(1);
}
const additions = additionsAgainstBaseline(findings.debt, baseline);
if (additions.length) {
  console.error("✗ capability-kit anti-bypass debt grew:");
  for (const item of additions) console.error(`  ${item.rule} | ${item.path} | ${item.symbol}`);
  console.error("\nRoute the declaration through defineCapability(); never expand the baseline to clear CI.");
  process.exit(1);
}

console.log(
  `✓ capability-kit lint: type contract valid; ${findings.debt.length}/${baseline.length} baseline path+symbol entries remain; no new bypass.`,
);
