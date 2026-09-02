import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PAIGE_SPINE_CAPABILITIES, validateSpineRegistry } from "../../supabase/functions/_shared/paige-spine/registry.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(join(root, "supabase/migrations/20260902004019_paige_spine_foundation.sql"), "utf8");
const chatGuardPath = join(root, "scripts/ci/chat-tool-registry-lint.mjs");

function lint(capabilities, sql, chatGuard) {
  const findings = validateSpineRegistry(capabilities);
  for (const capability of capabilities) {
    const symbols = [capability.evidence?.adapter, capability.action?.executor, capability.outcome?.projector]
      .filter(Boolean);
    for (const symbol of new Set(symbols)) {
      const bare = symbol.replace(/^public\./, "");
      if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${bare}\\s*\\(`, "i").test(sql)) {
        findings.push(`${capability.key}: registered server symbol is absent from the Spine migration: ${symbol}`);
      }
    }
  }
  if (chatGuard) {
    if (/no Spine registry exists yet/i.test(chatGuard)) findings.push("Chat guard still claims that no Spine registry exists");
    if (!chatGuard.includes("supabase/functions/_shared/paige-spine/registry.ts")) {
      findings.push("Chat guard must consume the canonical Spine registry after reconciliation");
    }
  }
  return findings;
}

if (process.argv.includes("--self-test")) {
  const unsafe = [{
    ...PAIGE_SPINE_CAPABILITIES[0],
    key: "pipeline.unsafe_mutation",
    action: {
      classification: "mutate",
      executor: "public.get_pipeline_spine_evidence",
      idempotency: "",
      riskPolicyKey: "",
      approvalAuthority: "none",
    },
  }, PAIGE_SPINE_CAPABILITIES[0]];
  const findings = lint(unsafe, migration, null);
  if (!findings.some((finding) => finding.includes("chat-canonical")) ||
      !findings.some((finding) => finding.includes("idempotency")) ||
      !findings.some((finding) => finding.includes("risk policy"))) {
    console.error("PAIGE Spine registry lint self-test failed closed incorrectly");
    process.exit(1);
  }
  console.log("PAIGE Spine registry lint self-test: PASS");
  process.exit(0);
}

const chatGuard = existsSync(chatGuardPath) ? readFileSync(chatGuardPath, "utf8") : null;
const findings = lint(PAIGE_SPINE_CAPABILITIES, migration, chatGuard);
if (findings.length) {
  console.error("PAIGE Spine registry lint: FAIL");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log(`PAIGE Spine registry lint: PASS (${PAIGE_SPINE_CAPABILITIES.length} capability)`);
