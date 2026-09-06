import fs from "node:fs";
import assert from "node:assert/strict";
const file =
  "supabase/migrations/20261224000001_solo_pipeline_command_desk.sql";
const sql = fs.readFileSync(file, "utf8");
const has = (pattern, message) => assert.match(sql, pattern, message);
has(
  /create table if not exists public\.pipeline_deal_outcomes/i,
  "durable outcomes table",
);
has(
  /outcome_type in \('won','lost','not_fit','closed_without_decision','reopened'\)/i,
  "distinct outcome vocabulary",
);
has(
  /_tenant uuid:=coalesce\(_tenant_id,public\.current_user_tenant_id\(\)\)/i,
  "server-resolved tenant with refusal-only wrapper input",
);
has(/_tenant=public\.current_user_tenant_id\(\)/i, "cross-tenant guard");
has(/public\.is_tenant_admin\(_tenant\)/i, "role guard");
has(
  /_actor_kind='paige' then raise exception 'PIPELINE_GOVERNED_EXECUTOR_REQUIRED'/i,
  "generic core cannot bypass governed PAIGE executor",
);
has(/PIPELINE_VERSION_CONFLICT/i, "stale-write guard");
has(
  /automation_rules.*stage_automation_rules/is,
  "source-backed automation impact read",
);
has(
  /PIPELINE_AUTOMATION_BINDING_REQUIRED/i,
  "unbound active automation fails closed server-side",
);
has(
  /_stage\.move_policy='approval'.*PIPELINE_APPROVAL_REQUIRED/is,
  "outcome and reopen respect approval policy",
);
has(
  /lock table public\.stage_automation_rules in share mode/i,
  "automation rule changes cannot race a move",
);
has(
  /assert_pipeline_automation_not_active/i,
  "all deal movement paths share the automation guard",
);
has(/pg_advisory_xact_lock/i, "serialized idempotency");
has(/pipeline_command_results/i, "durable replay");
has(
  /_stage\.stage_type in \('won','lost'\).*outcome_required/is,
  "closing stage refuses implicit outcome",
);
has(
  /outcome','approval_required'.*No separate Pipeline approval was created/is,
  "approval-stage board move refuses without a parallel queue",
);
has(
  /create or replace function public\.execute_pipeline_deal_move_as_paige/i,
  "canonical PAIGE move executor preserved",
);
has(
  /_target\.stage_type in \('won','lost'\).*PIPELINE_OUTCOME_REQUIRED/is,
  "PAIGE executor cannot bypass explicit outcomes",
);
has(
  /_target\.move_policy='approval' and _approval_channel<>'operator_card'/is,
  "approval target still requires operator-card claim",
);
has(
  /coalesce\(_deal\.status,'open'\)<>'open'.*PIPELINE_DEAL_ALREADY_CLOSED/is,
  "closed deals cannot be moved twice",
);
has(/insert into public\.deal_activities/i, "activity evidence");
has(/record_rail_event/i, "Rail evidence");
has(/insert into public\.audit_logs/i, "audit evidence");
has(
  /revoke all on public\.pipeline_deal_outcomes from public,anon,authenticated/i,
  "no browser table mutation",
);
has(
  /alter function public\.configure_tenant_pipeline_core_identity.*rename to configure_tenant_pipeline_core_identity_pre_command_desk/is,
  "canonical core preserved",
);
has(
  /create or replace function public\.configure_tenant_pipeline_core_identity/i,
  "canonical owner core extended",
);
has(
  /configure_tenant_pipeline_core_identity_pre_command_desk\(_tenant_id,_command,_idempotency_key,_actor_kind\)/i,
  "non-deal commands delegate without duplication",
);
has(
  /revoke all on function public\.configure_tenant_pipeline_core_identity\(uuid,jsonb,text,text\) from public,anon,authenticated/i,
  "core remains wrapper-only",
);
assert.doesNotMatch(
  sql,
  /tenant_id\s*=\s*['"][0-9]/i,
  "no tenant fixture branch",
);
assert.doesNotMatch(
  sql,
  /insert into public\.pipeline_move_approvals/i,
  "no parallel Pipeline approval queue",
);
assert.doesNotMatch(
  sql,
  /\bLead\b|\bQualified\b|Enrollment Call|In Delivery/i,
  "no fixed stage taxonomy",
);
console.log("Pipeline Command Desk SQL contract: PASS");
