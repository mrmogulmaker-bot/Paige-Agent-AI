import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recoverSoloBetaMigration } from "../../../scripts/ci/solo-beta-migration-recovery.mjs";

const migration = readFileSync("supabase/migrations/20270118010000_solo_beta_atomic_fulfillment.sql", "utf8");
const schema = migration
  .replaceAll("CREATE TABLE public.", "CREATE TABLE public.")
  .replaceAll("timestamptz", "timestamp with time zone");

describe("Solo Beta production migration recovery", () => {
  it("leaves a catalog with no pre-applied offer table unchanged", () => {
    expect(recoverSoloBetaMigration("", migration).needed).toBe(false);
  });

  it("validates pre-existing tables and makes only creation statements idempotent", () => {
    const result = recoverSoloBetaMigration(schema, migration);
    expect(result.needed).toBe(true);
    expect(result.migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.platform_subscription_offers");
    expect(result.migrationSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS solo_beta_enrollments_customer_uidx");
    expect(result.migrationSql).toContain("CREATE OR REPLACE FUNCTION public.solo_beta_fulfill_checkout");
  });

  it("fails closed when an existing table has an incompatible shape", () => {
    const incompatible = schema.replace("unit_amount_cents integer", "unit_amount_cents text");
    expect(() => recoverSoloBetaMigration(incompatible, migration)).toThrow("solo_beta_recovery_schema_mismatch");
  });

  it("refuses to transform an unreviewed migration body", () => {
    expect(() => recoverSoloBetaMigration(schema, `${migration}\n-- drift`)).toThrow("solo_beta_recovery_source_digest_mismatch");
  });
});