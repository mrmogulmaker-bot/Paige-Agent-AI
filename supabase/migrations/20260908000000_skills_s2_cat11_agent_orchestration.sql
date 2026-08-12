-- S2 wave · Category 11 (Agent Orchestration) — seed 8 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category =
-- 'agent_orchestration' (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62
-- (mechanic-descriptive only). tier_availability = §61 default; scoping = 'platform'.
--
-- WHAT THESE ARE (§8/§14/§16/§20): the TENANT-FACING recipes for how Paige runs HER OWN team of
-- specialist sub-agents on the tenant's behalf. Each WRAPS an EXISTING orchestration capability (§18 —
-- it drives Paige's existing routing/delegation/creation flows; it does NOT define a new orchestrator,
-- surface, or table). §20: orchestration stays a CHAT act, never a management surface.
--
-- §11 TENANT-VISIBLE COPY — SCRUBBED: the distillation named the wrapped backend seams inside the
-- descriptions; that is an amateur tell (backend table/function names in visible copy). The integrator
-- SCRUBBED every backend identifier from the tenant-visible fields (name/description/methodology_anchor/
-- steps) and re-asserts zero remain. The seam→skill mapping is recorded HERE (a code comment, not
-- tenant-visible) for the §18/§14 audit:
--   route_task_to_department      → Paige's task-routing (paige-orchestrator routing)
--   assemble_agent_team           → Paige's specialist-delegation + orchestration (delegate_to_subagent / paige-orchestrator)
--   delegate_and_collect          → Paige's specialist-delegation (delegate_to_subagent)
--   design_agent_workflow         → Paige's agent-orchestration (paige-orchestrator fabric)
--   propose_new_specialist        → Paige's specialist-creation path (subagent-forge)  [§14 propose-gated]
--   skill_recipe_draft            → Paige's skill-authoring path (skill-forge)          [§14/§15 propose-gated]
--   orchestration_run_review      → the run records + audit log (paige_skill_runs / paige_audit_log)
--   agent_capability_review       → Paige's roster + skills library (paige_subagents / paige_skills)
--
-- §13/§16 INTERPRETER-HONEST: 3 read_only+auto REVIEWS (route_task_to_department, orchestration_run_review,
-- agent_capability_review — each carries ONLY {context[,rag],anthropic}, persists NOTHING (no client_memory/
-- pdf_render), and reports 'not available' when the data it reads is absent; orchestration_run_review reports
-- only what agents ACTUALLY did, never a hoped-for result) + 5 DRAFTERS (draft+confirm — assemble_agent_team,
-- delegate_and_collect, design_agent_workflow, propose_new_specialist, skill_recipe_draft — file a draft/plan
-- for approval). §16 STRUCTURAL FLOOR: NONE dispatch a team, create a specialist, create a skill, or send —
-- the interpreter has no external-send call site and every capability/creation act is draft+confirm.
--
-- §14 PROPOSE-GATE: propose_new_specialist + skill_recipe_draft DRAFT a proposal only — a human approves via
-- the specialist-creation / skill-authoring path before any executable capability exists; they ship NO code
-- and auto-create NOTHING (the learn-and-grow propose path, §15).
--
-- §18 EXCLUSIONS (wrap-don't-duplicate, crew-confirmed): design_agent_workflow choreographs PAIGE'S OWN agents
-- (which specialists, order, handoffs) — distinct ACTOR from Cat 10 workflow_design_draft (a HUMAN business
-- process for the tenant's staff). agent_capability_review surveys PAIGE'S OWN fabric (specialist roster +
-- skills library) — distinct SUBJECT from Cat 10 automation_opportunity_scan (the TENANT'S OWN manual
-- operations). Intra-set: assemble_agent_team (one-off crew) ≠ delegate_and_collect (single task→single
-- specialist) ≠ design_agent_workflow (repeatable standing play); each cross-disclaims the other two.
--
-- §2 FINANCE-CLEAN (platform default): coaching-generic orchestration ONLY — ZERO consumer-finance wording
-- (the §32.a proof's finance scan re-verifies 0 hits; clean distillation, no scrub needed).
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills registry
-- structure + standard multi-agent orchestration mechanics (task-to-owner routing, crew assembly, single-task
-- delegation, repeatable play design, capability-gap-to-specialist proposal, task-to-recipe distillation, run
-- review, roster-vs-need survey) — mechanics only, IP-clean, no branded agent-framework name.
--
-- §1 crew: 2 distillation engineers + adversarial IP/§18/§16/§14/§13/§2 verifier (verdict FIX_NEEDED — seam-
--   naming tightenings applied; then the integrator applied the §11 scrub above). ON CONFLICT (slug) DO NOTHING
--   makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$route_task_to_department$s$, $s$Route Task to Department$s$, $s$Classifies an inbound task to the department that owns it, names the specialist sub-agent that would perform it, and states the autonomy tier it should run at — a routing read that wraps the way Paige already routes work. Read-only: it reasons over the task and the available specialist roster, persists nothing, and takes no action. It reports 'not available' when the task is too unclear to place rather than guessing a department or a specialist. This is a conversational routing read, never a management surface.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$who should handle this$s$, $s$which department owns this task$s$, $s$route this to the right agent$s$, $s$which of your agents should take this$s$, $s$what autonomy tier should this run at$s$, $s$classify this request$s$]::text[],
    $j$[{"id": "read_task", "tool": "context", "desc": "Read the inbound task and the workspace context that frames it — what is being asked, for whom, and any signals about urgency or domain the context layer already exposes."}, {"id": "retrieve_roster", "tool": "rag", "desc": "Retrieve the map of departments, their mandates, and the specialist sub-agents available, so the task can be matched to the right owner and autonomy tier."}, {"id": "classify_route", "tool": "anthropic", "desc": "Classify the task to the owning department, name the specialist sub-agent that would perform it, and state the autonomy tier it should run at — analysis only; if the task is too unclear to place, report 'not available' and route nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Task-to-department classification by capability match, naming the owning specialist and the correct autonomy tier, with an honest 'not available' when the task cannot be placed.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$assemble_agent_team$s$, $s$Assemble Agent Team$s$, $s$Plans which specialist sub-agents Paige should dispatch across a multi-part job and what each one does, then files it as a reviewable dispatch plan for a human to approve. It wraps the way Paige already delegates work to her specialists but only DRAFTS the plan — a human approves before any agent is dispatched; it never runs the team itself. Team-dispatch stays a conversational act, not a separate control surface. Reports honestly on what is planned, never a hoped-for result. Distinct from designing a repeatable multi-agent play — this assembles a crew for one specific job.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$put a team on this$s$, $s$which agents should work on this job$s$, $s$assemble a crew for this$s$, $s$plan out who does what on this$s$, $s$spin up a team for this project$s$, $s$who should Paige dispatch for this$s$]::text[],
    $j$[{"id": "gather_job", "tool": "context", "desc": "Read the multi-part job's scope and desired outcome as the context layer exposes it — the distinct pieces of work it breaks into and any constraints on who does what or how."}, {"id": "retrieve_specialists", "tool": "rag", "desc": "Retrieve the available specialist sub-agents and prior team-assembly patterns so the plan draws on real capabilities and the business's own conventions."}, {"id": "generate_plan", "tool": "anthropic", "desc": "Generate the dispatch plan: which specialists to bring on, the specific assignment for each, and the order they work in — a reviewable plan, not an execution."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the dispatch plan as a pending draft for a human to approve — persist a draft only; it does not dispatch the team."}, {"id": "render_plan", "tool": "pdf_render", "desc": "Render the drafted dispatch plan (pending approval) as a shareable team-plan document for the reviewer."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Job decomposition into per-specialist assignments with an explicit dispatch order, filed as a reviewable plan for approval before any agent runs.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$delegate_and_collect$s$, $s$Delegate and Collect$s$, $s$For one defined task, drafts the delegation brief to the best-fit specialist sub-agent and the plan to collect and integrate its result for the human's review. It wraps the way Paige already delegates a task to a specialist but only DRAFTS — a human approves before the task is handed off, and no result is fetched or acted on autonomously. Reports honestly on what is planned, never a hoped-for outcome. Scoped to one task and one specialist; assembling a whole crew across a multi-part job is a separate team-assembly skill.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$hand this task to the right specialist$s$, $s$delegate this to one of your agents$s$, $s$brief an agent to do this$s$, $s$who should do this one thing and how$s$, $s$draft the handoff for this task$s$, $s$assign this to a specialist and collect the result$s$]::text[],
    $j$[{"id": "read_task", "tool": "context", "desc": "Read the one defined task and the context around it, and identify the single specialist sub-agent whose capabilities fit it best."}, {"id": "retrieve_conventions", "tool": "rag", "desc": "Retrieve the chosen specialist's capabilities and the business's briefing conventions so the delegation brief is complete and in the right form."}, {"id": "generate_brief", "tool": "anthropic", "desc": "Draft the delegation brief for the specialist — the task, the inputs, and the expected output — together with the plan to collect its result and integrate it back for the human's review."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the delegation brief and collection plan as a pending draft for human approval — persist a draft only; nothing is sent to the specialist and no result is fetched autonomously."}, {"id": "render_brief", "tool": "pdf_render", "desc": "Render the drafted brief and collection plan as a shareable document for the reviewer."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Single-task delegation brief paired with a collect-and-integrate plan, filed as a draft for approval before the specialist is engaged.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$design_agent_workflow$s$, $s$Design Agent Workflow$s$, $s$Designs a REPEATABLE multi-agent play for a recurring job — which specialist sub-agents take part, the order they run in, and the handoffs between them — and files it as a draft for approval. It designs the choreography of Paige's OWN agent team over the way Paige already orchestrates her agents; it does not run or schedule the play. This is distinct from designing a human business process (an operations-category workflow-design skill, which maps how the tenant's staff work): this maps how Paige's agents coordinate with each other. Different actor — Paige's agents, not the tenant's people. A design draft only — a human approves before it becomes a standing play.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$design a repeatable agent play for$s$, $s$set up how your agents handle this recurring job$s$, $s$build a standing multi-agent workflow for$s$, $s$how should your team run this every time$s$, $s$design the agent handoffs for this recurring work$s$, $s$create a reusable play for this job$s$]::text[],
    $j$[{"id": "gather_job", "tool": "context", "desc": "Read the recurring job this play should handle — how it arrives, the outcome it must produce, and the steps it currently takes — as the context layer exposes it."}, {"id": "retrieve_plays", "tool": "rag", "desc": "Retrieve existing multi-agent plays and handoff conventions so the design reuses proven patterns and the available specialists."}, {"id": "generate_play", "tool": "anthropic", "desc": "Design the repeatable play: which specialist sub-agents take part, the order they run in, and the handoff between each — the agent-team choreography for the recurring job, not a human staff process."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted play as a pending draft for human approval — persist a draft only; it defines the play, it does not run or schedule it."}, {"id": "render_map", "tool": "pdf_render", "desc": "Render the play as a shareable map — the participating agents, their run order, and the handoffs between them."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Repeatable multi-agent play design — participating specialists, run order, and inter-agent handoffs — filed as a draft for approval, distinct from human business-process design.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$propose_new_specialist$s$, $s$Propose New Specialist$s$, $s$When a recurring need has no fitting specialist on Paige's current roster, DRAFTS a proposal for a new specialist sub-agent — its role and mandate, the best-fit model tier for its work (a lighter tier for simple high-volume work, a stronger tier only for hard reasoning), and the least-privilege tool set it should carry — and files it as a draft for a human to approve. This wraps the way Paige already creates a new specialist: it PROPOSES the specialist's definition only and NEVER ships executable code or auto-creates the agent — a human approves the plan first, and any new executable capability routes through the approval path. Reads the recurring need and the current roster from the context layer, reuses the business's own prior specialist patterns, generates the proposed definition, and persists a reviewable draft. Distinct from designing a repeatable multi-agent play (that plans how existing specialists hand off); this proposes a NEW specialist that does not yet exist.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$we keep needing something Paige can't do yet$s$, $s$propose a new specialist for this$s$, $s$should we build a new agent for$s$, $s$there's no agent for this kind of work$s$, $s$draft a new specialist to handle$s$, $s$we need a dedicated agent for this recurring job$s$]::text[],
    $j$[{"id": "read_need", "tool": "context", "desc": "Read the recurring need and the current specialist roster the context layer exposes; if the need is not clear enough to define a role, report 'not available' and propose nothing rather than inventing a specialist."}, {"id": "retrieve_patterns", "tool": "rag", "desc": "Retrieve the business's own prior specialist definitions and role conventions so the proposed specialist matches its mandate style, model-tier choices, and tool-scoping norms."}, {"id": "draft_specialist", "tool": "anthropic", "desc": "Generate the proposed specialist definition: its role and mandate, the best-fit model tier for its task tier (cost-low for simple/high-volume, stronger only for hard reasoning), and a least-privilege tool set — a reviewable proposal, not a shipped agent."}, {"id": "file_proposal", "tool": "client_memory", "desc": "File the proposed specialist as a pending draft for a human to approve via the specialist-creation path — persist a proposal only; create no agent and ship no code."}, {"id": "render_proposal", "tool": "pdf_render", "desc": "Render the drafted specialist proposal (pending approval) as a shareable document for the reviewer."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Capability-gap-to-specialist proposal: role and mandate definition with best-fit model-tier selection and least-privilege tool scoping, drafted for approval — never auto-created.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$skill_recipe_draft$s$, $s$Skill Recipe Draft$s$, $s$When the tenant wants a repeatable task standardized into a reusable recipe, DRAFTS a new skill recipe — its ordered steps, the methodology anchor (the mechanic the recipe follows), and its risk level and autonomy lane — and files it as a draft for a human to approve. This wraps the way Paige already authors a skill: it PROPOSES the recipe definition only and NEVER auto-creates the skill or ships executable code — a human approves the plan first (the learn-and-grow propose path). Reads the task the tenant wants standardized from the context layer, reuses the business's own prior recipes for structure and voice, generates the proposed recipe, and persists a reviewable draft. Distinct from running an existing skill; this authors a NEW recipe for later approval, and stays in the tenant's own scope.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$turn this into a reusable skill$s$, $s$standardize this task as a recipe$s$, $s$draft a new skill for this$s$, $s$save this as a repeatable skill$s$, $s$make this a skill we can run again$s$, $s$propose a skill recipe for this workflow$s$]::text[],
    $j$[{"id": "read_task", "tool": "context", "desc": "Read the task the tenant wants standardized and how they run it today from the context layer; if it is too unclear to structure into steps, report 'not available' and draft nothing."}, {"id": "retrieve_recipes", "tool": "rag", "desc": "Retrieve the business's own prior skill recipes to match their step granularity, methodology-anchor phrasing, and risk/lane conventions."}, {"id": "draft_recipe", "tool": "anthropic", "desc": "Generate the proposed recipe: ordered steps, a mechanic-descriptive methodology anchor, and the fitting risk level and autonomy lane — a reviewable proposal, not a created skill."}, {"id": "file_proposal", "tool": "client_memory", "desc": "File the proposed recipe as a pending draft for a human to approve via the skill-authoring path — persist a proposal only; create no skill and ship no code."}, {"id": "render_proposal", "tool": "pdf_render", "desc": "Render the drafted recipe proposal (pending approval) as a shareable document for the reviewer."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Task-to-recipe distillation: ordered-step decomposition with a mechanic-descriptive methodology anchor and a risk/autonomy-lane assignment, drafted for approval — never auto-created.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$orchestration_run_review$s$, $s$Orchestration Run Review$s$, $s$READS the outcomes of a past multi-agent run — from the run records and audit log Paige already keeps — and summarizes, honestly, what each specialist actually did and produced: which agents ran, what each returned, and how the results were integrated. Read-only: it persists nothing and takes no action. It reports ONLY what the run records actually show — never a hoped-for or fabricated result — and states 'not available' when there is no run data to read. It draws on the run records and audit log Paige already keeps; it reviews a past run, it does not run, re-run, or dispatch anything.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$how did the last run go$s$, $s$review what the agents actually did$s$, $s$summarize the results of that multi-agent job$s$, $s$what did each specialist produce$s$, $s$recap the last orchestration run$s$, $s$did that agent team finish what it was assigned$s$]::text[],
    $j$[{"id": "read_run", "tool": "context", "desc": "Read the past run's records and audit-log entries Paige already keeps — which specialists ran, their inputs, and what each returned; if no run data is present, report 'not available' and summarize nothing."}, {"id": "summarize_run", "tool": "anthropic", "desc": "Summarize honestly what each agent actually did and produced and how the results were integrated, grounded only in the run records present — never a hoped-for outcome, and flagging any step with no recorded result as not available. Analysis only, persist nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Honest read of the recorded multi-agent run (skill-run records + audit log) reporting only each agent's actual output, with an explicit 'not available' when no run data exists.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$agent_capability_review$s$, $s$Agent Capability Review$s$, $s$Surveys the specialists and skills Paige currently has available for the tenant — from Paige's own roster of specialists and skills — and surfaces the capability GAPS: the recurring kinds of work Paige cannot yet do for them, and where the roster is thin. Read-only: it persists nothing and takes no action. It reports ONLY what the registry and library actually list — never a fabricated capability — and states 'not available' when there is nothing to survey. It draws on Paige's own roster of specialists and skills. Distinct from scanning the TENANT'S OWN manual processes for automation opportunities (that reads the tenant's operations); this surveys Paige's OWN fabric of specialists and skills.$s$,
    $s$agent_orchestration$s$,
    ARRAY[$s$what can Paige's team do for us$s$, $s$where are the gaps in what Paige can handle$s$, $s$what specialists and skills do we have$s$, $s$what can't Paige do yet$s$, $s$review our agent capabilities$s$, $s$what's missing from Paige's team$s$]::text[],
    $j$[{"id": "read_roster", "tool": "context", "desc": "Read the specialists and skills Paige already has available for this tenant; if neither lists anything, report 'not available' and survey nothing."}, {"id": "retrieve_needs", "tool": "rag", "desc": "Retrieve the business's own recurring kinds of work and prior requests to frame which of them the current roster does and does not cover."}, {"id": "surface_gaps", "tool": "anthropic", "desc": "Compare the recurring needs against the listed specialists and skills to name concrete capability gaps — grounded only in what the registry and library actually list, never inventing a capability. Analysis only, persist nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Roster-versus-need survey of Paige's own specialist registry and skills library to surface capability gaps, grounded only in what is listed, with an honest 'not available' when there is nothing to survey.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
