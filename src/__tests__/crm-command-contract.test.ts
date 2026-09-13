import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20270128200000_governed_crm_contact_company_commands.sql",
  "utf8",
);

describe("canonical CRM contact/company command", () => {
  it("accepts identity only from the service action door and revalidates the actor-tenant bond", () => {
    expect(sql).toMatch(/_tenant_id\s+uuid/i);
    expect(sql).toMatch(/_actor_id\s+uuid/i);
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("auth.uid() is not null");
    expect(sql).toMatch(/tm\.tenant_id\s*=\s*v_tenant\s+and\s+tm\.user_id\s*=\s*v_actor/i);
    expect(sql).toContain("tm.status = 'active'");
  });

  it("fails closed on authentication, tenant, role, target, and stale records", () => {
    for (const invariant of [
      "CRM_AUTH_REQUIRED",
      "CRM_TENANT_REQUIRED",
      "CRM_FORBIDDEN",
      "CRM_CONTACT_NOT_FOUND",
      "CRM_BUSINESS_NOT_FOUND",
      "CRM_VERSION_CONFLICT",
    ]) {
      expect(sql).toContain(invariant);
    }
    expect(sql).toContain("tm.role in ('owner','admin')");
    expect(sql).toContain("tm.role = 'coach'");
    expect(sql).toMatch(/c\.tenant_id\s*=\s*v_tenant/i);
    expect(sql).toMatch(/b\.tenant_id\s*=\s*v_tenant/i);
  });

  it("uses tenant-bound idempotency and refuses changed-payload replay", () => {
    expect(sql).toContain("primary key (tenant_id, actor_user_id, idempotency_key)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("CRM_IDEMPOTENCY_REUSE");
    expect(sql).toContain("command_hash");
    expect(sql).toContain("'replayed', true");
  });

  it("executes only the reversible contact, company, task, and activity operations in these slices", () => {
    for (const action of [
      "contact.create",
      "contact.update",
      "contact.archive",
      "contact.restore",
      "contact.link_company",
      "contact.unlink_company",
      "company.create",
      "company.update",
      "company.archive",
      "company.restore",
      "task.create",
      "task.update",
      "task.assign",
      "task.reschedule",
      "task.complete",
      "task.reopen",
      "activity.log",
      "deal.create",
      "deal.update",
      "deal.move",
      "deal.close",
      "deal.reopen",
    ]) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(sql).not.toMatch(/delete\s+from\s+public\.(clients|businesses)/i);
    expect(sql).toContain("CRM_ACTION_UNAVAILABLE");
    expect(sql).toContain("public.execute_pipeline_deal_move_as_paige(");
    expect(sql).toContain("CRM_CONTACT_ALREADY_EXISTS");
    expect(sql).toContain("insert into public.client_notes");
    expect(sql).not.toContain("insert into public.communication_log");
  });

  it("extends rather than duplicates the canonical Pipeline command core", () => {
    expect(sql).toContain("create or replace function public.configure_tenant_pipeline_core_identity(");
    expect(sql).toContain("public.execute_pipeline_deal_move_as_paige(");
    expect(sql).toContain("_actor_kind='paige' and auth.role() is distinct from 'service_role'");
    for (const field of ["value_cents", "currency", "expected_close_date", "offer_type", "owner_user_id", "contact_client_id"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("app.crm_approval_channel");
  });

  it("returns durable readback and reuses the canonical receipt/Rail seam", () => {
    expect(sql).toContain("'readback'");
    expect(sql).toContain("public.record_capability_run(");
    expect(sql).toContain("'capability_succeeded'");
    expect(sql).toContain("receipt_recorded");
    expect(sql).toContain("Receipt failure aborts the transaction");
    expect(sql).not.toContain("capability_completed_unrecorded");
    expect(sql).toContain("public.crm_command_results");
  });

  it("keeps command results private and exposes only the internal executor", () => {
    expect(sql).toMatch(/alter table public\.crm_command_results enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.crm_command_results from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.execute_crm_command\(uuid,uuid,jsonb,text\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.execute_crm_command\(uuid,uuid,jsonb,text\) to service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.execute_crm_command\(uuid,uuid,jsonb,text\) to authenticated/i);
  });
});
