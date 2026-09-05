import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/comms-a2p-register/index.ts", "utf8");
const hook = readFileSync("src/solo/data/useSoloA2PProvider.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261201000600_solo_a2p_registration_product.sql", "utf8");
const events = readFileSync("supabase/functions/twilio-a2p-events/index.ts", "utf8");

describe("Solo A2P registration product contract", () => {
  it("resolves the active workspace on the server and treats the browser tenant only as a stale-workspace precondition", () => {
    expect(edge).toContain('client.rpc("current_user_tenant_id")');
    expect(edge).toContain('body.expected_tenant_id !== tenantId');
    expect(edge).toContain('"WORKSPACE_CHANGED"');
    expect(hook).toContain("expected_tenant_id: tenant");
    expect(hook).toContain("epoch.current !== requestEpoch");
  });

  it("selects and associates only an active SMS number owned by the resolved tenant", () => {
    expect(edge).toContain('.eq("tenant_id", ctx.tenantId).eq("status", "active")');
    expect(edge).toContain('record(n.capabilities).sms === true');
    expect(edge).toContain('"NUMBER_NOT_OWNED"');
    expect(migration).toContain("foreign key (selected_phone_number_id, tenant_id)");
    expect(migration).toContain("references public.tenant_phone_numbers(id, tenant_id)");
    expect(migration).toContain("number_registration_status");
    expect(events).toContain('txt(data.accountsid) !== subaccount.twilio_subaccount_sid');
    expect(events).toContain('txt(data.phonenumbersid) !== number.twilio_sid');
    expect(events).toContain('const status = NUMBER_EVENT_STATUS[eventType]');
    expect(events).toContain('data.failurereason || data.failureReason');
  });

  it("prevents duplicate provider creation and overlapping submits", () => {
    expect(edge).toContain('"AMBIGUOUS_EXISTING_REGISTRATION"');
    expect(edge).toContain('"AMBIGUOUS_EXISTING_PROFILE"');
    expect(edge).toContain('claim_tenant_a2p_operation');
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'operation_in_progress'");
    expect(migration).toContain("unique (tenant_id,provider_event_id)");
    expect(migration).toContain("apply_tenant_a2p_number_event");
  });

  it("does not fabricate compliance categories or send proof messages", () => {
    expect(edge).not.toContain('["CUSTOMER_CARE"]');
    expect(edge).not.toContain('["WEB_FORM"]');
    expect(edge).not.toContain("/Messages.json");
    expect(events).not.toContain("/Messages.json");
    expect(edge).toContain('"PROFILE_INCOMPLETE"');
    expect(edge).toContain('"PROFILE_UNSUPPORTED"');
  });

  it("keeps provider identifiers and sealed business values out of browser reads and Rail", () => {
    const browserGrant = migration.match(/grant select \(([\s\S]*?)\)\s+on public\.tenant_a2p_registrations to authenticated;/)?.[1] ?? "";
    expect(browserGrant).not.toMatch(/brand_sid|campaign_sid|messaging_service_sid|inquiry_id|operation_key/);
    expect(migration).toContain("Safe browser/PAIGE projection");
    expect(edge).toContain("read_tenant_business_registration_number");
    expect(migration).not.toContain("registration_number_last_4");
    expect(edge).not.toMatch(/registration_number_last_4/);
    expect(edge).not.toMatch(/raw_provider|provider_payload/);
    expect(events).toContain("secureEqual");
    expect(events).not.toContain("event_webhook_secret_hash: credentials.secret");
  });

  it("records bounded provider outcomes without credentials or raw payloads", () => {
    expect(edge).toContain("safeFailure");
    expect(migration).toContain("insert into public.paige_audit_log");
    expect(migration).toContain("'outcome'");
    expect(migration).not.toMatch(/auth_token|api_key_secret|raw_payload/);
  });
});
