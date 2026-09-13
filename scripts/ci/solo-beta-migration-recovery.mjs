import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SOLO_BETA_MIGRATION_SHA256 = "c613e2ec559f8ccefd8b8a58efb96df055dee7bc7ae42b0bfe6884d429b386a6";

const requiredTables = {
  platform_subscription_offers: ["offer_code text", "plan_id uuid", "account_type text", "provider_mode text", "stripe_account text", "unit_amount_cents integer", "currency text", "billing_interval text", "interval_count integer", "trial_days integer", "status text"],
  solo_beta_enrollments: ["user_id uuid", "offer_code text", "state text", "checkout_attempt integer", "stripe_customer_id text", "checkout_session_id text", "stripe_subscription_id text", "tenant_id uuid", "reference_id uuid"],
  solo_beta_fulfillment_receipts: ["event_id text", "user_id uuid", "tenant_id uuid", "subscription_id uuid", "offer_code text", "outcome text", "reference_id uuid"],
};

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tableBlock(schemaSql, table) {
  const name = escapeRegex(table);
  const match = schemaSql.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+(?:"public"|public)\\.(?:"${name}"|${name})\\s*\\(([\\s\\S]*?)\\);`, "i"));
  return match?.[1] ?? null;
}

function hasColumn(block, declaration) {
  const [column, ...typeParts] = declaration.split(" ");
  const type = typeParts.join("\\s+");
  return new RegExp(`(?:"${escapeRegex(column)}"|${escapeRegex(column)})\\s+${type}\\b`, "i").test(block);
}

export function recoverSoloBetaMigration(schemaSql, migrationSql, expectedHash = SOLO_BETA_MIGRATION_SHA256) {
  const offers = tableBlock(schemaSql, "platform_subscription_offers");
  if (!offers) return { needed: false, migrationSql };

  for (const [table, columns] of Object.entries(requiredTables)) {
    const block = tableBlock(schemaSql, table);
    if (!block) continue;
    const missing = columns.filter((column) => !hasColumn(block, column));
    if (missing.length) throw new Error(`solo_beta_recovery_schema_mismatch:${table}:${missing.join(",")}`);
  }

  const digest = createHash("sha256").update(migrationSql).digest("hex");
  if (expectedHash && digest !== expectedHash) throw new Error("solo_beta_recovery_source_digest_mismatch");

  const replacements = [
    ["CREATE TABLE public.platform_subscription_offers (", "CREATE TABLE IF NOT EXISTS public.platform_subscription_offers ("],
    ["CREATE TABLE public.solo_beta_enrollments (", "CREATE TABLE IF NOT EXISTS public.solo_beta_enrollments ("],
    ["CREATE UNIQUE INDEX solo_beta_enrollments_customer_uidx", "CREATE UNIQUE INDEX IF NOT EXISTS solo_beta_enrollments_customer_uidx"],
    ["CREATE UNIQUE INDEX solo_beta_enrollments_session_uidx", "CREATE UNIQUE INDEX IF NOT EXISTS solo_beta_enrollments_session_uidx"],
    ["CREATE UNIQUE INDEX solo_beta_enrollments_subscription_uidx", "CREATE UNIQUE INDEX IF NOT EXISTS solo_beta_enrollments_subscription_uidx"],
    ["CREATE TABLE public.solo_beta_fulfillment_receipts (", "CREATE TABLE IF NOT EXISTS public.solo_beta_fulfillment_receipts ("],
  ];

  let patched = migrationSql;
  for (const [from, to] of replacements) {
    if (!patched.includes(from)) throw new Error("solo_beta_recovery_transform_anchor_missing");
    patched = patched.replace(from, to);
  }
  return { needed: true, migrationSql: patched };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [schemaPath, migrationPath] = process.argv.slice(2);
  if (!schemaPath || !migrationPath) throw new Error("usage: solo-beta-migration-recovery <schema-dump> <migration>");
  const result = recoverSoloBetaMigration(readFileSync(schemaPath, "utf8"), readFileSync(migrationPath, "utf8"));
  if (result.needed) {
    writeFileSync(migrationPath, result.migrationSql);
    console.log("Solo Beta migration recovery: validated existing catalog and applied idempotent runtime transform.");
  } else {
    console.log("Solo Beta migration recovery: no pre-existing catalog object; canonical migration remains unchanged.");
  }
}