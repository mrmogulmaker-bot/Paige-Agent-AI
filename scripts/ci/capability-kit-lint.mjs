#!/usr/bin/env node
/**
 * Capability Kit construction + anti-bypass guard (INT-003).
 *
 * Kit declarations are strict from day one. Existing execution/tool/risk debt is a
 * shrink-only list generated from synchronized main: an entry may disappear, but no
 * unlisted path+symbol may appear. The MCP gateway path is temporarily exempt by the
 * coordinator's PR-1 ruling and must be removed only in a separately authorized PR.
 *
 * INT-003, RESOLVED — the `direct-risk-entry` rule no longer treats the canonical action-risk
 * policy as a bypass. It previously flagged EVERY entry of the `RISK` array while its own remedy,
 * `defineCapability()`, threw unless that same entry existed, so a new mutating tool could be
 * neither classified nor declared and the ledger could never legitimately shrink. The rule now
 * fires only for an action-risk key with NO `defineCapability()` declaration in the scanned tree:
 * classify it AND govern it, in the same change, and the entry clears. See the rule body for the
 * full reasoning and for why no mutation-verb filter is applied.
 *
 * HEURISTIC LIMITS
 * Threat model: accidental bypass in our own edits, not adversarial evasion.
 * This static AST pass does not promise to resolve computed or bracket member access,
 * values returned from functions, dynamic import, or eval. Direct dot-member bindings,
 * imports/re-exports, object binding patterns, assignment destructuring, and parameter
 * destructuring are the deliberately supported boundary.
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
  "supabase/functions/_shared/capability-kit/snapshot.ts",
  "supabase/functions/_shared/capability-kit/seams.ts",
  "supabase/functions/_shared/capability-kit/defineCapability.ts",
  "supabase/functions/_shared/capability-kit/mod.ts",
  "scripts/fixtures/capability-kit/type-contract.fixture.ts",
];

/**
 * Every `actionRiskKey` declared through `defineCapability()` in the scanned tree. A key here has a
 * governed declaration, so its `RISK` entry is the declaration's dependency rather than debt.
 */
