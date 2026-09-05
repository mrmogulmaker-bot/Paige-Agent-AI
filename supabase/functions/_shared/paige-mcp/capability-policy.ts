/**
 * THE INBOUND MCP CAPABILITY POLICY — one owned mapping, so two naming systems stop drifting.
 *
 * WHY THIS FILE EXISTS.
 * `action-risk.ts` is the platform's one classifier and it holds 62 canonical keys. `paige-mcp`
 * registers 119 tools. The intersection is EXACTLY ONE — `delegate_to_subagent`. Chat says
 * `crm_create_contact`; MCP says `create_contact`. Chat says `crm_delete_contact`; MCP says
 * `bulk_delete_contacts`. So running the MCP surface through `classifyAction` unchanged returns
 * `unclassified` for 118 of 119 tools, which is refuse-by-design — correct as a default, useless as
 * a policy, and indistinguishable from "we never looked".
 *
 * This table is the correction, and it is a MAPPING rather than a second vocabulary. Every entry
 * names the CANONICAL `action-risk.ts` key for the act. Where a canonical twin already exists the
 * entry points at it; where none existed, the key was added to `action-risk.ts` itself. There is
 * one classifier and one namespace, and this file is how the MCP door reaches them.
 *
 * EFFECT IS VERIFIED, NEVER INFERRED FROM THE NAME.
 * Every `effect` below was set by reading the handler body and following its helpers. That is not
 * ceremony: 20 tools in this file mutate behind read-looking names — `handle_data_subject_request`
 * (GDPR erasure), `suspend_tenant`, `confirm_proposal`, `append_client_memory` — and 4 read-only
 * tools carry write-looking names (`get_workflow_run`, `get_skill_run`, `list_communication_log`,
 * `list_email_send_log`). A name-derived policy gets both wrong, and the expensive direction is a
 * mutation declared `read`: `governedExecution.ts` returns before classification, clamp, approval
 * and outcome for a genuine read, so a mis-declared write executes ungoverned. The seam says so
 * itself, and cannot catch it.
 *
 * DENY BY DEFAULT.
 * `lookupMcpCapability` returns undefined for anything absent, and the adapter refuses on undefined.
 * A tool added without an entry does not quietly inherit permissive behaviour — it stops working,
 * and `scripts/ci/mcp-governed-door-lint.mjs` fails the build before it ever reaches production.
 */

/**
 * What the act actually does, verified from the handler. The eleven categories are finer than
 * `action-risk.ts`'s three verdicts on purpose: the classifier decides whether an approval is
 * required, while this records WHY, which is what an operator reading an audit row needs.
 */
export type McpRiskCategory =
  | "read"           // no state change and no external call
  | "low_mutation"   // writes tenant business data with limited blast radius
  | "consequential"  // writes others depend on, bulk operations, workflow/skill dispatch
  | "destructive"    // deletes or irreversibly removes
  | "external_send"  // email/SMS/anything leaving the system
  | "provider"       // calls or dispatches to an external provider
  | "privacy"        // data-subject request, export, erasure
  | "billing"        // invoices, payments, money
  | "access"         // roles, invitations, credentials, connections, workspace switching
  | "availability"   // suspension, platform announcements, feature flags, branding
  | "owner_only";    // an operator-settings decision no other actor may take

export type McpCapability = {
  /** The canonical `action-risk.ts` key for this act. One namespace, not a parallel one. */
  canonical: string;
  /** VERIFIED from the handler body. Never set this from the tool's name. */
  effect: "read" | "mutate";
  /** Why, in the operator's terms. Drives nothing on its own — the canonical key drives the gate. */
  category: McpRiskCategory;
  /** `file:line` of the write, send or provider call that justifies `effect`, or what was checked
   *  and found absent for a read. Present so a reviewer can re-verify without re-reading 5,691
   *  lines, and so a wrong verdict is falsifiable rather than merely asserted. */
  evidence: string;
};

/** The number of tools registered in `paige-mcp/index.ts`. Asserted by CI rather than written in
 *  prose, because two comments in this repo said 117 while the real number was 119 — a count in a
 *  sentence rots silently. */
export const MCP_TOOL_COUNT = 119;

/**
 * TOOL NAME → CAPABILITY. Filled from handler verification; see the module header.
 * Keys are the exact registered `mcp.tool("<name>")` strings.
 */
