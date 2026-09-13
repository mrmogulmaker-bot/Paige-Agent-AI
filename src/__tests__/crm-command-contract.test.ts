import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20270204000000_governed_crm_contact_company_commands.sql",
  "utf8",
);

describe("canonical CRM contact/company command", () => {
  it("accepts identity only from the service action door and revalidates the actor-tenant bond", () => {
    expect(sql).toMatch(/_tenant_id\s+uuid/i);
    expect(sql).toMatch(/_actor_id\s+uuid/i);
    expect(sql).toContain("auth.jwt()->>'role','') <> 'service_role'");
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
      "CRM_COMPANY_OWNER_SETUP_REQUIRED",
      "CRM_VERSION_CONFLICT",
    ]) {
      expect(sql).toContain(invariant);
    }
    expect(sql).toContain("tm.role in ('owner','admin')");
    expect(sql).toContain("tm.role = 'coach'");
    expect(sql).toMatch(/c\.tenant_id\s*=\s*v_tenant/i);
    expect(sql).toMatch(/b\.tenant_id\s*=\s*v_tenant/i);
  });

  it("revalidates active account, membership, autonomy, and approval authority inside the write transaction", () => {
    expect(sql).toMatch(/from public.profiles profile_row where profile_row.user_id=_actor_id for update/i);
    expect(sql).toContain("where tm.tenant_id=_tenant_id and tm.user_id=_actor_id and tm.status='active' and tm.role in ('owner','admin','coach') for update");
    expect(sql).toContain("tenant_tool_autonomy_serialize_writes");
    expect(sql).toContain("'tool-autonomy:'||_tenant_id::text||':'||v_capability");
    expect(sql).toContain("CRM_ACTIVE_ACCOUNT_CHANGED");
    expect(sql).toContain("CRM_TENANT_SUSPENDED");
    expect(sql).toContain("tenant_row.status in ('trial','active','past_due') for update");
    expect(sql).toContain("CRM_AUTHORITY_REQUIRED");
    expect(sql).toContain("CRM_AUTONOMY_REFUSED");
    expect(sql).toContain("CRM_APPROVAL_REQUIRED");
  });

  it("uses tenant-bound idempotency and refuses changed-payload replay", () => {
    expect(sql).toContain("primary key (tenant_id, actor_user_id, idempotency_key)");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("CRM_IDEMPOTENCY_REUSE");
    expect(sql).toContain("command_hash");
    expect(sql).toContain("'replayed',true");
    expect(sql).toContain("public.crm_effective_command(_command)");
    expect(sql).toContain("public.read_crm_command_result");
    expect(sql).toContain("v_cached.command_hash not in (v_operator_hash,v_standing_hash)");
    expect(sql).toContain("public.crm_actor_can_access_record(_tenant_id,_actor_id,v_record_kind,v_record_id)");
    expect(sql).toContain("return public.read_crm_command_result(_tenant_id,_actor_id,_command,_idempotency_key)");
    expect(sql).toContain("CRM_TAGS_INVALID");
    expect(sql).toContain("public.crm_tags_are_valid(patch->'tags')");
    expect(sql).toContain("Relationship and primary-state changes remain");
  });

  it("covers reversible and preview-bound high-risk CRM operations without external sends", () => {
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
      "task.cancel",
      "activity.log",
      "deal.create",
      "deal.update",
      "deal.move",
      "deal.close",
      "deal.reopen",
      "contact.assign_coach",
      "contact.assign_owner",
      "contact.merge",
      "contact.hard_delete",
      "contact.bulk_update",
      "task.delete",
      "deal.assign_owner",
      "deal.assign_contact",
      "deal.delete",
    ]) {
      expect(sql).toContain(`'${action}'`);
    }
    expect(sql).toContain("public.preview_crm_command");
    expect(sql).toContain("CRM_PREVIEW_INVALID_OR_EXPIRED");
    expect(sql).toContain("cached.consumed_at is not null and cached.result is not null");
    expect(sql).toContain("v_contact.merged_into_contact_id is not null");
    expect(sql).toContain("CRM_MERGE_IDENTITY_RESOLUTION_REQUIRED");
    expect(sql).toContain("if not v_is_admin then raise exception 'CRM_FORBIDDEN'");
    expect(sql).toMatch(/b\.is_active is true\s+for update/i);
    expect(sql).toContain("CRM_ABSENCE_READBACK_FAILED");
    expect(sql).toContain("paige_invoices_tenant_deal_crm_fk");
    expect(sql).toContain("CRM_CROSS_TENANT_DEPENDENCY");
    expect(sql).toContain("CRM_DEAL_PATCH_REQUIRED");
    expect(sql).toMatch(/update public\.paige_invoices set deal_id=null[^;]+tenant_id=_tenant_id/i);
    expect(sql).toContain("left join public.clients target_client");
    expect(sql).toContain("tags=coalesce((select pg_catalog.array_agg");
    for (const dependency of ["paige_invoices", "stage_automation_events", "pipeline_move_approvals", "pipeline_deal_outcomes", "deal_activities"]) expect(sql).toContain(dependency);
    expect(sql).toContain("CRM_ACTION_UNAVAILABLE");
    expect(sql).toContain("public.execute_pipeline_deal_move_as_paige(");
    expect(sql).toContain("CRM_CONTACT_ALREADY_EXISTS");
    expect(sql).toContain("p_channel := 'api'");
    expect(sql).toContain("v_approval_channel is null or v_approval_channel not in");
    expect(sql).toContain("insert into public.client_notes");
    expect(sql).not.toContain("insert into public.communication_log");
  });

  it("extends rather than duplicates the canonical Pipeline command core", () => {
    expect(sql).toContain("create or replace function public.configure_tenant_pipeline_core_identity(");
    expect(sql).toContain("public.execute_pipeline_deal_move_as_paige(");
    expect(sql).toContain("_actor_kind='paige' and coalesce(auth.jwt()->>'role','') <> 'service_role'");
    for (const field of ["value_cents", "currency", "expected_close_date", "offer_type", "owner_user_id", "contact_client_id"]) {
      expect(sql).toContain(field);
    }
    expect(sql).toContain("app.crm_approval_channel");
    expect(sql).toContain("effective_command jsonb;");
    expect(sql).toContain("effective_command:=public.crm_effective_command(_command);");
    expect(sql).toContain("convert_to(effective_command::text");
  });

  it("returns durable readback and reuses the canonical receipt/Rail seam", () => {
    expect(sql).toContain("'readback'");
    expect(sql).toContain("public.record_capability_run(");
    expect(sql).toContain("'capability_succeeded'");
    expect(sql).toContain("receipt_recorded");
    expect(sql).toContain("Receipt failure aborts the transaction");
    expect(sql).toContain("CRM_RECEIPT_CAPABILITY_MISSING");
    expect(sql).not.toContain("replace(a,'.','_')");
    expect(sql).not.toContain("capability_completed_unrecorded");
    expect(sql).toContain("public.crm_command_results");
  });

  it("keeps command results private and exposes only the internal executor", () => {
    expect(sql).toMatch(/alter table public\.crm_command_results enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.crm_command_results from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.execute_crm_command\(uuid,uuid,jsonb,text\) from public,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.execute_crm_command\(uuid,uuid,jsonb,text\) to service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.execute_crm_command\(uuid,uuid,jsonb,text\) to authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.read_crm_command_result\(uuid,uuid,jsonb,text\) from public,anon,authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.read_crm_command_result\(uuid,uuid,jsonb,text\) to service_role/i);
  });
});