function collectDeclaredCapabilityNames(files, resolver) {
  const riskKeys = new Set();
  const toolNames = new Set();
  for (const file of files) {
    const sourceFile = resolver.sourceFile(file);
    if (!sourceFile) continue;
    const visit = (node) => {
      if (ts.isCallExpression(node) && calledMember(node, sourceFile) === "defineCapability") {
        // Same unwrap the strict completeness rule uses — deliberately the SAME helper, so a cast
        // can never hide a declaration from one reader while registering it with the other.
        // A declaration passed by variable reference is outside this pass's supported boundary
        // (see HEURISTIC LIMITS at the top) and will read as undeclared — which fails CLOSED.
        const argument = unwrapExpression(node.arguments[0]);
        if (argument && ts.isObjectLiteralExpression(argument)) {
          for (const property of argument.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const section = propertyName(property.name, sourceFile);
            if (section !== "governance") continue;
            if (!ts.isObjectLiteralExpression(property.initializer)) continue;
            for (const field of property.initializer.properties) {
              if (!ts.isPropertyAssignment(field)) continue;
              const name = propertyName(field.name, sourceFile);
              if (!ts.isStringLiteralLike(field.initializer)) continue;
              // ONLY `governance.actionRiskKey` counts, and `identity.id` deliberately does NOT.
              //
              // Letting `identity.id` clear the tool schema was tried and REJECTED: it opened a
              // real hole, reproduced before it shipped. A destructive tool named `widget_purge`
              // could declare itself a READ capability (`effect: "read"` requires
              // `actionRiskKey: null` by contract) and clear this guard — while `purge` is absent
              // from `MUTATION_VERB`, so `unclassifiedWriteReason()` reads it as a query,
              // `action-risk-lint` never sees a write, and `mutatingTools()` does not contain it.
              // The per-tool rule below is the ONLY catch for a write whose verb that regex misses,
              // and `MUTATION_VERB` has genuinely missed one twice already in production (`decide`
              // and `configure` — see the notes in action-risk.ts). So the only thing that clears a
              // tool schema is a key classified as a mutation in the canonical policy, which forces
              // it through `classifyAction()` and into the runtime gate.
              if (section === "governance" && name === "actionRiskKey") {
                riskKeys.add(field.initializer.text);
                toolNames.add(field.initializer.text);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return { riskKeys, toolNames };
}

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

/**
 * Strip `as T`, `<T>x` and parentheses off an expression.
 *
 * It exists because the two places that read a `defineCapability()` argument MUST agree. They did
 * not: the strict completeness rule required a bare object literal while the declaration collector
 * unwrapped casts, so `defineCapability({ ... } as any)` escaped `incomplete-capability` AND still
 * registered its name as governed — two lines that together minted clearance for any tool. The
 * `as any` escape from the strict rule pre-dates the collector; the collector is what made it
 * grant something. One helper, used by both, is why they cannot drift apart again.
 */
function unwrapExpression(node) {
  let current = node;
  while (current && (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current))) {
    current = current.expression;
  }
  return current;
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

function createAstResolver(files) {
  let nextBindingId = 1;
  const localResolutionCache = new Map();
  const exportResolutionCache = new Map();
  const RESOLVING = Symbol("resolving");
  const sources = new Map(files.map((file) => {
    const absolute = path.resolve(file);
    const source = fs.readFileSync(absolute, "utf8");
    return [absolute, ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true,
      absolute.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)];
  }));

  function moduleFile(fromFile, specifier) {
    if (!specifier.startsWith(".")) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (sources.has(candidate)) return candidate;
    }
    return null;
  }

  function addBinding(bindings, localName, source, memberPath = []) {
    const existing = bindings.get(localName) ?? [];
    existing.push({ id: nextBindingId++, source, memberPath });
    bindings.set(localName, existing);
  }

  function collectBindingPattern(name, source, memberPath, bindings, sourceFile) {
    if (ts.isIdentifier(name)) {
      addBinding(bindings, name.text, source, memberPath);
      return;
    }
    if (!ts.isObjectBindingPattern(name)) return;
    for (const element of name.elements) {
      if (element.dotDotDotToken) continue;
      const key = element.propertyName
        ? propertyName(element.propertyName, sourceFile)
        : ts.isIdentifier(element.name) ? element.name.text : null;
      if (key === null) continue;
      collectBindingPattern(element.name, source, [...memberPath, key], bindings, sourceFile);
      if (element.initializer) collectBindingPattern(element.name, element.initializer, [], bindings, sourceFile);
    }
  }

  function collectAssignmentPattern(pattern, source, memberPath, bindings, sourceFile) {
    if (!ts.isObjectLiteralExpression(pattern)) return;
    for (const member of pattern.properties) {
      if (ts.isShorthandPropertyAssignment(member)) {
        addBinding(bindings, member.name.text, source, [...memberPath, member.name.text]);
        continue;
      }
      if (!ts.isPropertyAssignment(member)) continue;
      const key = propertyName(member.name, sourceFile);
      if (key === null) continue;
      const pathToMember = [...memberPath, key];
      let target = member.initializer;
      if (ts.isBinaryExpression(target) && target.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isIdentifier(target.left)) addBinding(bindings, target.left.text, source, pathToMember);
        if (ts.isIdentifier(target.left)) addBinding(bindings, target.left.text, target.right);
        continue;
      }
      if (ts.isIdentifier(target)) addBinding(bindings, target.text, source, pathToMember);
      else if (ts.isObjectLiteralExpression(target)) {
        collectAssignmentPattern(target, source, pathToMember, bindings, sourceFile);
      }
    }
  }

  const fileInfo = new Map();
  for (const [file, source] of sources) {
    const namedImports = new Map();
    const namespaceImports = new Map();
    const bindings = new Map();
    const functions = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
      const target = moduleFile(file, statement.moduleSpecifier.text);
      if (!target) continue;
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          namedImports.set(specifier.name.text, {
            target,
            imported: specifier.propertyName?.text ?? specifier.name.text,
          });
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        namespaceImports.set(bindings.name.text, target);
      }
    }
    function collectBindings(node) {
      if (ts.isVariableDeclaration(node) && node.initializer) {
        collectBindingPattern(node.name, node.initializer, [], bindings, source);
        if (ts.isIdentifier(node.name) &&
          (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          functions.set(node.name.text, node.initializer);
        }
      }
      if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isObjectLiteralExpression(node.left)) {
        collectAssignmentPattern(node.left, node.right, [], bindings, source);
      }
      ts.forEachChild(node, collectBindings);
    }
    collectBindings(source);
    fileInfo.set(file, { namedImports, namespaceImports, bindings, functions });
  }

  for (const [file, source] of sources) {
    const info = fileInfo.get(file);
    function collectParameterBindings(node) {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const callable = info.functions.get(node.expression.text);
        if (callable) {
          callable.parameters.forEach((parameter, index) => {
            if (!ts.isObjectBindingPattern(parameter.name)) return;
            const argument = node.arguments[index];
            if (argument) collectBindingPattern(parameter.name, argument, [], info.bindings, source);
            if (parameter.initializer) collectBindingPattern(parameter.name, parameter.initializer, [], info.bindings, source);
          });
        }
      }
      ts.forEachChild(node, collectParameterBindings);
    }
    collectParameterBindings(source);
  }

  function unwrap(expression) {
    while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) ||
      ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) {
      expression = expression.expression;
    }
    return expression;
  }

  function resolveExpressionPath(file, expression, memberPath, seen) {
    expression = unwrap(expression);
    if (ts.isPropertyAccessExpression(expression)) {
      return resolveExpressionPath(file, expression.expression, [expression.name.text, ...memberPath], seen);
    }
    if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
      return resolveExpressionPath(file, expression.expression, [expression.argumentExpression.text, ...memberPath], seen);
    }
    if (ts.isObjectLiteralExpression(expression) && memberPath.length > 0) {
      const [next, ...rest] = memberPath;
      for (const member of expression.properties) {
        if (ts.isPropertyAssignment(member) && propertyName(member.name, sources.get(file)) === next) {
          return resolveExpressionPath(file, member.initializer, rest, seen);
        }
        if (ts.isShorthandPropertyAssignment(member) && member.name.text === next) {
          return resolveExpressionPath(file, member.name, rest, seen);
        }
      }
      return false;
    }
    if (!ts.isIdentifier(expression)) return false;
    const target = fileInfo.get(file)?.namespaceImports.get(expression.text);
    if (target && memberPath.length === 1) return resolveExport(target, memberPath[0], seen);
    return resolveLocal(file, expression.text, memberPath, seen);
  }

  function resolveExpression(file, expression, seen) {
    return resolveExpressionPath(file, expression, [], seen);
  }

  function resolveLocal(file, localName, memberPath, seen) {
    const key = `local:${file}:${localName}:${memberPath.join(".")}`;
    const cached = localResolutionCache.get(key);
    if (cached !== undefined) return cached === true;
    if (seen.has(key)) return false;
    seen.add(key);
    localResolutionCache.set(key, RESOLVING);
    if (localName === "decideGovernedExecution" && memberPath.length === 0) {
      localResolutionCache.set(key, true);
      return true;
    }
    const info = fileInfo.get(file);
    const imported = info?.namedImports.get(localName);
    if (imported && ((memberPath.length === 0 && resolveExport(imported.target, imported.imported, seen)) ||
      (memberPath.length > 0 && resolveNamespaceExportMember(
        imported.target, imported.imported, memberPath, seen,
      )))) {
      localResolutionCache.set(key, true);
      return true;
    }
    const resolved = (info?.bindings.get(localName) ?? []).some((binding) => {
      const bindingKey = `binding:${binding.id}`;
      if (seen.has(bindingKey)) return false;
      const nextSeen = new Set(seen);
      nextSeen.add(bindingKey);
      return resolveExpressionPath(file, binding.source, [...binding.memberPath, ...memberPath], nextSeen);
    });
    localResolutionCache.set(key, resolved);
    return resolved;
  }

  function resolveNamespaceExportMember(file, exportName, memberPath, seen) {
    if (memberPath.length === 0) return resolveExport(file, exportName, seen);
    const key = `namespace-export:${file}:${exportName}:${memberPath.join(".")}`;
    if (seen.has(key)) return false;
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    const source = sources.get(file);
    for (const statement of source?.statements ?? []) {
      if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue;
      const target = statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
        ? moduleFile(file, statement.moduleSpecifier.text)
        : file;
      if (!target) continue;
      if (ts.isNamespaceExport(statement.exportClause) && statement.exportClause.name.text === exportName) {
        const [next, ...rest] = memberPath;
        return rest.length === 0
          ? resolveExport(target, next, nextSeen)
          : resolveNamespaceExportMember(target, next, rest, nextSeen);
      }
      if (!ts.isNamedExports(statement.exportClause)) continue;
      for (const specifier of statement.exportClause.elements) {
        if (specifier.name.text !== exportName) continue;
        const local = specifier.propertyName?.text ?? specifier.name.text;
        if (resolveNamespaceExportMember(target, local, memberPath, nextSeen)) return true;
      }
    }
    return false;
  }
  function resolveExport(file, exportName, seen) {
    const key = `export:${file}:${exportName}`;
    const cached = exportResolutionCache.get(key);
    if (cached !== undefined) return cached === true;
    if (seen.has(key)) return false;
    seen.add(key);
    exportResolutionCache.set(key, RESOLVING);
    const source = sources.get(file);
    for (const statement of source?.statements ?? []) {
      if (ts.isExportDeclaration(statement)) {
        const target = statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier)
          ? moduleFile(file, statement.moduleSpecifier.text)
          : file;
        if (!target) continue;
        if (!statement.exportClause) {
          if (resolveExport(target, exportName, seen)) {
            exportResolutionCache.set(key, true);
            return true;
          }
          continue;
        }
        if (!ts.isNamedExports(statement.exportClause)) continue;
        for (const specifier of statement.exportClause.elements) {
          if (specifier.name.text !== exportName) continue;
          const local = specifier.propertyName?.text ?? specifier.name.text;
          if (target === file ? resolveLocal(file, local, [], seen) : resolveExport(target, local, seen)) {
            exportResolutionCache.set(key, true);
            return true;
          }
        }
      }
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === exportName &&
        resolveLocal(file, exportName, [], seen)) {
        exportResolutionCache.set(key, true);
        return true;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && resolveLocal(file, exportName, [], seen)) {
            exportResolutionCache.set(key, true);
            return true;
          }
        }
      }
    }
    exportResolutionCache.set(key, false);
    return false;
  }

  return {
    sourceFile(file) {
      return sources.get(path.resolve(file));
    },
    isGovernedCall(file, call) {
      return resolveExpression(path.resolve(file), call.expression, new Set());
    },
  };
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
  const declaredRiskKeys = options.declaredRiskKeys ?? new Set();
  const declaredToolNames = options.declaredToolNames ?? new Set();
  const sourceFile = options.sourceFile ?? ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const resolver = options.resolver;
  const findings = [];
  let usesGovernedExecution = false;
  const effectBindings = [];

  function visitFirst(node) {
    if (ts.isCallExpression(node)) {
      const member = calledMember(node, sourceFile);
      if (member === "decideGovernedExecution" || resolver?.isGovernedCall(sourceFile.fileName, node)) {
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
      const unwrappedArgument = unwrapExpression(node.arguments[0]);
      if ((member === "objectInputSchema" || member === "defineCapability") && unwrappedArgument && ts.isObjectLiteralExpression(unwrappedArgument)) {
        const props = objectProperties(unwrappedArgument, sourceFile);
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
        // INT-003, SECOND LOCK — the same category error as `direct-risk-entry`, one rule over.
        // `{name, description, parameters}` is the shape of EVERY Paige tool, so flagging it
        // unconditionally made the tool schema unlandable even after its action was classified and
        // its capability declared. Measured: with the RISK entry AND a `defineCapability()`
        // declaration both present, adding the tool schema still failed CI here — so fixing only
        // the risk rule left the deadlock half-standing. A tool whose name carries a governed
        // declaration is declared, not hand-rolled; one without a declaration still fails.
        //
        // HONEST LIMIT: only a MUTATION clears this, because only `governance.actionRiskKey` is
        // admitted (see the collector). A brand-new READ tool schema therefore still lands on this
        // ledger and needs a baseline entry. That is deliberate — INT-003 was a deadlock on new
        // MUTATING tools, and widening the escape to reads reopened a destructive-write hole.
        const toolName = literalProperty(props, "name") ?? "<dynamic>";
        if (!declaredToolNames.has(toolName)) {
          findings.push(violation("direct-tool-definition", normalized, toolName));
        }
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

  // INT-003 — a RISK entry is the kit's DEPENDENCY, never a bypass of it.
  //
  // This rule used to flag EVERY element of the canonical `RISK` array. That was mis-targeted, and
  // the two halves of the contract contradicted each other outright:
  //   • the rule reported `direct-risk-entry` for any key not already in the shrink-only baseline,
  //     and its own message forbade expanding that baseline;
  //   • its stated remedy — `defineCapability()` — calls `classifyAction(actionRiskKey)` and throws
  //     "Mutation action-risk keys must exist in the canonical action-risk policy" when the key is
  //     absent from that SAME array.
  // So a new mutating tool could be neither classified nor declared, and the baseline could never
  // legitimately shrink either: migrating a tool to `defineCapability()` does not remove its RISK
  // entry, because the declaration requires it. A shrink-only ledger whose entries can never shrink
  // is not a ratchet, it is a freeze — and it froze the one table that classifies risk, so its net
  // effect was to force new mutating actions to ship UNCLASSIFIED. That inverts the safety property
  // it was written to defend.
  //
  // The guard now fires on the defect that actually matters: an action-risk key with no
  // `defineCapability()` declaration anywhere in the scanned tree. Classifying an action and
  // governing it are both required, and neither substitutes for the other.
  //
  // EVERY key in RISK is flagged, with NO mutation-verb filter, and that is deliberate. `RISK`
  // holds only actions — measured, not assumed: its 150 entries are 75 `high`, 72 `ordinary` and
  // 3 `owner_only`, and zero `read_only`. Filtering on `MUTATION_VERB` was tried and REJECTED
  // because it silently dropped 32 genuinely mutating actions whose verbs that regex does not
  // list — `booking_preset_revise`, `crm_merge_contacts`, `crm_close_deal`, `delegate_to_subagent`
  // and 28 more — which would have blinded this guard to 32 live capabilities while appearing to
  // narrow it. (That regex gap is real but separate: it is the runtime fallback for UNCLASSIFIED
  // tools only, and these 32 are classified, so `unclassifiedWriteReason` still governs them.)
  if (!strictOnly && normalized === "supabase/functions/_shared/action-risk.ts") {
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "RISK" || !declaration.initializer) continue;
        const initializer = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
        if (!ts.isArrayLiteralExpression(initializer)) continue;
        for (const entry of initializer.elements) {
          if (!ts.isArrayLiteralExpression(entry) || !entry.elements[0] || !ts.isStringLiteralLike(entry.elements[0])) continue;
          const key = entry.elements[0].text;
          if (declaredRiskKeys.has(key)) continue;
          findings.push(violation("direct-risk-entry", normalized, key));
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
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(ROOT, root)))
    .filter((file) => !relative(file).startsWith(MCP_GATEWAY_EXEMPT));
  const resolver = createAstResolver(files);
  const { riskKeys: declaredRiskKeys, toolNames: declaredToolNames } = collectDeclaredCapabilityNames(files, resolver);
  for (const file of files) {
    const rel = relative(file);
    const sourceFile = resolver.sourceFile(file);
    if (!sourceFile) throw new Error(`TypeScript did not load ${rel}.`);
    if (!rel.startsWith(KIT_DIR)) {
      const shared = { sourceFile, resolver, declaredRiskKeys, declaredToolNames };
      strictFindings.push(...scanSource(sourceFile.text, rel, { ...shared, strictOnly: true }));
      debtFindings.push(...scanSource(sourceFile.text, rel, shared));
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
  const aliasCases = [
    ["import, re-export, namespace, and local aliases", "alias-consumer.ts", 3],
    ["object binding", "alias-object-binding.ts", 1],
    ["nested object binding", "alias-nested-binding.ts", 1],
    ["renamed object binding", "alias-renamed-binding.ts", 1],
    ["defaulted object binding", "alias-default-binding.ts", 1],
    ["assignment destructuring", "alias-assignment-binding.ts", 1],
    ["parameter destructuring", "alias-parameter-binding.ts", 1],
    ["NamespaceExport re-export", "alias-namespace-export-consumer.ts", 1],
  ];
  const aliasFiles = ["alias-governance.ts", "alias-barrel.ts", "alias-namespace-export.ts", ...aliasCases.map((entry) => entry[1])]
    .map((file) => path.join(ROOT, "scripts", "fixtures", "capability-kit", file));
  const aliasResolver = createAstResolver(aliasFiles);
  for (const [name, fixture, expected] of aliasCases) {
    const aliasFile = path.join(ROOT, "scripts", "fixtures", "capability-kit", fixture);
    const aliasSource = aliasResolver.sourceFile(aliasFile);
    const aliasFindings = scanSource(aliasSource.text, relative(aliasFile), {
      sourceFile: aliasSource,
      resolver: aliasResolver,
    }).filter((item) => item.rule === "direct-governed-execution");
    if (aliasFindings.length !== expected) {
      failed += 1;
      console.error(`  FAIL AST ${name}: expected ${expected} governed calls, got ${aliasFindings.length}`);
    } else console.log(`  ok   AST resolves ${name}`);
  }
  // INT-003 — the guard must still BITE on an undeclared mutating key, must NOT fire once the key is
  // declared, and must ignore a read key. A guard that stopped catching anything would be a worse
  // outcome than the deadlock it replaced, so all three directions are asserted.
  const riskFixture = 'const RISK = [["widget_send","high","x"],["widget_revise","ordinary","x"]] as const;';
  const riskPath = "supabase/functions/_shared/action-risk.ts";
  const undeclared = scanSource(riskFixture, riskPath).filter((item) => item.rule === "direct-risk-entry");
  if (undeclared.length !== 2) {
    failed += 1;
    console.error(`  FAIL direct-risk-entry bites undeclared keys: got ${JSON.stringify(undeclared.map((i) => i.symbol))}`);
  } else console.log("  ok   direct-risk-entry bites an undeclared action-risk key");
  // `widget_revise` carries a verb MUTATION_VERB does not list. It must STILL be flagged: the
  // guard reads the RISK table, which holds only actions, and never the verb regex.
  if (!undeclared.some((item) => item.symbol === "widget_revise")) {
    failed += 1;
    console.error("  FAIL direct-risk-entry skipped an action whose verb is absent from MUTATION_VERB");
  } else console.log("  ok   direct-risk-entry does not depend on the MUTATION_VERB vocabulary");
  const declaredFindings = scanSource(riskFixture, riskPath, { declaredRiskKeys: new Set(["widget_send", "widget_revise"]) })
    .filter((item) => item.rule === "direct-risk-entry");
  if (declaredFindings.length !== 0) {
    failed += 1;
    console.error("  FAIL direct-risk-entry still fired for a key declared through defineCapability()");
  } else console.log("  ok   direct-risk-entry clears once the key is declared (INT-003 unblocked)");
  // A cast must not hide an incomplete declaration from the strict rule. Before the shared
  // unwrap, `as any` escaped this check entirely — and once a collector read through casts, that
  // escape also minted governance clearance for the tool name.
  const castHidden = scanSource('defineCapability({idempotency:{},outcome:{}} as any)', "fixture.ts", { strictOnly: true })
    .filter((item) => item.rule === "incomplete-capability");
  if (castHidden.length === 0) {
    failed += 1;
    console.error("  FAIL a cast hid an incomplete capability declaration from the strict rule");
  } else console.log("  ok   a cast cannot hide an incomplete capability declaration");
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
  console.log(`\n✓ capability-kit lint self-test passed — ${cases.length + aliasCases.length + 8} cases.`);
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
  if (additions.some((item) => item.rule === "direct-risk-entry")) {
    console.error(
      "\nFor direct-risk-entry specifically: a mutating action needs BOTH halves, in the same change.\n" +
      "  1. classify it — add its entry to RISK in supabase/functions/_shared/action-risk.ts\n" +
      "  2. govern it  — declare defineCapability({ governance: { actionRiskKey: \"<key>\", ... } })\n" +
      "     under supabase/functions/ or src/.\n" +
      "Step 1 alone is what this reports. Step 2 clears it, and step 2 REQUIRES step 1 — classifyAction()\n" +
      "reads the same RISK array, so the entry is the declaration's dependency, not debt to be avoided."
    );
  }
  process.exit(1);
}

console.log(
  `✓ capability-kit lint: type contract valid; ${findings.debt.length}/${baseline.length} baseline path+symbol entries remain; no new bypass.`,
);