export const MCP_CAPABILITY_POLICY: Readonly<Record<string, McpCapability>> = {
  // ── READS — no state change and no outbound call. Verified by grepping each handler's span
  // for write verbs and provider calls and finding none.
  bulk_delete_contacts: {
    canonical: "crm_contact_deletion_preview",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:1817-1892 — handler is preview-only. Reads clients at :1833 (.select id,tenant_id,name,email .in(contact_ids)), filters eligibility in JS. NO .delete()/.update() anywhere in the span. When confirm===true it writes ONE append-only audit row via audit() at :1874 (helper insert into paige_audit_log at :127) and then returns err() — nothing is destroyed. Inline comment at :1836-1856 documents the deletion was deliberately removed (issue #784) because a model-supplied `confirm` is not an approval.",
  },
  get_coach_performance: {
    canonical: "coach_performance_summary",
    effect: "read",
    category: "read",
    evidence: "index.ts:1210-1252 — five `.select()` calls (tenant_members guard 1222-1228, then profiles/clients/tasks×2/deals in Promise.all 1231-1237). No insert/update/upsert/delete, no write-RPC, no fetch(), no audit(). Next write in the file is line 1290 (a different tool).",
  },
  get_contact: {
    canonical: "crm_contact_record",
    effect: "read",
    category: "read",
    evidence: "index.ts:381-386 — one .select() on clients with .eq('account_number',…).eq('tenant_id', tenantId). Range 376-391 grepped: 0 write/send/rpc/audit hits. Only other call is externalActorDestination (index.ts:243) which .select()s tenants and calls canonical-app-url.ts, a pure string builder (0 write verbs).",
  },
  get_platform_metrics: {
    canonical: "platform_metrics",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4031-4039 — seven parallel count/head selects over tenants, clients, profiles, paige_workflow_runs, paige_pending_approvals, tenant_revenue_classification. No insert/update/delete, no rpc, no fetch, no audit().",
  },
  get_readiness_proposal: {
    canonical: "readiness_proposal_record",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4860-4866 — single admin.from(\"paige_readiness_proposals\").select(\"*\").eq(\"tenant_id\", tenantId).eq(\"id\", proposal_id).maybeSingle(). No write verb, no .rpc(), no fetch, no audit().",
  },
  get_skill_run: {
    canonical: "skill_execution_record",
    effect: "read",
    category: "read",
    evidence: "index.ts:3511-3519: one .select() on paige_skill_runs .eq('id', run_id).maybeSingle(). No insert/update/delete, no rpc, no fetch, no audit().",
  },
  get_social_accounts: {
    canonical: "social_account_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4975 — admin.rpc(\"get_social_presence_evidence\", { _tenant_id: tenant_id }). Followed into supabase/migrations/20261210000000_a_business_can_record_the_accounts_it_posts_from.sql:206 — declared LANGUAGE plpgsql STABLE SECURITY DEFINER, body only SELECTs and RETURN QUERYs (a STABLE function cannot write). No insert/update/delete, no fetch, no audit() in the handler.",
  },
  get_subaccount_metrics: {
    canonical: "agency_subaccount_metrics",
    effect: "read",
    category: "read",
    evidence: "index.ts:3755 admin.rpc('get_subaccount_metrics', {_child,_actor}); the SQL function (migrations/20260712300000_agency_mcp_guards.sql:73-90) is a parentage-gated jsonb_build_object of three SELECT count(*) aggregates over clients / paige_workflow_registry / tenant_members. No writes anywhere in the handler, no fetch, no audit().",
  },
  get_subagent_history: {
    canonical: "subagent_invocation_history",
    effect: "read",
    category: "read",
    evidence: "index.ts:3390-3401: one .select() on paige_subagent_invocations with order/limit and optional .eq('subagent_slug')/.eq('contact_id'). No insert/update/delete, no rpc, no fetch, no audit().",
  },
  get_systems_check_status: {
    canonical: "platform_systems_check_status",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:3972-3977 .from('paige_systems_check_run').select(...).is('tenant_id', null) and :3986-3989 .from('paige_systems_check_finding').select(...). Pure shaping/filtering after that (3993-4021). No insert/update/delete, no rpc, no fetch, no audit().",
  },
  get_tenant_domain_identity: {
    canonical: "tenant_domain_identity",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4121-4123 admin.rpc('resolve_tenant_domain_identity', { p_tenant_id }) — that function is declared STABLE SECURITY DEFINER and only RETURN QUERYs a SELECT (supabase/migrations/20260730180000_tenant_wildcard_web_hosts.sql), calling resolve_tenant_sender which is also STABLE (20260711310000_brand_schema_and_cascade.sql:301-303). No insert/update/delete/fetch/audit in the handler.",
  },
  get_workflow_run: {
    canonical: "workflow_execution_record",
    effect: "read",
    category: "read",
    evidence: "index.ts:874-879 — one .select() on paige_workflow_runs .eq('id', run_id).maybeSingle(). Range 871-884 grepped: 0 insert/update/delete/rpc/fetch/audit hits. Genuine read.",
  },
  list_admin_notifications: {
    canonical: "platform_notification_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:1334-1348 — single `.select(...)` on paige_admin_notifications with optional read_at/severity filters. No insert/update/delete/rpc/fetch, no audit().",
  },
  list_approval_comments: {
    canonical: "approval_comment_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:1035-1050 — single `.select(\"id, author_id, body, created_at\").eq(\"approval_id\", approval_id).order(...)` on paige_approval_comments. No insert/update/upsert/delete, no .rpc(), no fetch(), no audit() call in the handler (next write in the file is line 1095, a different tool).",
  },
  list_coaches: {
    canonical: "coach_roster",
    effect: "read",
    category: "read",
    evidence: "index.ts:1112-1144 — three `.select()` calls (user_roles 1112, profiles + clients in Promise.all 1116-1117) then in-memory aggregation. No insert/update/delete/rpc/fetch, no audit().",
  },
  list_communication_log: {
    canonical: "comms_touchpoint_history",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4242-4247 single .from('communication_log').select('*').eq('user_id', user_id) with optional channel filter. No insert/update/delete, no rpc, no fetch, no audit() — it reads the comms log, it does not write it.",
  },
  list_contact_businesses: {
    canonical: "crm_contact_business_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:1893-1939 — two .select() calls only: clients at :1905 and businesses at :1915. No insert/update/upsert/delete, no rpc, no fetch in the span. Cross-tenant guard present: `contact.tenant_id !== tenant_id → contact_not_found` (:1910).",
  },
  list_deals: {
    canonical: "deal_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:477-484 — one .select() on deals .eq('tenant_id', tenantId) plus optional arg filters. Range 473-502 grepped: 0 write/send/rpc/audit hits.",
  },
  list_email_domains: {
    canonical: "email_domain_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4143-4147 single .from('tenant_email_domains').select(...).eq('tenant_id', tenant_id).order(...). No writes, no rpc, no fetch, no audit().",
  },
  list_email_send_log: {
    canonical: "email_delivery_history",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4219-4226 single .from('email_send_log').select('*').eq('tenant_id', tenant_id) with optional contact_id/status/template_key filters. No insert/update/delete, no rpc, no fetch, no audit() — despite the 'log' verb it never writes a log row.",
  },
  list_email_templates: {
    canonical: "email_template_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:1393-1405 — single `.select(\"template_key, subject, preheader, variables, category, product_scope, active, notes, updated_at\")` with optional filters. No insert/update/upsert/delete/rpc/fetch, no audit().",
  },
  list_intake_submissions: {
    canonical: "crm_intake_submission_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2062-2093 — single .select() on paige_client_intake_submissions at :2073 with client_id/submitted_at filters. No write, no rpc, no fetch.",
  },
  list_journey_stages: {
    canonical: "journey_stage_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4340 admin.rpc('get_tenant_journey_stages', { _tenant: tenant_id }) — that function is LANGUAGE plpgsql STABLE SECURITY DEFINER and only RETURN QUERYs a UNION ALL SELECT (supabase/migrations/20260802160000_blueprints_slice2_tenant_aware_journey_write_model.sql). No writes, no fetch, no audit() in the handler.",
  },
  list_my_proposals: {
    canonical: "ingestion_proposal_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:3041-3055: one .select() on paige_ingestion_proposals with order/limit, filtered by actor.user_id from currentActor() (:3043-3049). No insert/update/upsert/delete, no rpc, no fetch, no audit() call in the handler.",
  },
  // CLEARS `MUTATION_VERB` BY ONE CHARACTER CLASS: "authorization" is not the banned segment
  // "author". `action-risk.ts` says that pattern "should err long" and it has been widened once
  // already. If it ever gains suffix matching, this key refuses a read that works today.
  list_payment_authorizations: {
    canonical: "crm_payment_authorization_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2094-2123 — single .select() on paige_payment_authorizations at :2105. No write, no rpc, no fetch. (Reads payment/plan data but performs no money operation.)",
  },
  list_pending_approvals: {
    canonical: "approval_queue_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:897-901 — one .select('*') on the paige_approval_queue_v view, ordered/limited, with filters taken only from args. Range 886-916 grepped: 0 insert/update/delete/rpc/fetch/audit hits. Genuine read.",
  },
  list_readiness_proposals: {
    canonical: "readiness_proposal_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4840-4848 — single admin.from(\"paige_readiness_proposals\").select(...).eq(\"tenant_id\", tenantId).order().limit() with optional status/contact_id filters. No write verb, no .rpc(), no fetch, no audit().",
  },
  list_signed_agreements: {
    canonical: "crm_signed_agreement_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2031-2061 — single .select() on paige_signed_agreements at :2042 with order/limit plus optional client_id and signed_at filters. No insert/update/delete, no rpc, no fetch.",
  },
  list_skills: {
    canonical: "skill_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:3432-3448: one .select() on paige_skills with .eq('status'), optional .eq('risk_level') and .or(ilike) filters, then an in-memory map. No insert/update/delete, no rpc, no fetch, no audit().",
  },
  list_stage_automation_events: {
    canonical: "stage_automation_event_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4783-4790 — single admin.from(\"stage_automation_events\").select(...).eq(\"tenant_id\", tenantId) with optional filters and a clamped limit. No write verb, no .rpc(), no fetch, no audit().",
  },
  list_stage_automation_rules: {
    canonical: "stage_automation_rule_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4683-4690 — single admin.from(\"stage_automation_rules\").select(...).eq(\"tenant_id\", tenantId) with optional filters. No write verb, no .rpc(), no fetch, no audit(). Tenant from actorTenantId() (index.ts:210).",
  },
  list_subaccounts: {
    canonical: "agency_subaccount_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:3696 admin.rpc('list_subaccounts', {_actor}); the SQL function (migrations/20260712300000_agency_mcp_guards.sql:58-70) is a pure SELECT over child tenants gated by parentage. Handler then filters/slices in memory (:3699-3700). No insert/update/delete, no fetch, no audit().",
  },
  list_subagent_proposals: {
    canonical: "subagent_proposal_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:3630 fetch to subagent-forge action:'list' → subagent-forge/index.ts:439-470 actionList is a .select() on paige_subagent_proposals plus quotaToday (:119, also a plain .select()); no insert/update on that branch. No audit() in the MCP handler. Tenant is resolved server-side at index.ts:3627 via actorTenantId() and enforced at subagent-forge:453-458.",
  },
  list_subagents: {
    canonical: "subagent_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:3216 callOrchestrator({action:'tool_search'}) → paige-orchestrator/index.ts:518 routes tool_search to searchSubagents (:120-169), which is a single .select() on paige_subagents; the tool_search branch returns before any logInvocation/updateInvocation write (those are on the tool_invoke path only, :557/:594). No audit() in the MCP handler.",
  },
  list_tasks: {
    canonical: "crm_task_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:592-599 — one .select() on tasks .eq('tenant_id', tenantId) plus optional arg filters. Range 588-615 grepped: 0 write/send/rpc/audit hits.",
  },
  list_team_members: {
    canonical: "member_roster",
    effect: "read",
    category: "read",
    evidence: "index.ts:1058-1080 — two `.select()` calls only (user_roles at 1059-1062, profiles at 1069-1071), then in-memory join. No insert/update/delete/rpc/fetch, no audit().",
  },
  list_tenants: {
    canonical: "platform_tenant_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:3814-3857 — only reads: .from('tenant_revenue_classification').select (3820-3823), .from('tenants').select (3828-3833), .from('tenant_revenue_classification').select (3847-3850). No insert/update/upsert/delete, no .rpc(), no fetch(), and no audit() call in the handler (audit() greps in this range return nothing for list_tenants).",
  },
  list_unassigned_queue: {
    canonical: "crm_unassigned_queue",
    effect: "read",
    category: "read",
    evidence: "index.ts:1316-1325 — single `.select(...).order(\"priority_rank\").limit(cap)` on paige_unassigned_queue. No insert/update/delete/rpc/fetch, no audit().",
  },
  list_workflow_runs: {
    canonical: "workflow_execution_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2154-2215 — registry lookup .select() at :2170 and runs .select() at :2176, then a JS tenant filter (registry tenant_id null-or-caller). No insert/update/delete, no rpc, no fetch.",
  },
  list_workflows: {
    canonical: "workflow_registry_list",
    effect: "read",
    category: "read",
    evidence: "index.ts:748-752 — one .select() on paige_workflow_registry, then .or('tenant_id.is.null,tenant_id.eq.<tenantId>') at index.ts:761. Range 740-766 grepped: 0 write/send/rpc/audit hits.",
  },
  lookup_contact_by_account_number: {
    canonical: "crm_contact_ref_lookup",
    effect: "read",
    category: "read",
    evidence: "index.ts:399-404 — one .select() on clients .eq('account_number',…).eq('tenant_id', tenantId), identical body to get_contact. Range 393-410 grepped: 0 write/send/rpc/audit hits.",
  },
  marketplace_browse: {
    canonical: "marketplace_catalog",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4638 — admin.rpc(\"marketplace_catalog_for_tenant\", {_tenant_id, _actor_user_id}). Followed into supabase/migrations/20260807020000_marketplace_tenant_tier_allowlist_visibility_slice2.sql:194 — the 2-arg overload is declared LANGUAGE plpgsql STABLE SECURITY DEFINER and its body is a single RETURN QUERY SELECT (a STABLE function cannot write). Remaining helpers marketplaceActorTenantId() (index.ts:278, selects only) and retainActiveMarketplaceTenant/resolveActiveMarketplaceTenant (_shared/marketplace-authority-containment.ts, pure string/UUID comparison) do not write. No audit().",
  },
  me_get_profile: {
    canonical: "me_profile",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4425 admin.from('clients').select('*').eq('id', me.id).maybeSingle(), where me.id comes from actorClient() (:4423). No writes, no rpc, no fetch, no audit().",
  },
  me_list_businesses: {
    canonical: "me_business_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4459-4466 — single admin.from(\"businesses\").select(...).eq(\"owner_user_id\", a.user_id).order(...). No insert/update/upsert/delete, no .rpc(), no fetch, no audit() call. Only helper used is currentActor() (index.ts:110, pure AsyncLocalStorage read).",
  },
  me_list_tasks: {
    canonical: "me_task_list",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4570-4577 — single admin.from(\"tasks\").select(...).eq(\"user_id\", a.user_id) with optional .eq(\"status\"). No write verb, no .rpc(), no fetch, no audit().",
  },
  me_search_lender_products: {
    canonical: "lender_product_search",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4595-4601 — single admin.from(\"lender_products\").select(...) with .or()/.eq()/.gte() filters. No write verb, no .rpc(), no fetch, no audit(). Note: this handler performs NO tenant or actor scoping at all (global catalog read).",
  },
  me_whoami: {
    canonical: "me_identity",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:4407-4415 — currentActor() (in-memory AsyncLocalStorage read, index.ts:110) plus actorClient() which performs one .from('clients').select('id, tenant_id, linked_user_id').eq('linked_user_id', a.user_id).maybeSingle() (index.ts:4395-4399). No insert/update/delete, no rpc, no fetch, no audit().",
  },
  // CLEARS `MUTATION_VERB` BY ONE CHARACTER CLASS: "sender" is not the banned segment "send".
  // Same caveat as `crm_payment_authorization_list` above — a widened pattern turns this into a
  // production refusal for a working read.
  resolve_sender_identity: {
    canonical: "tenant_sender_identity",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2134 — admin.rpc(\"tenant_sender_identity\", { _tenant_id }). That function is declared STABLE SECURITY DEFINER (supabase/migrations/20260712220000_tenant_sender_identity_tenant_guard.sql:6-10), i.e. it cannot write; it only reads tenants + resolve_tenant_sender. No other DB call, no fetch, no audit write in :2124-2153.",
  },
  search_clients_fuzzy: {
    canonical: "crm_contact_fuzzy_search",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2718-2769 — one .select() on clients at :2741 wrapped in applyContactSearchFilter (supabase/functions/_shared/contact-search.ts:71 — a pure PostgREST query-builder helper, verified to contain no insert/update/upsert/delete/fetch). No write, no rpc, no external call.",
  },
  search_contacts: {
    canonical: "crm_contact_search",
    effect: "read",
    category: "read",
    evidence: "index.ts:356-373 — one .select() on clients scoped .eq('tenant_id', tenantId). Grepped range 348-374 for .insert(/.update(/.upsert(/.delete(/.rpc(/fetch(/audit( → 0 hits. Helper applyContactSearchFilter (_shared/contact-search.ts) is a pure query-filter builder: 0 write verbs in the whole file.",
  },
  // PAIRED WITH A COMMENT AT THE HANDLER (index.ts, above the registration). `read` is true only
  // while that handler stays inert; re-arming the Twilio send makes this row `mutate` in the same
  // commit, because the read branch skips classification, clamp, approval and outcome in one move.
  send_sms: {
    canonical: "comms_sms_block_notice",
    effect: "read",
    category: "read",
    evidence: "supabase/functions/paige-mcp/index.ts:2432-2461 — fail-closed stub. The whole handler is a length check, a crypto.randomUUID(), audit() at :2446, and a return of status \"blocked_a2p_governed_sender_required\". There is NO Twilio/provider fetch, no DB business write, and no sendSms helper call in the span. Only write is the append-only paige_audit_log row via audit() (:127).",
  },

  // ── LOW MUTATION — writes tenant business data with limited blast radius.
  add_contact_note: {
    canonical: "crm_append_contact_notes",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:465 admin.from('clients').update({ current_notes: next }).eq('id', contact_id).eq('tenant_id', tenantId); index.ts:467 audit() → paige_audit_log insert. Read-modify-write on a free-text column (no row lock — concurrent notes can clobber).",
  },
  advance_contact_journey_stage: {
    canonical: "crm_advance_journey_stage",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:4370-4374 admin.rpc('set_journey_stage', ...) → the live definition (supabase/migrations/20260802160000_blueprints_slice2_tenant_aware_journey_write_model.sql) does UPDATE public.clients SET journey_stage_slug/journey_stage_id/journey_stage_entered_at and INSERT INTO public.paige_journey_stage_transitions; audit at :4376. Checked for fan-out: no trigger on paige_journey_stage_transitions and the only clients trigger that notifies fires on assigned_coach_user_id, so no send/workflow cascade.",
  },
  append_client_memory: {
    canonical: "ingest_client_memory",
    effect: "mutate",
    category: "low_mutation",
    evidence: "Proposal insert at supabase/functions/paige-mcp/index.ts:2980 (recordProposal → :2693). Immediate write path at :2996 — `if (!needsReview && args.auto_confirm) await applyProposal(...)`, whose append_client_memory branch inserts into client_memory at :3141-3152. Audit at :2993.",
  },
  comment_on_approval: {
    canonical: "approval_comment",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:1026 `admin.from(\"paige_approval_comments\").insert({approval_id, author_id: userId, body})`; audit insert at 1030.",
  },
  complete_task: {
    canonical: "crm_update_task",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:692 admin.from('tasks').update({ status: 'completed' }).eq('id', task_id).eq('tenant_id', tenantId); index.ts:699 audit().",
  },
  create_contact: {
    canonical: "crm_create_contact",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:1730 `admin.from(\"clients\").insert(row).select(\"id, created_at\").single()` — creates a new CRM contact row; audit at 1732.",
  },
  create_deal: {
    canonical: "deal_create",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:565 admin.from('deals').insert({ …, tenant_id: tenantId, created_by: currentActor().user_id }).select('id').single(); index.ts:581 audit(). Preceded by a read-only .select() on pipeline_stages (index.ts:551) to resolve the default stage.",
  },
  create_task: {
    canonical: "crm_create_task",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:634 admin.from('tasks').insert({ user_id: args.owner_user_id, …, tenant_id: tenantId }).select('id').single(); index.ts:648 audit(). Tenant is server-resolved, but args.owner_user_id is written straight into tasks.user_id with no check that the assignee is a member of that tenant.",
  },
  ingest_banking_snapshot: {
    canonical: "ingest_banking_snapshot",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:2939 — recordProposal(...) inserts one row into paige_ingestion_proposals (:2693). Verified there is NO auto_confirm field in the input schema (:2921-2930) and NO applyProposal call anywhere in :2917-2963, so this tool cannot reach the manual_banking_entries upsert (applyProposal :3145) on its own. Audit at :2952.",
  },
  link_contact_to_business: {
    canonical: "crm_update_contact",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:1983 — admin.from(\"clients\").update({ primary_business_id, updated_at }).eq(\"id\", contact_id). Preceded by ownership checks (:1962 businesses select, :1973 tenant_members select) and a tenant guard on the contact (:1958). Audit at :1987.",
  },
  me_create_business: {
    canonical: "business_create",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:4529 — admin.from(\"businesses\").insert(row).select(\"id\").single(); audit() at :4531 inserts paige_audit_log. owner_user_id is stamped from currentActor().user_id (:4521), never from args. actorClient() (:4392) is read-only.",
  },
  me_log_progress_update: {
    canonical: "client_log_progress",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:4549 — admin.from(\"clients\").update({ current_notes: next }).eq(\"id\", me.id); audit() at :4552. Target row resolved by actorClient() (:4392, clients.linked_user_id = actor.user_id), not from args. The description claims it also sends a coach message, but the messaging leg is explicitly deferred (comment :4550-4551) — nothing leaves the system, so NOT external_send.",
  },
  me_update_business: {
    canonical: "business_update",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:4494 — admin.from(\"businesses\").update(clean).eq(\"id\", business_id); plus audit() at :4496 which inserts into paige_audit_log (index.ts:127). Ownership re-verified server-side first at :4488-4490 (owner_user_id must equal currentActor().user_id).",
  },
  me_update_profile: {
    canonical: "update_client_data",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:4448 admin.from('clients').update(clean).eq('id', me.id); audit at :4450. Writes are allowlisted to first_name/last_name/phone/entity_name/current_notes/funding_goal_amount (:4444-4446), so lifecycle_stage, assigned coach, tier and status cannot be touched, and the assigned-coach notify trigger cannot fire.",
  },
  move_deal_stage: {
    canonical: "deal_move_stage",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:516 admin.from('deals').update({ stage_id }).eq('id', deal_id).eq('tenant_id', tenantId); index.ts:523 admin.from('deal_activities').insert({ deal_id, type:'stage_change', … }); index.ts:529 audit(). deal_activities has no tenant_id column (migration 20260627022609:185) and is scoped via deal_id → deals.tenant_id, which the preceding tenant-scoped update already proved.",
  },
  propose_client_update: {
    canonical: "crm_propose_contact_update",
    effect: "mutate",
    category: "low_mutation",
    evidence: "Stages, does not apply. supabase/functions/paige-mcp/index.ts:2799 — recordProposal(...), whose body inserts a row into paige_ingestion_proposals at :2693. The clients read at :2792 is only for the diff; there is NO write to clients in this span (the apply happens later in confirm_proposal → applyProposal at :3058). Audit at :2812.",
  },
  reject_proposal: {
    canonical: "ingest_reject_proposal",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:3024-3028 admin.from('paige_ingestion_proposals').update({status:'rejected', decided_by...}).eq('id', proposal_id).in('status',['pending','needs_review']); audit insert at :3030.",
  },
  reopen_task: {
    canonical: "crm_update_task",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:712 admin.from('tasks').update({ status: 'pending' }).eq('id', task_id).eq('tenant_id', tenantId); index.ts:719 audit().",
  },
  update_contact_stage: {
    canonical: "crm_update_lifecycle_stage",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:426 admin.from('clients').update(patch) setting lifecycle_stage; index.ts:438 a second .update({current_notes}) appending the reason; index.ts:440 audit() → paige_audit_log insert at index.ts:127. Registration is marked DEPRECATED in its description but is live and unscoped by enum (accepts any string).",
  },
  update_lifecycle_stage: {
    canonical: "crm_update_lifecycle_stage",
    effect: "mutate",
    category: "low_mutation",
    evidence: "supabase/functions/paige-mcp/index.ts:2016 — admin.from(\"clients\").update({ lifecycle_stage }).eq(\"id\", contact_id); a second write appends to clients.current_notes at :2022 when `reason` is supplied. Audit at :2024. Service-role client, so RLS does not apply.",
  },
  update_task: {
    canonical: "crm_update_task",
    effect: "mutate",
    category: "low_mutation",
    evidence: "index.ts:676 admin.from('tasks').update(patch).eq('id', args.task_id).eq('tenant_id', tenantId).select('id').maybeSingle(); index.ts:679 audit(). Patch is built field-by-field from args (title/description/status/track/due_date/metadata); empty patch short-circuits to err('no_fields_to_update').",
  },

  // ── CONSEQUENTIAL — writes others depend on, bulk operations, workflow and skill dispatch.
  approve_readiness_proposal: {
    canonical: "readiness_approve_proposal",
    effect: "mutate",
    category: "consequential",
    evidence: "supabase/functions/paige-mcp/index.ts:4879-4886 — admin.from(\"paige_readiness_proposals\").update({status:'approved', approved_by: actor, approved_at: now}) scoped .eq(\"tenant_id\").eq(\"id\").eq(\"status\",\"pending\"); audit() at :4889. The UPDATE fires DB trigger trg_readiness_proposal_approval_notify (supabase/migrations/20260702001451_eedc3ecb-2d7b-4e0d-b999-2bff6e02b93f.sql:39-42) whose function INSERTs into public.notifications for the client's linked user (same file :20-31). That cascade is IN-APP only — no pg_net/net.http/provider call anywhere in the trigger — so this is consequential, not external_send. approved_by is taken from currentActor(), never from args.",
  },
  approve_subagent_proposal: {
    canonical: "subagent_approve_proposal",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:3650 fetch to subagent-forge action:'approve' → subagent-forge/index.ts:396 actionApprove → shipProposal :308, which INSERTs a live enabled row into paige_subagents (:320), UPDATEs the proposal to status='live' (:345) and bumpQuota (:351) — i.e. it ships a sub-agent (arbitrary system_prompt / edge_function) live. audit insert at index.ts:3660.",
  },
  claim_approval: {
    canonical: "approval_claim",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:1003 `admin.from(\"paige_pending_approvals\").update({assigned_to_user_id: userId, claimed_at: now}).eq(\"id\", approval_id)` — reassigns the governance record's reviewer; audit insert at 1009. No tenant/actor scope predicate on the update.",
  },
  confirm_proposal: {
    canonical: "ingest_confirm_proposal",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:3013 calls applyProposal(proposal_id); applyProposal (index.ts:3058-3186) writes: clients.update :3080, profiles.update :3096 (FICO fields), client_memory.insert :3105/:3124/:3154, manual_banking_entries.upsert :3135, paige_ingestion_proposals.update status='applied' :3181, audit insert :3183. The one-line handler body hides all of it.",
  },
  create_admin_notification: {
    canonical: "platform_post_notification",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:1364 `admin.from(\"paige_admin_notifications\").insert({severity, title, body, link_to, contact_id, assigned_role, source_workflow_key, scope: \"admin\"})` — writes into the platform-operator alert surface (table has no tenant_id; its own description says \"these page humans\"). Audit at 1377.",
  },
  create_approval: {
    canonical: "approval_create",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:974 admin.from('paige_pending_approvals').insert({type, category, summary, draft_content, contact_id, conversation_id, risk_level, priority, source:'mcp', status:'pending'}); audit() follows. tenant_id is NOT set and actorTenantId() is never called — the column exists (migration 20260629175341:206) and the BEFORE INSERT trigger apply_approval_policy only READS NEW.tenant_id for policy matching (migration 20260629233248:153), never assigns it, so the row lands tenant_id NULL. AFTER INSERT trg_notify_approval_insert (migration 20260629234200:56) → notify-approval-event → send-transactional-email (:181): the insert causes email to leave the system.",
  },
  create_stage_automation_rule: {
    canonical: "automation_rule_create",
    effect: "mutate",
    category: "consequential",
    evidence: "supabase/functions/paige-mcp/index.ts:4713-4726 — admin.from(\"stage_automation_rules\").insert({...}) then audit() at :4726. Consequential rather than low_mutation because the inserted row is dispatch configuration: send_mode accepts \"auto_send\" and is_active accepts true (:4703-4704, :4722-4723), so a single call can arm unattended outbound composition on every future stage change. Gated only by ensureStageAutomationEnabled() (:4664, a tenant_features read).",
  },
  create_subaccount: {
    canonical: "agency_create_subaccount",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:3726 admin.rpc('create_subaccount', {...7 args}); the live 7-arg definition (migrations/20260803120000_p1_subaccount_owner_leak_fix.sql:59-186) INSERTs a new public.tenants row with seeded brand + features/playbook at :172. audit insert at index.ts:3736. Verified against the superseded 20260714123703 version: the current definition deliberately writes NO tenant_members row and leaves owner_user_id NULL (:167-171 comment), so this is tenant provisioning, not a role grant.",
  },
  decide_pending_approval: {
    canonical: "approval_decide",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:945 admin.from('paige_pending_approvals').update({status, reviewed_at, decision_rationale, escalation_note}).eq('id', approval_id) — no tenant or ownership predicate; index.ts:951 audit(). Two DB triggers cascade off this status update: trg_ppa_sync_action (migration 20260711140000:187) flips the linked paige_actions row to done/dismissed, and trg_notify_approval_changes (migration 20260629234200:60) http_posts notify-approval-event, which fetches send-transactional-email per recipient (notify-approval-event/index.ts:181) — so an approve/reject sends email out of the system even though the tool description says it only records a decision.",
  },
  ingest_credit_scores: {
    canonical: "ingest_credit_scores",
    effect: "mutate",
    category: "consequential",
    evidence: "Proposal insert at supabase/functions/paige-mcp/index.ts:2884 (recordProposal → paige_ingestion_proposals insert at :2693). AND a real immediate write path: :2900 — `if (!needsReview && args.auto_confirm) await applyProposal(proposal.id)`, whose ingest_credit_scores branch (:3086-3113) UPDATEs profiles.estimated_fico_tu/ex/eq at :3095 and INSERTs into client_memory at :3106, then stamps the proposal applied at :3168. Audit at :2897.",
  },
  propose_subagent: {
    canonical: "subagent_create",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:3597 fetch to functions/v1/subagent-forge action:'propose' → subagent-forge/index.ts:279 INSERTs paige_subagent_proposals, :129 bumpQuota RPC bump_subagent_quota, and for non-soft runtimes routeForApproval :363 INSERTs paige_pending_approvals and :384 UPDATEs the proposal. audit inserts at index.ts:3578 (rejection path) and :3613.",
  },
  record_social_accounts: {
    canonical: "update_social_accounts",
    effect: "mutate",
    category: "consequential",
    evidence: "supabase/functions/paige-mcp/index.ts:5005 — admin.rpc(\"record_social_handles\", { _expected_tenant_id: tenant_id, _handles: handles }); audit() at :5010. Followed into supabase/migrations/20261210000000_a_business_can_record_the_accounts_it_posts_from.sql:63 — the function runs UPDATE public.tenants (merging features->social_handles) and RAISEs if no row updated. Consequential rather than low_mutation because it rewrites a TENANT-level record with replace-whole-set semantics (a network omitted from args is cleared, per the tool description at :4989) and it is the gate Systems Check #3 reads. NOT external_send / provider / access: the migration comment and the tool description both state it performs no OAuth, stores no token and calls no provider API — grep of the function body shows no net.http/pg_net.",
  },
  register_workflow: {
    canonical: "workflow_register",
    effect: "mutate",
    category: "consequential",
    evidence: "supabase/functions/paige-mcp/index.ts:2326 — admin.from(\"paige_workflow_registry\").insert(row).select(...).single(). The inserted row (built :2295-2318) defines a dispatchable capability: provider, n8n_webhook_url, langgraph_graph_id, direct_function_name, allowed_roles, and tenant_id NULL (a GLOBAL registry row) when actorIsPlatformOwner() (:2292, :2317). Audit at :2328.",
  },
  reject_readiness_proposal: {
    canonical: "readiness_reject_proposal",
    effect: "mutate",
    category: "consequential",
    evidence: "supabase/functions/paige-mcp/index.ts:4904-4917 — admin.from(\"paige_readiness_proposals\").update({status:'rejected', rejected_by: actor, rejected_at, rejection_reason}) scoped .eq(\"tenant_id\").eq(\"id\").eq(\"status\",\"pending\"); audit() at :4919. Consequential (not low_mutation) because it closes an approval-workflow record the client-facing readiness surface reads; the approval-notify trigger only fires on status='approved' so no notification cascade here. rejected_by comes from currentActor().",
  },
  run_skill: {
    canonical: "skill_run",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:3488 fetch to functions/v1/skill-runner with service-role auth; skill-runner/index.ts:161 INSERTs paige_skill_runs, :398/:409 UPDATEs it, and its step handlers write client_memory (:316) and communication_log (:373) and call out to https://api.resend.com/emails (:360), https://api.firecrawl.dev (:266) and business-verifier (:250). audit insert at index.ts:3502. The dry_run branch (3461-3476) is read-only, but the live branch is not.",
  },
  run_workflow: {
    canonical: "workflow_run",
    effect: "mutate",
    category: "consequential",
    evidence: "THREE write paths. (1) index.ts:821 paige_pending_approvals.insert (requires_approval branch) — which fires AFTER INSERT trg_notify_approval_insert → notify-approval-event → send-transactional-email (notify-approval-event/index.ts:181), i.e. email leaves the system. (2) index.ts:838 paige_workflow_runs.insert. (3) index.ts:849 dispatchWorkflowRun → _shared/workflowDispatch.ts: updates paige_workflow_runs (line 79) and, by provider, POSTs the caller's payload to the tenant's n8n webhook (:154), LangGraph /runs (:180), the PAIGE_OS bridge (:222), or SYNCHRONOUSLY invokes an arbitrary Paige edge function named by the registry row with SERVICE_ROLE_KEY as Authorization (:274-282); plus railAutomation.ts:103 admin.rpc('record_rail_event').",
  },
  update_contact: {
    canonical: "crm_update_contact",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:1798 `admin.from(\"clients\").update(patch).eq(\"id\", contact_id)` — patches an existing core CRM record; audit at 1800. The patch surface includes ownership (assigned_coach_user_id, lead_owner_user_id, cs_primary_user_id, primary_business_id), status ('archived'), do_not_contact and lifecycle_stage, i.e. fields deals/tasks/comms depend on.",
  },
  update_stage_automation_rule: {
    canonical: "automation_rule_update",
    effect: "mutate",
    category: "consequential",
    evidence: "supabase/functions/paige-mcp/index.ts:4747-4749 — admin.from(\"stage_automation_rules\").update(clean).eq(\"id\", id).eq(\"tenant_id\", tenantId); audit() at :4751. Consequential because the patch can flip is_active and send_mode to 'auto_send' (:4735, :4738), i.e. arm or disarm unattended outbound dispatch on an existing rule. Tenant-scoped in the WHERE clause.",
  },
  upsert_email_template: {
    canonical: "comms_upsert_email_template",
    effect: "mutate",
    category: "consequential",
    evidence: "index.ts:1438 `admin.from(\"email_templates\").upsert(row, {onConflict: \"template_key\"})`. template_key is the table PRIMARY KEY (migration 20260629002038:2-3) and the row built at 1425-1436 never sets tenant_id, so an upsert overwrites the shared template body/subject that send_btf_template_email and other senders render at send time. Audit at 1442.",
  },

  // ── ACCESS — roles, invitations, credentials, connections, workspace switching.
  add_coach_role: {
    canonical: "member_grant_role",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:1151 `admin.from(\"user_roles\").upsert({user_id, role: \"coach\"}, {onConflict: \"user_id,role\"})` — grants an app_role on the GLOBAL user_roles table (no tenant_id column); audit at 1153.",
  },
  add_email_domain: {
    canonical: "comms_add_email_domain",
    effect: "mutate",
    category: "access",
    evidence: "supabase/functions/paige-mcp/index.ts:4167 admin.from('tenant_email_domains').update({ is_default: false }).eq('tenant_id', tenant_id) then :4169-4175 .insert({...status:'pending'}); audit at :4176. Registers an outbound sending identity/connection for the tenant (and can seize the default sender) — no provider call here (externalActorDestination at :4178 only reads tenants and builds a URL).",
  },
  assign_coach: {
    canonical: "crm_assign_coach",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:1095 `admin.from(\"clients\").update({assigned_coach_user_id: coach_user_id}).eq(\"id\", client_id)` — NO tenant predicate; audit at 1101.",
  },
  bulk_assign_clients_to_coach: {
    canonical: "crm_assign_coach",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:1203 `admin.rpc(\"admin_bulk_assign_coach\", {_coach, _client_ids})`. RPC body (supabase/migrations/20260821010000_definer_fn_wave2_writer_hardening.sql:144-183) runs `UPDATE public.clients SET assigned_coach_user_id = _coach, updated_at = now() WHERE id = ANY(_client_ids) AND tenant_id = current_user_tenant_id()` — bulk coach reassignment of up to N client rows. Audit at 1205.",
  },
  create_team_invitation: {
    canonical: "team_invite_mint",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:1290 `admin.from(\"invitations\").insert({email, role, tenant_id, invited_by, token_hash, expires_at, template_name})` — mints a tenant-membership grant. The handler also returns the RAW token and accept_url to the caller (index.ts:1305-1310), i.e. it hands out a live credential. Audit at 1302.",
  },
  exit_subaccount: {
    canonical: "agency_exit_subaccount",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:3793 admin.rpc('agency_exit_subaccount', {_actor}); the SQL function (migrations/20260712310000_agency_mcp_enter_exit.sql:71-84) UPDATEs profiles.active_tenant_id back to actor_primary_agency(_actor). audit insert at index.ts:3795.",
  },
  remove_coach_role: {
    canonical: "member_revoke_role",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:1163 `admin.rpc(\"admin_remove_coach_role\", {_user_id})`. The RPC body (supabase/migrations/20260821010000_definer_fn_wave2_writer_hardening.sql:214-249) performs `DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'coach'` — a role revocation. Audit at 1165.",
  },
  set_default_email_domain: {
    canonical: "comms_set_primary_email_domain",
    effect: "mutate",
    category: "access",
    evidence: "supabase/functions/paige-mcp/index.ts:4197 admin.from('tenant_email_domains').update({ is_default: false }).eq('tenant_id', tenant_id) then :4198-4200 .update({ is_default: true }).eq('id', domain_id); audit at :4201. Switches the From identity every future tenant email is sent under.",
  },
  switch_into_subaccount: {
    canonical: "agency_enter_subaccount",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:3779 admin.rpc('agency_enter_subaccount', {_child,_actor}); the SQL function (migrations/20260712310000_agency_mcp_enter_exit.sql:55-68) INSERTs a tenant_members row granting the actor role='admin' on the child (:63-65) and UPDATEs profiles.active_tenant_id (:66). audit insert at index.ts:3781.",
  },
  update_coach_profile: {
    canonical: "coach_update_profile",
    effect: "mutate",
    category: "access",
    evidence: "index.ts:1188 `admin.from(\"profiles\").update(patch).eq(\"user_id\", args.user_id)` — writes another user's identity/profile row (coach_specialties, coach_capacity, coach_accepting_clients, coach_bio, coach_timezone), including the accepting-new-clients toggle that governs assignment routing. Audit at 1190. No tenant predicate.",
  },

  // ── EXTERNAL SEND — something leaves the system and reaches a real person.
  bulk_send_template_email: {
    canonical: "comms_send_bulk_email",
    effect: "mutate",
    category: "external_send",
    evidence: "supabase/functions/paige-mcp/index.ts:4301-4305 fetch('https://api.resend.com/emails', POST) inside the per-contact loop, then :4313-4317 admin.from('email_send_log').insert(...); audit at :4321. Up to 100 recipients per call.",
  },
  send_btf_template_email: {
    canonical: "comms_send_email",
    effect: "mutate",
    category: "external_send",
    evidence: "index.ts:1572 `await fetch(\"https://api.resend.com/emails\", {method: \"POST\", ...})` — real outbound customer email to args.to_email; followed by `admin.from(\"email_send_log\").insert({...})` at 1601 and audit at 1593/1609.",
  },
  send_composed_email: {
    canonical: "comms_send_email",
    effect: "mutate",
    category: "external_send",
    evidence: "index.ts:3333 await fetch('https://api.resend.com/emails') with caller-supplied to/subject/body_html; index.ts:3354 admin.from('email_send_log').insert(...); audit insert at :3368.",
  },
  send_transactional_email: {
    canonical: "comms_send_email",
    effect: "mutate",
    category: "external_send",
    evidence: "supabase/functions/paige-mcp/index.ts:2388 — await fetch(\"https://api.resend.com/emails\", ...) delivering to the caller-supplied `to` address with the tenant's resolved from-address. Followed by admin.from(\"email_send_log\").insert({...}) at :2409 and audit at :2423.",
  },

  // ── PROVIDER — calls or dispatches to something outside this platform.
  cancel_workflow_run: {
    canonical: "workflow_cancel_run",
    effect: "mutate",
    category: "provider",
    evidence: "Two effects. External provider dispatch: supabase/functions/paige-mcp/index.ts:2245 — await fetch(PAIGE_OS_LANGGRAPH_BRIDGE_URL, {verb:\"cancel_run\", thread_id, run_id}) with the bridge bearer key. State write: :2260 — admin.from(\"paige_workflow_runs\").update({status:'cancelled', error, completed_at}).eq(\"id\", run_id). Audit at :2266. (Consequential workflow-run write plus an outbound provider call; provider is the more severe of the two.)",
  },
  compose_email: {
    canonical: "comms_draft_email",
    effect: "mutate",
    category: "provider",
    evidence: "index.ts:3288 callOrchestrator({action:'tool_invoke', slug:'email-composer'}) → same tool_invoke path as delegate_to_subagent: paige-orchestrator INSERTs paige_subagent_invocations (:557), runs the LLM via routedChatCompletion (:485, external provider + paige_llm_trace row), updates the invocation (:594). audit insert at index.ts:3294. Confirmed it does NOT send: no resend/twilio call anywhere in the handler (3286-3300).",
  },
  delegate_to_subagent: {
    canonical: "delegate_to_subagent",
    effect: "mutate",
    category: "provider",
    evidence: "index.ts:3254 callOrchestrator({action:'tool_invoke'}) → paige-orchestrator/index.ts:557 logInvocation INSERTs paige_subagent_invocations, then dispatches: invokeSoft :485 routedChatCompletion (external LLM gateway, also writes paige_llm_trace), invokeLocal → an arbitrary sub-agent edge function, or dispatchLangGraph :449 fetch to LANGGRAPH_BRIDGE_URL (external); :594 updateInvocation writes the result back. audit insert at index.ts:3260.",
  },
  verify_business: {
    canonical: "business_verify",
    effect: "mutate",
    category: "provider",
    evidence: "index.ts:3528 fetch to functions/v1/business-verifier; business-verifier/index.ts:71 INSERTs business_verification_runs, :133 INSERTs business_verifications rows, :96/:151 UPDATEs the run. Its adapters call external providers: _shared/businessVerifyAdapters/sos.ts:32 fetch https://api.firecrawl.dev/v2/search, secEdgar.ts:9 and opencorporates.ts:15. audit insert at index.ts:3534.",
  },

  // ── AVAILABILITY — suspension, platform announcements, feature flags, branding.
  broadcast_system_announcement: {
    canonical: "platform_post_notification",
    effect: "mutate",
    category: "availability",
    evidence: "supabase/functions/paige-mcp/index.ts:4078-4081 admin.from('paige_admin_notifications').insert({ ..., scope: 'all' }); audit at :4083. Checked for fan-out: no CREATE TRIGGER on public.paige_admin_notifications in supabase/migrations, so this is an in-app platform-wide notification, not an external send.",
  },
  suspend_tenant: {
    canonical: "tenant_set_status",
    effect: "mutate",
    category: "availability",
    evidence: "supabase/functions/paige-mcp/index.ts:3929-3931 admin.from('tenants').update({ status }).eq('id', tenant_id); audit at :3933. Freezes/restores/retires a whole tenant workspace.",
  },
  update_tenant_branding: {
    canonical: "update_business_profile",
    effect: "mutate",
    category: "availability",
    evidence: "supabase/functions/paige-mcp/index.ts:4106-4107 admin.from('tenants').update(patch).eq('id', tenant_id) where patch carries the merged brand jsonb and optionally name; audit at :4109.",
  },
  update_tenant_features: {
    canonical: "tenant_set_features",
    effect: "mutate",
    category: "availability",
    evidence: "supabase/functions/paige-mcp/index.ts:3953-3957 admin.from('tenants').update({ features: nextFeatures, brand: nextBrand }).eq('id', tenant_id) after a read-merge at :3947-3948; audit at :3959. Feature flags + white-label branding.",
  },

  // ── DESTRUCTIVE — removes something that does not come back.
  delete_stage_automation_rule: {
    canonical: "automation_rule_delete",
    effect: "mutate",
    category: "destructive",
    evidence: "supabase/functions/paige-mcp/index.ts:4763 — admin.from(\"stage_automation_rules\").delete().eq(\"id\", id).eq(\"tenant_id\", tenantId). A hard row DELETE, not a soft flag; audit() at :4765. Handler also carries annotations.destructiveHint (:4759).",
  },
  delete_task: {
    canonical: "crm_delete_task",
    effect: "mutate",
    category: "destructive",
    evidence: "index.ts:731 admin.from('tasks').delete().eq('id', task_id).eq('tenant_id', tenantId) — a hard row delete, no soft-delete/archive column written; index.ts:733 audit(). Note the handler does not check that a row matched, so it reports ok:true even when the id does not exist or belongs to another tenant.",
  },

  // ── BILLING — invoices, payments, money.
  create_invoice: {
    canonical: "billing_create_invoice",
    effect: "mutate",
    category: "billing",
    evidence: "supabase/functions/paige-mcp/index.ts:2504-2517 — admin.from(\"paige_invoices\").insert({ tenant_id, contact_id, deal_id, status:'draft', amount_total_cents, currency, line_items, due_date, payment_plan_key, created_by }).select(...).single(). BTF preset amounts (up to $4,997) come from BTF_PLANS at :2455-2459. Audit at :2519. No external call — Stripe hosted URL is deferred to send_invoice.",
  },
  send_invoice: {
    canonical: "billing_send_invoice",
    effect: "mutate",
    category: "billing",
    evidence: "Two effects. External send: supabase/functions/paige-mcp/index.ts:2579 — await fetch(\"https://api.resend.com/emails\") delivering the invoice + pay link to the contact's email. State write: :2599 — admin.from(\"paige_invoices\").update({status:'sent', sent_at, sent_to_email, hosted_invoice_url}).eq(\"id\", inv.id). Audit at :2605. Both billing and external_send apply; billing is the more severe.",
  },

  // ── PRIVACY — a data-subject request: export, erasure, restriction.
  handle_data_subject_request: {
    canonical: "privacy_handle_request",
    effect: "mutate",
    category: "privacy",
    evidence: "supabase/functions/paige-mcp/index.ts:4813 — admin.rpc(\"handle_data_subject_request\", ...). Followed into supabase/migrations/20260701200503_e5d7aa75-8385-4087-8e63-88cf52f943c4.sql: the function is VOLATILE plpgsql SECURITY DEFINER and on EVERY branch inserts pii_access_log and paige_audit_log; the 'correct' branch runs UPDATE public.clients (set first_name/email/phone/address...); the 'delete' branch runs UPDATE public.clients redacting PII to 'REDACTED'/NULL and lifecycle_stage='archived', then INSERTs data_deletion_requests. The export/portability branch returns the contact's full record plus notes, deals, files and memory. Edge handler adds audit() at :4821. annotations.destructiveHint set at :4809.",
  },

  // ── OWNER ONLY — no approval reaches this through any door, at any strength.
  create_tenant: {
    canonical: "tenant_create",
    effect: "mutate",
    category: "owner_only",
    evidence: "supabase/functions/paige-mcp/index.ts:3884 admin.from('tenants').insert(payload) and :3897 admin.from('legal_acceptances').insert(...) for the caller-named owner_user_id; audit write at :3886. The tenants INSERT also fires AFTER INSERT trigger trg_tenants_seed_starter_business (supabase/migrations/20260711142434_starter_business_provisioner.sql:253) which enqueues tenant_provisioning, later drained by pg_cron into products/forms/calendars/actions for the new tenant.",
  },
};

/** Deny-by-default lookup. `undefined` means "no policy", which the adapter turns into a refusal. */
export function lookupMcpCapability(tool: string): McpCapability | undefined {
  return Object.prototype.hasOwnProperty.call(MCP_CAPABILITY_POLICY, tool)
    ? MCP_CAPABILITY_POLICY[tool]
    : undefined;
}

/** Categories that may never execute through this door while it carries no approval channel.
 *  Kept as data so the test can assert the set rather than restate it. */
export const MCP_APPROVAL_REQUIRED_CATEGORIES: readonly McpRiskCategory[] = Object.freeze([
  "destructive", "external_send", "provider", "privacy", "billing", "access", "availability", "owner_only",
]);
