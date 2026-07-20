-- §34/§16 — Operationalize the 10-department org model: seed a signature action-kind per department.
--
-- The 10 departments (docs/doctrine/100M-org-blueprint.md) were SEEDED as rows in paige_departments
-- (20260713120000_org_blueprint_departments.sql) but no action-kind ever ROUTED to the 9 new desks —
-- only the 2 legacy desks (owner_ops / client_experience) had kinds. So the executor could never file
-- work TO Executive Office, Marketing, Sales, Product/Curriculum, Technology/Automation, Finance,
-- People/Talent, Legal/Compliance, or Operations/PMO. This migration gives each new department ONE
-- coaching-generic signature action-kind so it becomes a real routable desk with a real default lane —
-- the "COO for your business" org model as infrastructure, not marketing copy.
--
-- §16 / SPINE #1 — this EXTENDS paige_action_kinds (each kind = a RACI-per-workflow row: from/to
-- department + default autonomy lane), exactly as the blueprint mandates. It does NOT touch file_action
-- / advance_action, which already resolve department + lane generically from the kind row — so routing
-- to 10 departments needs only registry data + the LLM-facing enums (widened in paige-ai-chat), no RPC
-- change. The autonomy lanes deliberately span all three tiers so the tier binding is provable:
--   🟢 auto    — exec.compile_brief, ops.record_status         (record_only, safe to self-perform)
--   🟡 confirm — marketing/sales/curriculum/tech/finance        (drafted → owner approves)
--   🔴 off     — talent.flag_role_gap, legal.flag_review        (human-only / AI-briefed)
-- The schema guardrails still bind: send_via_approval ⇒ requires_approval=true; auto ⇒ executor ∈
-- (record_only, workflow) — so "auto-send" stays unrepresentable.
--
-- §2 — every kind is coaching/consulting/agency-generic and finance-clean. finance.retainer_reminder is
-- the BUSINESS's own service billing (a reminder that a client's retainer/invoice is due) — universal to
-- every service business, owner-approved before it goes out; it is NOT consumer credit/funding/lending
-- and carries none of that vocabulary. No credit/funding/lender kind is seeded as a platform default.
--
-- §9 — platform defaults (tenant_id NULL), coaching-generic, operator-owned. Tenants may still author
-- their own t.<slug>.* kinds later. Idempotent; ADDITIVE only.

INSERT INTO public.paige_action_kinds
 (slug,label,description,default_from_department,default_to_department,executor,requires_approval,approval_type,draft_subagent_slug,default_autonomy_lane,default_priority) VALUES
 ('exec.compile_brief',         'Compile daily brief',    'Executive Office compiles the owner''s daily brief.',                                                 'owner_ops',        'executive_office',      'record_only',      false,'other',   NULL,           'auto',   'normal'),
 ('marketing.draft_campaign',   'Draft a campaign',       'Marketing drafts a campaign concept for the owner to review.',                                        'owner_ops',        'marketing',             'record_only',      true, 'cs_draft',NULL,           'confirm','normal'),
 ('sales.work_followup',        'Work a sales follow-up', 'Sales prepares a follow-up for a prospect; the owner approves before it sends.',                      'owner_ops',        'sales',                 'send_via_approval',true, 'cs_draft','email-composer','confirm','normal'),
 ('curriculum.suggest_resource','Suggest a resource',     'A client need routes to Product/Curriculum to suggest the right resource.',                           'client_experience','product_curriculum',    'record_only',      true, 'cs_draft',NULL,           'confirm','normal'),
 ('tech.propose_automation',    'Propose an automation',  'Technology/Automation proposes a workflow for the owner to approve.',                                 'owner_ops',        'technology_automation', 'record_only',      true, 'cs_draft',NULL,           'confirm','low'),
 ('finance.retainer_reminder',  'Retainer reminder',      'Finance prepares a reminder that a client''s retainer is due; the owner approves before it goes out.', 'owner_ops',        'finance',               'send_via_approval',true, 'cs_draft','email-composer','confirm','normal'),
 ('talent.flag_role_gap',       'Flag a role gap',        'People/Talent flags a role or capacity gap for the owner to decide on.',                              'owner_ops',        'people_talent',         'record_only',      false,'other',   NULL,           'off',    'normal'),
 ('legal.flag_review',          'Flag for review',        'Legal/Compliance flags something that needs a human review.',                                         'owner_ops',        'legal_compliance',      'record_only',      false,'other',   NULL,           'off',    'high'),
 ('ops.record_status',          'Record project status',  'Operations/PMO records a project status update.',                                                     'owner_ops',        'operations_pmo',        'record_only',      false,'other',   NULL,           'auto',   'low')
ON CONFLICT (slug) DO NOTHING;
