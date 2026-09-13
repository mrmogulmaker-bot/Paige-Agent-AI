import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20270131000000_platform_promotional_solo_grant.sql",
  "utf8",
);
const recoveryMigration = readFileSync(
  "supabase/migrations/20270201000000_platform_promotional_solo_grant_recovery.sql",
  "utf8",
);
const contractWorkflow = readFileSync(
  ".github/workflows/paige-spine-contract.yml",
  "utf8",
);

describe("platform promotional Solo grant contract", () => {
  it("is a service-only, platform-owner-authorized lane", () => {
    expect(migration).toContain("NOT public.is_platform_owner(_operator_user_id)");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.platform_grant_promotional_solo(uuid, uuid, text, text, text)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("is tenant-generic and cannot create unsupported topology", () => {
    expect(migration).toContain("'active', 'standalone'");
    expect(migration).toContain("WHERE p.slug = 'solo' AND p.is_active");
    expect(migration).toContain("promotional_solo_existing_topology_conflict");
    expect(migration).not.toMatch(/mrmogulmaker|antonio daniel|academy/i);
  });

  it("never falls back to the legacy free trial or a paid provider binding", () => {
    expect(migration).not.toContain(
      "PERFORM public.ensure_provisioning_entitlements(_recipient_user_id)",
    );
    expect(migration).toContain("SET plan_slug = 'solo', status = 'active', trial_ends_at = NULL");
    expect(migration).toContain("promotional_solo_paid_enrollment_conflict");
    expect(migration).toContain("promotional_solo_provider_binding_conflict");
    expect(migration).not.toMatch(/stripe\.products\.create|stripe\.prices\.create|checkout\.sessions\.create/i);
  });

  it("makes retries converge one workspace, subscription, audit, and event", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("ON CONFLICT ON CONSTRAINT tenant_members_tenant_user_unique");
    expect(migration).not.toContain("min(ps.id)");
    expect(recoveryMigration).toContain("CREATE OR REPLACE FUNCTION public.platform_grant_promotional_solo");
    expect(recoveryMigration).toContain("TO service_role");
    expect(migration).toContain("platform_subscriptions_promotional_grant_tenant_uidx");
    expect(migration).toContain("paige_audit_log_promotional_solo_grant_uidx");
    expect(migration).toContain("platform_usage_events_promotional_solo_grant_uidx");
    expect(migration).toContain("ON CONFLICT DO NOTHING");
  });

  it("runs the behavioral contract after a fresh database replay", () => {
    expect(contractWorkflow).toContain(
      "supabase test db supabase/tests/promotional_solo_grant.sql",
    );
  });
});