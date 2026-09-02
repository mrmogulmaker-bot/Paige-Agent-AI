import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PAIGE_SPINE_CAPABILITIES, validateSpineRegistry } from "../../supabase/functions/_shared/paige-spine/registry.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDir = join(root, "supabase/migrations");
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()
  .map((name) => readFileSync(join(migrationDir, name), "utf8")).join("\n");
const chatGuardPath = join(root, "scripts/ci/chat-tool-registry-lint.mjs");
const actionRiskPath = join(root, "supabase/functions/_shared/action-risk.ts");

function lint(capabilities, sql, chatGuard, actionRisk) {
  const findings = validateSpineRegistry(capabilities);
  for (const capability of capabilities) {
    const symbols = [capability.evidence?.adapter, capability.action?.executor, capability.outcome?.projector].filter(Boolean);
    for (const symbol of new Set(symbols)) {
      const bare = symbol.replace(/^public\./, "");
      if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${bare}\\s*\\(`, "i").test(sql)) findings.push(`${capability.key}: registered server symbol is absent from migration history: ${symbol}`);
    }
    if (["mutate", "external_effect"].includes(capability.action?.classification)) {
      if (!chatGuard) findings.push(`${capability.key}: mutable capability requires the direct Chat registry guard`);
      if (!actionRisk) findings.push(`${capability.key}: mutable capability requires Chat's canonical action-risk policy`);
      const tool = capability.action?.chatTool;
      const risk = capability.action?.riskPolicyKey;
      if (tool && risk && actionRisk && !actionRisk.includes(`["${tool}", "${risk}"`)) findings.push(`${capability.key}: Chat tool ${tool} is not classified ${risk} in the canonical action-risk policy`);
    }
  }
  if (chatGuard) {
    if (/no Spine registry exists yet/i.test(chatGuard)) findings.push("Chat guard still claims that no Spine registry exists");
    if (!chatGuard.includes("supabase/functions/_shared/paige-spine/registry.ts")) findings.push("Chat guard must consume the canonical Spine registry after reconciliation");
  }
  return findings;
}

if (process.argv.includes("--self-test")) {
  const unsafe = [{
    ...PAIGE_SPINE_CAPABILITIES[0], key: "pipeline.unsafe_mutation", chatBinding: "PARTIAL",
    action: { classification: "mutate", executor: "public.get_pipeline_spine_evidence", chatTool: "banana_write", idempotency: "", riskPolicyKey: "read_only", approvalAuthority: "none" },
  }, PAIGE_SPINE_CAPABILITIES[0]];
  const findings = lint(unsafe, migrations, null, null);
  if (!["chat-canonical", "LIVE Chat", "ordinary or high", "idempotency", "direct Chat", "action-risk"].every((needle) => findings.some((finding) => finding.includes(needle)))) {
    console.error("PAIGE Spine registry lint self-test failed closed incorrectly"); process.exit(1);
  }
  const later = migrations + "\ncreate or replace function public.future_domain_adapter() returns void language sql as $$ select $$;";
  const future = [{ ...PAIGE_SPINE_CAPABILITIES[0], key: "future.safe_evidence", evidence: { ...PAIGE_SPINE_CAPABILITIES[0].evidence, adapter: "public.future_domain_adapter" }, action: undefined, outcome: undefined }];
  if (lint(future, later, null, null).length) { console.error("PAIGE Spine registry lint rejected an additive later migration"); process.exit(1); }
  console.log("PAIGE Spine registry lint self-test: PASS"); process.exit(0);
}

const chatGuard = existsSync(chatGuardPath) ? readFileSync(chatGuardPath, "utf8") : null;
const actionRisk = existsSync(actionRiskPath) ? readFileSync(actionRiskPath, "utf8") : null;
const findings = lint(PAIGE_SPINE_CAPABILITIES, migrations, chatGuard, actionRisk);
if (findings.length) {
  console.error("PAIGE Spine registry lint: FAIL"); for (const finding of findings) console.error(`- ${finding}`); process.exit(1);
}
console.log(`PAIGE Spine registry lint: PASS (${PAIGE_SPINE_CAPABILITIES.length} capability)`);
