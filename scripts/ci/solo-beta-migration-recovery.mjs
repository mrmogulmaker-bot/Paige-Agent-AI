import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SOLO_BETA_MIGRATION_SHA256 = "c613e2ec559f8ccefd8b8a58efb96df055dee7bc7ae42b0bfe6884d429b386a6";

const requiredOfferColumns = [
  ["offer_code", "text", ["not null"]],
  ["plan_id", "uuid", ["not null"]],
  ["account_type", "text", ["not null"]],
  ["provider_mode", "text", ["not null"]],
  ["stripe_account", "text", ["not null"]],
  ["stripe_product_id", "text", []],
  ["stripe_price_id", "text", []],
  ["unit_amount_cents", "integer", ["not null"]],
  ["currency", "text", ["not null"]],
  ["billing_interval", "text", ["not null"]],
  ["interval_count", "integer", ["not null"]],
  ["trial_days", "integer", ["not null"]],
  ["status", "text", ["not null"]],
  ["created_at", "timestamp with time zone", ["not null", "default now()"]],
  ["updated_at", "timestamp with time zone", ["not null", "default now()"]],
];

const requiredOfferConstraints = [
  ["platform_subscription_offers_pkey", ["primary key", "offer_code"]],
  ["platform_subscription_offers_plan_id_fkey", ["foreign key", "plan_id", "references public.platform_subscription_plans", "id"]],
  ["platform_subscription_offers_account_type_check", ["check", "account_type", "standalone"]],
  ["platform_subscription_offers_provider_mode_check", ["check", "provider_mode", "test"]],
  ["platform_subscription_offers_stripe_account_check", ["check", "stripe_account", "v2"]],
  ["platform_subscription_offers_unit_amount_cents_check", ["check", "unit_amount_cents", "7450"]],
  ["platform_subscription_offers_currency_check", ["check", "currency", "usd"]],
  ["platform_subscription_offers_billing_interval_check", ["check", "billing_interval", "month"]],
  ["platform_subscription_offers_interval_count_check", ["check", "interval_count", "1"]],
  ["platform_subscription_offers_trial_days_check", ["check", "trial_days", "30"]],
  ["platform_subscription_offers_status_check", ["check", "status", "configuration_required", "test_ready", "retired"]],
  ["platform_subscription_offers_check", ["check", "status", "test_ready", "stripe_product_id", "stripe_price_id", "not null"]],
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value) {
  return value.replaceAll('"', "").replace(/::[a-z ]+/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function tableBlock(schemaSql, table) {
  const name = escapeRegex(table);
  const match = schemaSql.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+(?:"public"|public)\\.(?:"${name}"|${name})\\s*\\(([\\s\\S]*?)\\);`, "i"));
  return match?.[1] ?? null;
}

function constraintBlock(schemaSql, name) {
  const escaped = escapeRegex(name);
  const match = schemaSql.match(new RegExp(`ADD CONSTRAINT\\s+(?:"${escaped}"|${escaped})\\s+([\\s\\S]*?);`, "i"));
  return match?.[1] ?? null;
}

export function recoverSoloBetaMigration(schemaSql, migrationSql, expectedHash = SOLO_BETA_MIGRATION_SHA256) {
  const offers = tableBlock(schemaSql, "platform_subscription_offers");
  if (!offers) return { needed: false, migrationSql };

  const offerLines = offers.split(/\r?\n/).map(normalize);
  const missing = [];
  for (const [column, type, requirements] of requiredOfferColumns) {
    const line = offerLines.find((candidate) => candidate.startsWith(`${column} `));
    if (!line || !line.startsWith(`${column} ${type}`) || requirements.some((requirement) => !line.includes(requirement))) {
      missing.push(`column:${column}`);
    }
  }
  for (const [name, fragments] of requiredOfferConstraints) {
    const block = constraintBlock(schemaSql, name);
    const normalized = block ? normalize(block) : "";
    if (!block || fragments.some((fragment) => !normalized.includes(fragment))) missing.push(`constraint:${name}`);
  }
  if (missing.length) throw new Error(`solo_beta_recovery_schema_mismatch:platform_subscription_offers:${missing.join(",")}`);

  const digest = createHash("sha256").update(migrationSql).digest("hex");
  if (expectedHash && digest !== expectedHash) throw new Error("solo_beta_recovery_source_digest_mismatch");

  const anchor = "CREATE TABLE public.platform_subscription_offers (";
  if (!migrationSql.includes(anchor)) throw new Error("solo_beta_recovery_transform_anchor_missing");
  return {
    needed: true,
    migrationSql: migrationSql.replace(anchor, "CREATE TABLE IF NOT EXISTS public.platform_subscription_offers ("),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [schemaPath, migrationPath] = process.argv.slice(2);
  if (!schemaPath || !migrationPath) throw new Error("usage: solo-beta-migration-recovery <schema-dump> <migration>");
  const result = recoverSoloBetaMigration(readFileSync(schemaPath, "utf8"), readFileSync(migrationPath, "utf8"));
  if (result.needed) {
    writeFileSync(migrationPath, result.migrationSql);
    console.log("Solo Beta migration recovery: validated the existing offer contract and transformed only its create statement.");
  } else {
    console.log("Solo Beta migration recovery: no pre-existing offer table; canonical migration remains unchanged.");
  }
}