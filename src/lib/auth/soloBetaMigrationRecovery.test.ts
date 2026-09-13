import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recoverSoloBetaMigration } from "../../../scripts/ci/solo-beta-migration-recovery.mjs";

const migration = readFileSync("supabase/migrations/20270118010000_solo_beta_atomic_fulfillment.sql", "utf8");
const schema = `
CREATE TABLE public.platform_subscription_offers (
    offer_code text NOT NULL,
    plan_id uuid NOT NULL,
    account_type text NOT NULL,
    provider_mode text NOT NULL,
    stripe_account text NOT NULL,
    stripe_product_id text,
    stripe_price_id text,
    unit_amount_cents integer NOT NULL,
    currency text NOT NULL,
    billing_interval text NOT NULL,
    interval_count integer NOT NULL,
    trial_days integer NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_pkey PRIMARY KEY (offer_code);
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.platform_subscription_plans(id);
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_account_type_check CHECK ((account_type = 'standalone'::text));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_provider_mode_check CHECK ((provider_mode = 'test'::text));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_stripe_account_check CHECK ((stripe_account = 'v2'::text));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_unit_amount_cents_check CHECK ((unit_amount_cents = 7450));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_currency_check CHECK ((currency = 'usd'::text));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_billing_interval_check CHECK ((billing_interval = 'month'::text));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_interval_count_check CHECK ((interval_count = 1));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_trial_days_check CHECK ((trial_days = 30));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_status_check CHECK ((status = ANY (ARRAY['configuration_required'::text, 'test_ready'::text, 'retired'::text])));
ALTER TABLE ONLY public.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_check CHECK (((status <> 'test_ready'::text) OR ((stripe_product_id IS NOT NULL) AND (stripe_price_id IS NOT NULL))));
`;

describe("Solo Beta production migration recovery", () => {
  it("leaves a catalog with no pre-applied offer table unchanged", () => {
    expect(recoverSoloBetaMigration("", migration).needed).toBe(false);
  });

  it("validates the full existing offer contract and transforms only that create statement", () => {
    const result = recoverSoloBetaMigration(schema, migration);
    expect(result.needed).toBe(true);
    expect(result.migrationSql).toContain("CREATE TABLE IF NOT EXISTS public.platform_subscription_offers");
    expect(result.migrationSql).toContain("CREATE TABLE public.solo_beta_enrollments");
    expect(result.migrationSql).not.toContain("CREATE TABLE IF NOT EXISTS public.solo_beta_enrollments");
    expect(result.migrationSql).toContain("CREATE TABLE public.solo_beta_fulfillment_receipts");
    expect(result.migrationSql).not.toContain("CREATE TABLE IF NOT EXISTS public.solo_beta_fulfillment_receipts");
    expect(result.migrationSql).toContain("CREATE UNIQUE INDEX solo_beta_enrollments_customer_uidx");
    expect(result.migrationSql).not.toContain("CREATE UNIQUE INDEX IF NOT EXISTS solo_beta_enrollments_customer_uidx");
    expect(result.migrationSql).toContain("CREATE OR REPLACE FUNCTION public.solo_beta_fulfill_checkout");
  });

  it("fails closed when a required offer column has an incompatible type", () => {
    const incompatible = schema.replace("unit_amount_cents integer NOT NULL", "unit_amount_cents text NOT NULL");
    expect(() => recoverSoloBetaMigration(incompatible, migration)).toThrow("column:unit_amount_cents");
  });

  it("fails closed when a required default is absent", () => {
    const incompatible = schema.replace("created_at timestamp with time zone DEFAULT now() NOT NULL", "created_at timestamp with time zone NOT NULL");
    expect(() => recoverSoloBetaMigration(incompatible, migration)).toThrow("column:created_at");
  });

  it("fails closed when a primary-key or billing check constraint is absent", () => {
    const noPrimaryKey = schema.replace(/ALTER TABLE ONLY public\.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_pkey[^;]+;\n/, "");
    const noTrialCheck = schema.replace(/ALTER TABLE ONLY public\.platform_subscription_offers ADD CONSTRAINT platform_subscription_offers_trial_days_check[^;]+;\n/, "");
    expect(() => recoverSoloBetaMigration(noPrimaryKey, migration)).toThrow("constraint:platform_subscription_offers_pkey");
    expect(() => recoverSoloBetaMigration(noTrialCheck, migration)).toThrow("constraint:platform_subscription_offers_trial_days_check");
  });

  it("refuses to transform an unreviewed migration body", () => {
    expect(() => recoverSoloBetaMigration(schema, `${migration}\n-- drift`)).toThrow("solo_beta_recovery_source_digest_mismatch");
  });
});