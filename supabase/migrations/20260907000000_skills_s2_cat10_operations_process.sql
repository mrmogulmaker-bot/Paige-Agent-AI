-- S2 wave · Category 10 (Operations & Process) — seed 9 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category = 'operations_process'
-- (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62 (mechanic-descriptive only — no
-- anchor-person name, no branded operations/PM-framework title, no source-repo name). tier_availability = §61
-- default; scoping = 'platform'. Runnable for real tenant callers via the #135 interpreter fix (is_platform_default
-- is a registry-provenance vs generation-nature distinction — a tenant running a platform skill produces tenant
-- content, so these seed rows execute end-to-end, not just insert).
--
-- §13 INTERPRETER-HONEST: 5 read_only+auto REVIEWS (task_prioritization_review, process_bottleneck_review,
-- capacity_review, automation_opportunity_scan, project_status_review — each carries ONLY {context[,rag],anthropic},
-- persists nothing, and reports 'not available' when the data it reads is absent; every flag/metric is keyed to a
-- figure actually present, never a computed or fabricated number) + 4 DRAFTERS (draft+confirm — project_plan_draft,
-- weekly_priorities_plan, workflow_design_draft, operational_checklist_draft — file a draft for approval). NONE
-- execute, schedule, automate, mutate a task system, or send. pdf_render appears ONLY on the 4 draft skills (a
-- review artifact, not a send) and is ABSENT from every read skill.
--
-- §13 HONESTY FIXES (crew verdict FIX_NEEDED, applied IN PLACE by the adversarial verifier): (1) project_plan_draft
-- render_doc said 'approved-pending plan' — the skill is confirm-lane and nothing is approved yet; reworded to
-- 'drafted plan (pending approval)'. (2) automation_opportunity_scan was the only READ skill lacking the explicit
-- 'not available' phrasing; added it (no behavior change — it already persisted nothing).
--
-- §2 FINANCE-CLEAN (platform default): coaching-generic operational planning/analysis/coordination ONLY — ZERO
-- consumer-finance wording (the §32.a proof's finance scan re-verifies 0 hits; distillation was clean, no scrub
-- needed).
--
-- §18 EXCLUSIONS (wrap-don't-duplicate) — the ops PLANNING/ANALYSIS/COORDINATION angle, NOT a re-implementation:
--   • workflow_design_draft models the operational FLOW LOGIC (trigger → steps → role handoffs → per-step owner);
--     Cat 2 draft_sop_process_doc owns the formal written SOP PROSE. Flow design vs narrative doc.
--   • operational_checklist_draft is the business's OWN INTERNAL recurring-ops run; Cat 2 draft_checklist_worksheet
--     is a CLIENT-FACING deliverable. Internal ops vs client deliverable (§9 audience seam).
--   • automation_opportunity_scan reads the TENANT'S OWN manual processes; it does NOT touch/describe Paige's
--     internal sub-agent teams or the skill-forge fabric (Cat 11).
--   • project_status_review reads INTERNAL initiative status; Cat 3 milestone_tracking is a per-CLIENT delivery
--     journey and Cat 4 pipeline_review is the SALES pipeline — three distinct data domains.
--   • capacity_review reads INTERNAL operations workload (assignments/allocation per owner), never the sales pipeline.
--   Each skill states its boundary in its own description + methodology_anchor. Nothing dropped; no §18 duplicate.
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills registry
-- structure + standard operations-management mechanics (phase-milestone-task decomposition, impact-weighted weekly
-- planning, trigger-step-handoff-owner process modeling, sequential checklist decomposition, urgency-impact-
-- dependency task ranking, flow-constraint/bottleneck signatures, workload/capacity reads, automation-candidate
-- signatures, internal project-status reads) — mechanics only, IP-clean, no branded PM/ops product.
--
-- §1 crew: 2 distillation engineers + adversarial IP/§16/§18/§2/§13-honesty verifier. Verdict FIX_NEEDED because
--   the verifier caught + fixed the 2 §13-honesty items above; the corrected set is IP/§2/§13-clean.
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$project_plan_draft$s$, $s$Project Plan Draft$s$, $s$Drafts an operational project plan for an internal initiative or deliverable effort — decomposed into phases, milestones, and tasks, each with an owner and a target date — and files it as a draft for a human to approve. Scoped to INTERNAL project planning: distinct from strategic roadmapping (a vision-to-roadmap skill) and from a client-facing deliverable (a client-delivery skill). Gathers the initiative's scope and team from the context layer, reuses the business's own prior planning patterns, generates the plan, and persists a reviewable draft — it never executes, schedules, or mutates any task system.$s$,
    $s$operations_process$s$,
    ARRAY[$s$draft a project plan for$s$, $s$break this initiative into phases and milestones$s$, $s$who owns what and by when on this$s$, $s$build a project plan for the launch$s$, $s$plan out this internal project$s$, $s$lay out the milestones and target dates$s$]::text[],
    $j$[{"id": "gather_scope", "tool": "context", "desc": "Read the initiative's scope, the team/owners available, and any existing deadline or timeline signals the workspace context layer already exposes."}, {"id": "retrieve_patterns", "tool": "rag", "desc": "Retrieve the business's own prior project plans and operating conventions to match its phase structure, owner roles, and cadence."}, {"id": "generate_plan", "tool": "anthropic", "desc": "Generate the plan: decompose into phases → milestones → tasks, assign an owner to each, and back-schedule target dates from the end goal."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted project plan as a pending draft for a human to review and approve — persist as a draft, take no action."}, {"id": "render_doc", "tool": "pdf_render", "desc": "Render the drafted plan (pending approval) as a shareable project-plan document for the reviewer."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Phase-milestone-task decomposition with per-item owner assignment and target dates back-scheduled from the objective.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$weekly_priorities_plan$s$, $s$Weekly Priorities Plan$s$, $s$Drafts the week's operational priorities and focus plan for the business — the handful of highest-leverage outcomes for the week, sequenced with owners and mid-week checkpoints — and files it as a draft for approval. Reads open commitments and deadlines from the context layer and reuses the business's recurring weekly cadence; it plans the week, it does not execute or send anything. Internal operational planning, distinct from a per-client delivery status or a sales-pipeline view.$s$,
    $s$operations_process$s$,
    ARRAY[$s$plan my week$s$, $s$what should we focus on this week$s$, $s$draft the weekly priorities$s$, $s$set this week's focus$s$, $s$weekly operating plan$s$, $s$what are the top priorities for the week$s$]::text[],
    $j$[{"id": "gather_open_work", "tool": "context", "desc": "Read the open commitments, upcoming deadlines, and in-flight work the context layer already exposes for the coming week."}, {"id": "retrieve_cadence", "tool": "rag", "desc": "Retrieve prior weekly plans and the business's recurring operating cadence to match its rhythm and focus categories."}, {"id": "generate_priorities", "tool": "anthropic", "desc": "Generate an impact-weighted shortlist of the week's priorities, each with an owner and a mid-week checkpoint, ordered by leverage."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted weekly focus plan as a pending draft for human approval — persist a draft only."}, {"id": "render_doc", "tool": "pdf_render", "desc": "Render the weekly priorities as a shareable focus-plan document."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Impact-weighted selection of the week's highest-leverage outcomes with per-item owner and checkpoint assignment.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$workflow_design_draft$s$, $s$Workflow Design Draft$s$, $s$DESIGNS a repeatable business process for the tenant's own operations — the ordered steps, the trigger that starts it, the handoffs between roles, and the owner of each step — and files it as a draft for approval. This designs the operational FLOW and logic; it does NOT produce the formal written SOP document (a separate documents-category skill owns the prose write-up). Gathers the process's current actors and tools from the context layer, reuses the business's existing handoff conventions, generates the flow design, and persists a reviewable draft. It designs the process; it cannot run or automate it.$s$,
    $s$operations_process$s$,
    ARRAY[$s$design a workflow for$s$, $s$map out how this process should flow$s$, $s$set up the handoffs for this process$s$, $s$design our onboarding process$s$, $s$how should this process move step to step$s$, $s$design the flow and triggers for$s$]::text[],
    $j$[{"id": "gather_process", "tool": "context", "desc": "Read the process's current actors, tools, and existing steps as the context layer exposes them."}, {"id": "retrieve_conventions", "tool": "rag", "desc": "Retrieve the business's existing workflows for its handoff, owner, and trigger conventions so the new design matches."}, {"id": "generate_flow", "tool": "anthropic", "desc": "Generate the process design: the starting trigger, ordered steps, role-to-role handoffs, and the owner of each step — the operational logic, not an SOP narrative."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted workflow design as a pending draft for human approval — persist a draft only, no execution."}, {"id": "render_map", "tool": "pdf_render", "desc": "Render the workflow design as a shareable process-flow map (steps, triggers, handoffs, owners)."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Trigger-step-handoff-owner process modeling that captures the operational flow logic.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$operational_checklist_draft$s$, $s$Operational Checklist Draft$s$, $s$Drafts an INTERNAL recurring-operational checklist — a launch run, a monthly close, an onboarding-ops run — as ordered check items, each with an owner and a clear completion criterion, filed as a draft for approval. Scoped to the business's own internal operations: distinct from a client-facing checklist or worksheet (a documents-category deliverable). Reads the operation's steps from the context layer and reuses the business's prior run patterns; it drafts the checklist, it does not run or complete any items.$s$,
    $s$operations_process$s$,
    ARRAY[$s$draft a checklist for$s$, $s$make a launch checklist$s$, $s$monthly close checklist$s$, $s$internal ops checklist for$s$, $s$steps to run our onboarding operations$s$, $s$build a recurring run checklist$s$]::text[],
    $j$[{"id": "gather_operation", "tool": "context", "desc": "Read the operation's steps, the owners involved, and any existing run signals the context layer exposes."}, {"id": "retrieve_runs", "tool": "rag", "desc": "Retrieve the business's prior checklists and run patterns for the same or similar recurring operations."}, {"id": "generate_checklist", "tool": "anthropic", "desc": "Generate ordered check items, each with an owner and a completion criterion, sequenced for the run."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted operational checklist as a pending draft for human approval — persist a draft only."}, {"id": "render_doc", "tool": "pdf_render", "desc": "Render the checklist as a shareable internal run document."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Sequential check-item decomposition with per-item owner and explicit completion criterion.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$task_prioritization_review$s$, $s$Task Prioritization Review$s$, $s$READS the open tasks and workload the context layer already exposes and surfaces a prioritized order — ranked by urgency, impact, and dependency — with a short rationale for the sequence. Read-only: it persists nothing and takes no action. It reports ONLY what the task/workload data already exposes and states 'not available' when no task data is present — it never fabricates a task, status, or metric. Scoped to internal operations workload; distinct from a sales-pipeline review.$s$,
    $s$operations_process$s$,
    ARRAY[$s$what should I work on first$s$, $s$prioritize my open tasks$s$, $s$what's most urgent right now$s$, $s$put my workload in order$s$, $s$triage my tasks$s$, $s$which tasks matter most this week$s$]::text[],
    $j$[{"id": "read_tasks", "tool": "context", "desc": "Read the open tasks and workload the context layer already exposes; if no task data is present, report 'not available' and rank nothing."}, {"id": "prioritize", "tool": "anthropic", "desc": "Order the exposed tasks by urgency × impact × dependency and explain the ranking — analysis only, persist nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Urgency-impact-dependency ranking of the already-exposed open task set, with an honest 'not available' when task data is absent.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$process_bottleneck_review$s$, $s$Process Bottleneck Review$s$, $s$Reads a business process as described or exposed and surfaces where work backs up, which steps are redundant, and where it could be tightened — analysis only, persisting nothing and flagging any part not described as not available.$s$,
    $s$operations_process$s$,
    ARRAY[$s$where's the bottleneck in this process$s$, $s$review our workflow for slow spots$s$, $s$what's slowing this process down$s$]::text[],
    $j$[{"id": "read_process", "tool": "context", "desc": "Read the business process as it is described or exposed by the context layer — its steps, handoffs, owners, and any cycle or wait times present. Treat any step or timing not described as not available rather than inferring it."}, {"id": "retrieve_patterns", "tool": "rag", "desc": "Retrieve process-analysis patterns and common flow-constraint signatures for client-based service businesses (queues, rework loops, single-owner chokepoints, duplicate steps) to frame the read."}, {"id": "surface_bottlenecks", "tool": "anthropic", "desc": "Interpret the read process against the retrieved patterns to name where work backs up, which steps are redundant, and the most concrete improvement opportunities — grounded only in the process data present, phrased as observations tied to the described steps, and explicitly noting any part of the flow not described. Designs no SOP document and mutates no task system."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read the business process as described or exposed — its steps, handoffs, owners, and any cycle times — then interpret it against common flow-constraint signatures to name where work backs up, where steps are redundant, and where it could be tightened; grounded only in what the process data shows, flagging any part not described as not available. Analysis of the operational flow only — it produces no formal SOP write-up (Cat 2 draft_sop_process_doc) and executes nothing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$capacity_review$s$, $s$Capacity Review$s$, $s$Reads the team or personal workload already exposed and flags who is over capacity, where there's slack, and which owners are overloaded — every flag keyed to a present figure, honest where workload data is absent.$s$,
    $s$operations_process$s$,
    ARRAY[$s$who's overloaded on the team$s$, $s$review our team's capacity$s$, $s$does anyone have room to take more on$s$]::text[],
    $j$[{"id": "read_workload", "tool": "context", "desc": "Read the team or personal workload the context layer exposes — open task counts, assignments and allocation per owner, and any hours or utilization figures present. For any owner with no workload data, treat it as not available rather than estimating a load."}, {"id": "surface_capacity", "tool": "anthropic", "desc": "Interpret the read workload to flag who looks over capacity, where there is slack, and which owners are overloaded — every statement keyed to a figure that is actually present, no owner assessed whose data is missing, and an explicit not-available for any workload the data does not support. Reads internal operations workload only, never the sales pipeline."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read the team or personal workload the context layer exposes — assignments, task counts, and allocation per owner — and interpret it to flag who is over capacity, where there is slack, and which owners are overloaded; every flag keyed to a present figure, with an honest not-available where workload data is absent. Internal operations workload, distinct from the sales pipeline (Cat 4 pipeline_review).$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$automation_opportunity_scan$s$, $s$Automation Opportunity Scan$s$, $s$Reads the tenant's described manual, repetitive processes and surfaces which ones the tenant could automate — what to automate, why it qualifies, and a rough effort read — scoped to the tenant's own operations, persisting nothing and reporting 'not available' when no manual processes are described.$s$,
    $s$operations_process$s$,
    ARRAY[$s$what could we automate$s$, $s$find automation opportunities in our operations$s$, $s$which of our manual tasks could be automated$s$]::text[],
    $j$[{"id": "read_processes", "tool": "context", "desc": "Read the tenant's own manual and repetitive processes as described or exposed by the context layer — the recurring tasks, their frequency, and the steps involved where present. If no manual processes are described, report it as not available rather than inventing candidates."}, {"id": "retrieve_patterns", "tool": "rag", "desc": "Retrieve automation-candidate signatures for client-based service-business operations — the marks of work that automates well: repetitive, rule-based, high-volume, low-judgment, structured-input — to frame which read processes qualify."}, {"id": "surface_candidates", "tool": "anthropic", "desc": "Interpret the read processes against the retrieved signatures to surface candidate processes the tenant could automate, each with what to automate, why it qualifies, and a rough effort read — grounded only in the processes actually described and reporting 'not available' where none are present. Scopes the tenant's OWN business operations; it does not touch or describe Paige's internal sub-agent teams (Cat 11)."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read the tenant's own manual and repetitive processes as described, match them against signatures of work that automates well — repetitive, rule-based, high-volume, low-judgment — and surface candidate processes the tenant could automate with what to automate, why it qualifies, and a rough effort read; grounded only in described processes and reporting 'not available' where none are present. Scopes the tenant's business operations, NOT Paige's own agent-orchestration fabric (Cat 11 skill-forge/skill-runner).$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$project_status_review$s$, $s$Project Status Review$s$, $s$Reads an internal project or initiative's status already exposed and surfaces at-risk items, blockers, and what's overdue — every item keyed to present status data, honest where a project's status is absent.$s$,
    $s$operations_process$s$,
    ARRAY[$s$how's this project tracking$s$, $s$what's at risk on our initiatives$s$, $s$review our internal project status$s$]::text[],
    $j$[{"id": "read_projects", "tool": "context", "desc": "Read the internal project or initiative status the context layer exposes — milestones, due dates, owners, declared blockers, and completion or progress where present. Treat any project or field not exposed as not available rather than assuming a status."}, {"id": "surface_risks", "tool": "anthropic", "desc": "Interpret the read status to surface which items are at risk, what is blocked, and what is overdue — every item keyed to present status data (a real due date, a declared blocker), never a status fabricated for a project whose data is absent, with an explicit not-available where status is missing. Reads INTERNAL initiatives only — not a client's delivery journey and not the sales pipeline."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read the internal project or initiative status the context layer exposes — milestones, due dates, owners, blockers, and completion — and interpret it to surface what is at risk, what is blocked, and what is overdue; every item keyed to present status data, with an honest not-available where a project's status is absent. An internal-initiative read, distinct from a client's per-client delivery journey (Cat 3 milestone_tracking) and the sales pipeline (Cat 4 pipeline_review).$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
