-- S2 wave · Category 7 (Team Management) — seed 11 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category =
-- 'team_management' (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62
-- (mechanic-descriptive only — no anchor-person name, no branded HR-framework title, no source-repo name).
-- tier_availability = §61 default; scoping = 'platform'. §2 FINANCE-CLEAN verified (0 hits).
--
-- §13 INTERPRETER-HONEST: 2 read_only+auto (hiring_pipeline_review, compensation_benchmark — persist nothing)
-- + 9 DRAFTERS (draft+confirm). NONE post a job, send an offer, revoke access, deactivate an account, or write
-- an HR record — every skill gathers context and FILES A DRAFT for owner approval; execution stays a human act.
--
-- §13 "NOT ADVICE" GUARD (the key gate for HR): the three skills that touch employment-decision territory —
-- performance_review_template, compensation_benchmark, difficult_conversation_script — each carry an EXPLICIT
-- in-copy disclaimer that the output is a generic starting reference/draft, NOT legal/HR/tax advice, to be
-- reviewed with a qualified advisor before use. (crew advice_disclaimer_ok=true.)
--
-- §18 EXCLUSIONS (wrap-don't-duplicate): NO '1:1 meeting agenda' skill — new_hire_onboarding_sequence
-- REFERENCES the existing Cat 2 draft_meeting_agenda for the actual first-1:1 agenda. NO 'sub-account team
-- building' skill — that is platform provisioning, not a tenant skill. new_hire_onboarding_sequence is EMPLOYEE
-- onboarding, explicitly distinct from Cat 3 client_onboarding_sequence; employee_offboarding_sequence is
-- EMPLOYEE departure, explicitly distinct from Cat 3 engagement_wrapup_sequence. role_responsibility_map (RACI)
-- and org_chart_mapping are tenant clarity/planning artifacts, not the §16 platform department-model doctrine.
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills registry
-- structure + standard people-ops mechanics (structured JD, staged interview + scorecard, competency-mapped
-- questions, RACI clarity map, current/target org + hiring sequence, pipeline-health read, phased 90-day
-- onboarding, multi-rater review design, public-market comp referencing, behavior-anchored corrective-conversation
-- scripting, last-day-anchored offboarding) — mechanics only, IP-clean, no branded framework.
--
-- §1 crew: 2 distillation engineers + adversarial IP-clean/§16/§18/§2/§13/"not-advice" verifier (verdict SHIP;
--   0 IP, 0 finance, 0 risk/tool; advice_disclaimer_ok=true; all §18 dedup notes confirm employee-vs-client
--   scoping + wrap-not-duplicate).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$job_description_draft$s$, $s$Job Description Draft$s$, $s$Drafts a complete job description for a role the business is hiring for — role summary, key responsibilities, requirements and qualifications, and an about-the-business section — written in the tenant's own voice and filed as a draft for the owner's review and approval before it's posted anywhere. Paige gathers the business's context and any role notes, generates the description, and files it; she does not post the job or contact any job board. This is a starting draft to shape and approve, not a finished posting.$s$,
    $s$team_management$s$,
    ARRAY[$s$draft a job description for the role I'm hiring$s$, $s$write up a JD for a new hire$s$, $s$help me post a role on my team$s$]::text[],
    $j$[{"id": "gather_context", "tool": "context", "desc": "Pull the tenant's brand voice, business description, existing team roles, and any notes about the role being hired (title, level, scope, must-haves) so the description is grounded in this specific business, not generic filler."}, {"id": "research_role_norms", "tool": "rag", "desc": "Retrieve tenant knowledge-base material and role-pattern references for the position type — typical responsibilities, common qualifications, and how comparable roles are usually scoped — to inform a complete, realistic draft."}, {"id": "draft_description", "tool": "anthropic", "desc": "Generate the job description in the tenant's voice with four sections: role summary, key responsibilities, requirements and qualifications, and about-the-business. Keep it coaching-generic and inclusive; flag any owner-only specifics (comp, exact reporting line) as items to confirm rather than inventing them."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted job description as an internal record tied to the hiring effort so the owner can revisit, edit, and reuse it."}, {"id": "file_for_approval", "tool": "pdf_render", "desc": "Render the job description as a clean document and file it as a draft for the owner's review and approval — Paige does not post it to any board; posting stays a human action."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Grounds a role's job description in the business's real context and voice, structures it into summary / responsibilities / requirements / about-the-business, and files it as an approvable draft rather than an auto-posted listing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$interview_process_design$s$, $s$Interview Process Design$s$, $s$Drafts a structured interview process for a specific role — the sequence of stages (for example screen, skills assessment, panel, final), what each stage is meant to evaluate, and a simple scorecard the team can use to rate candidates consistently. Paige gathers the role's competencies and generates the process as a draft for the owner to review, adjust, and approve; she schedules nothing and contacts no candidates. A starting framework to shape, not a committed hiring plan.$s$,
    $s$team_management$s$,
    ARRAY[$s$design an interview process for this role$s$, $s$how should I structure interviews for the new hire$s$, $s$draft an interview plan and scorecard$s$]::text[],
    $j$[{"id": "gather_role", "tool": "context", "desc": "Pull the role definition, the competencies the hire needs, team structure, and any existing job description so the process is designed around what this specific role must prove."}, {"id": "research_stage_patterns", "tool": "rag", "desc": "Retrieve tenant knowledge and interview-design reference patterns — sensible stage sequences, what each stage type evaluates well, and scorecard structures — to build a complete, defensible process."}, {"id": "draft_process", "tool": "anthropic", "desc": "Generate the interview process: the ordered stages, the purpose and evaluation focus of each stage, and a per-competency scorecard with a simple rating scale. Keep it fair and role-relevant; note where the owner should decide participants and timing."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted process and scorecard as an internal record tied to the role so the team can reuse and refine it across candidates."}, {"id": "file_for_approval", "tool": "pdf_render", "desc": "Render the interview process and scorecard as a document and file it as a draft for the owner's review and approval; Paige does not schedule interviews or invite candidates."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Designs a role-specific interview process as ordered evaluation stages plus a per-competency scorecard, grounded in the role's required competencies, and files it as an approvable framework rather than scheduling anything.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$interview_questions$s$, $s$Interview Questions$s$, $s$Drafts a set of role-specific interview questions, each mapped to a competency the role actually requires, so the interviewer can probe the things that matter instead of asking generic questions. Paige gathers the role's competencies and generates the question set as a draft for the owner to review and approve; she asks nothing of any candidate. A starting bank of questions to refine, not a fixed script.$s$,
    $s$team_management$s$,
    ARRAY[$s$draft interview questions for this role$s$, $s$what should I ask candidates for the new hire$s$, $s$give me questions mapped to the competencies$s$]::text[],
    $j$[{"id": "gather_competencies", "tool": "context", "desc": "Pull the role's required competencies, the job description, level, and team context so every question ties back to something the role genuinely needs."}, {"id": "research_question_patterns", "tool": "rag", "desc": "Retrieve tenant knowledge and behavioral/technical question patterns for the competencies in play so the set probes real evidence rather than surface answers."}, {"id": "draft_questions", "tool": "anthropic", "desc": "Generate the interview questions grouped by competency, each labeled with what it is meant to reveal and, where useful, what a strong versus weak answer looks like. Keep them fair, job-relevant, and free of anything that probes protected personal characteristics."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the competency-mapped question set as an internal record tied to the role so the team can reuse and extend it."}, {"id": "file_for_approval", "tool": "pdf_render", "desc": "Render the question set as a document and file it as a draft for the owner's review and approval; Paige does not interview or contact candidates."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Produces a role-specific interview question bank mapped one-to-one to the competencies the role requires, with intent notes per question, filed as an approvable draft rather than delivered to any candidate.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$role_responsibility_map$s$, $s$Role Responsibility Map$s$, $s$Drafts a responsibility map for a role or a small team — a RACI-style 'who owns what' that lists the key activities and marks who is Responsible, Accountable, Consulted, and Informed for each, so ownership is explicit and gaps or overlaps become visible. Paige gathers the team and role context and generates the map as a draft for the owner to review and approve; she changes no assignments in any system. A clarity tool to shape, not an org mandate.$s$,
    $s$team_management$s$,
    ARRAY[$s$map out who owns what on my team$s$, $s$draft a RACI for this role$s$, $s$clarify responsibilities across the team$s$]::text[],
    $j$[{"id": "gather_team", "tool": "context", "desc": "Pull the roles, people, and known responsibilities for the role or small team in scope, plus any workflow notes, so the map reflects how the business actually operates."}, {"id": "research_activity_set", "tool": "rag", "desc": "Retrieve tenant knowledge and responsibility-mapping references to assemble the right set of activities for this kind of role/team and a clean RACI structure."}, {"id": "draft_map", "tool": "anthropic", "desc": "Generate the responsibility map: the list of key activities and, for each, who is Responsible, Accountable, Consulted, and Informed. Call out any activity with no clear owner or with multiple accountable parties as a decision for the owner to resolve."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the responsibility map as an internal record tied to the role/team so it can be revisited as the team changes."}, {"id": "file_for_approval", "tool": "pdf_render", "desc": "Render the map as a document and file it as a draft for the owner's review and approval; Paige does not reassign duties in any tool or notify anyone."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Builds a RACI-style responsibility map for a role or small team from the activities it owns, surfaces unowned or double-accountable gaps, and files it as an approvable clarity draft rather than mutating any assignment.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$org_chart_mapping$s$, $s$Org Chart Mapping$s$, $s$Drafts a description of the team as it stands today and a proposed target structure as the business grows — the roles and reporting lines now, and the roles, reporting lines, and hiring sequence that would support the next stage. Paige gathers the current team and growth goals and generates both the current and target views as a draft for the owner to review and approve; she creates no roles and changes no reporting anywhere. A planning sketch to shape, not an org decision.$s$,
    $s$team_management$s$,
    ARRAY[$s$map my current team and where it should grow$s$, $s$draft a target org structure as we scale$s$, $s$show current and proposed reporting lines$s$]::text[],
    $j$[{"id": "gather_current", "tool": "context", "desc": "Pull the current roles, people, reporting relationships, and the owner's growth goals or capacity pressures so both the current and target views are grounded in reality."}, {"id": "research_structure_patterns", "tool": "rag", "desc": "Retrieve tenant knowledge and org-structure reference patterns for a business at this size and stage to inform a sensible target structure and hiring sequence."}, {"id": "draft_structures", "tool": "anthropic", "desc": "Generate two views: the current team structure with roles and reporting lines, and a proposed target structure showing the roles to add, how reporting would evolve, and a rough order to hire in. Keep it coaching-generic and flag choices that are the owner's to make."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the current and target structure descriptions as an internal record tied to the growth plan so they can be revisited as the team expands."}, {"id": "file_for_approval", "tool": "pdf_render", "desc": "Render the current and proposed structures as a document and file it as a draft for the owner's review and approval; Paige does not create roles or alter reporting in any system."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Describes the current team structure and a proposed target structure with roles, reporting lines, and a hiring sequence for the next growth stage, filed as an approvable planning draft rather than an executed org change.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$hiring_pipeline_review$s$, $s$Hiring Pipeline Review$s$, $s$Reads the available candidate-pipeline data for the team's open roles and surfaces where candidates are stuck — who has sat in a stage too long, which stages are clogged, and who needs a follow-up next — so nothing goes cold. This is a read-only analysis: Paige reviews and reports back, persisting nothing, contacting no candidate, and moving no one through the pipeline.$s$,
    $s$team_management$s$,
    ARRAY[$s$review my hiring pipeline$s$, $s$who in my candidate pipeline needs a follow-up$s$, $s$where are candidates getting stuck$s$]::text[],
    $j$[{"id": "read_pipeline", "tool": "context", "desc": "Read the available candidate-pipeline data for open roles — candidates, their current stage, time-in-stage, and last-activity dates — as the basis for the review."}, {"id": "reference_norms", "tool": "rag", "desc": "Retrieve tenant knowledge and pipeline-health reference patterns (reasonable time-in-stage, typical stuck points) so the analysis flags genuine stalls rather than normal waiting."}, {"id": "analyze_and_report", "tool": "anthropic", "desc": "Analyze the pipeline and report: candidates stuck beyond a reasonable time in stage, stages that are clogged, and a prioritized list of who needs a follow-up next and why. Report only what the data shows; note where data is missing rather than guessing. Persist nothing and contact no one."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Reads candidate-pipeline data against reasonable time-in-stage norms to surface stalled candidates, clogged stages, and a prioritized follow-up list, as a persist-nothing read-only analysis that never advances or contacts a candidate.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$new_hire_onboarding_sequence$s$, $s$New-Hire Onboarding Sequence$s$, $s$Drafts a phased EMPLOYEE onboarding plan for a specific role — Day 1, Week 1, Month 1, and 90-day milestones — grounded in the role's responsibilities, the team's tools, and who the new hire needs to meet. This is employee onboarding for someone you just hired onto your team; it is distinct from the client_onboarding_sequence (§18), which brings a paying CLIENT into your engagement. Paige gathers the role context, drafts the sequence in your voice, saves an internal working record, and files a rendered plan for your approval before anyone acts on it. She drafts only — she does not create accounts, send access, or file HR records.$s$,
    $s$team_management$s$,
    ARRAY[$s$draft an onboarding plan for my new hire$s$, $s$build a 90-day onboarding sequence for this role$s$, $s$someone's starting next week, get them onboarded$s$]::text[],
    $j$[{"id": "gather_role_context", "tool": "context", "desc": "Pull the role's title, responsibilities, reporting line, team, and the tools/systems this person will need from available team and role data."}, {"id": "pull_onboarding_norms", "tool": "rag", "desc": "Retrieve the business's existing onboarding norms, welcome materials, and any prior onboarding plans to keep the sequence consistent with how this team already brings people on."}, {"id": "draft_sequence", "tool": "anthropic", "desc": "Draft the phased plan — Day 1 setup and introductions, Week 1 shadowing and first tasks, Month 1 owned responsibilities, 90-day performance checkpoint — each phase with concrete milestones, owners, and a first-1:1 touchpoint (reference draft_meeting_agenda for the actual agenda)."}, {"id": "save_working_record", "tool": "client_memory", "desc": "Save an internal working record of the drafted sequence so it can be reviewed, edited, and reused for the next hire in this role."}, {"id": "render_plan", "tool": "pdf_render", "desc": "Render the onboarding plan as a shareable document filed as a draft for the manager's approval before any step is acted on."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Phased employee-onboarding design: sequence a new hire's first 90 days into Day 1 / Week 1 / Month 1 / 90-day milestone tiers, each anchored to the role's real responsibilities and required tools, with named owners and a first check-in touchpoint, so ramp is deliberate rather than ad hoc.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$performance_review_template$s$, $s$Performance Review Template$s$, $s$Drafts a performance-review template tailored to a specific role, with distinct self-assessment, manager, and peer sections, each grounded in that role's actual responsibilities and expected outcomes. Paige reads the role context, drafts rating dimensions and open-ended prompts in your voice, saves an internal working record, and files a rendered template for your approval. She drafts the template only — she does not schedule reviews, collect responses, or write anything into an HR record. This produces a generic starting template, not a legal or HR determination; review it with a qualified advisor before using it in any employment decision.$s$,
    $s$team_management$s$,
    ARRAY[$s$draft a performance review template for this role$s$, $s$build a review form with self, manager, and peer sections$s$, $s$I need a performance review for my team member$s$]::text[],
    $j$[{"id": "gather_role_context", "tool": "context", "desc": "Pull the role's responsibilities, goals, and expected outcomes from available role and team data so the review dimensions map to what this person is actually accountable for."}, {"id": "pull_review_norms", "tool": "rag", "desc": "Retrieve any existing review criteria, competency language, or prior templates the business uses so the new template stays consistent with its standards."}, {"id": "draft_template", "tool": "anthropic", "desc": "Draft the template with three sections — self-assessment, manager evaluation, and peer input — each with role-grounded rating dimensions, evidence prompts, and forward-looking development questions, plus an explicit note that this is a starting draft to review with a qualified advisor, not HR/legal advice."}, {"id": "save_working_record", "tool": "client_memory", "desc": "Save an internal working record of the drafted template so it can be edited and reused across the review cycle."}, {"id": "render_template", "tool": "pdf_render", "desc": "Render the review template as a shareable document filed as a draft for the manager's approval before it is put into use."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Role-grounded multi-rater review design: derive rating dimensions and prompts from a role's real responsibilities and outcomes, then split them into self / manager / peer perspectives so a review captures evidence from every angle — framed as a starting template for advisor review, never an employment determination.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$compensation_benchmark$s$, $s$Compensation Benchmark Reference$s$, $s$Surfaces GENERIC, publicly-reported compensation ranges for a given role and region by researching available reference sources, and presents them as a non-advice starting reference only. Paige reads the role and location, pulls ranges from public web research, and synthesizes a plain summary you can react to — she persists nothing, saves no record, and files no draft. This is a rough market reference assembled from public data, NOT a compensation recommendation and NOT legal, tax, or HR advice; confirm any actual pay decision with a qualified advisor and your own market data.$s$,
    $s$team_management$s$,
    ARRAY[$s$what's the pay range for this role in my area$s$, $s$pull a compensation benchmark for a role$s$, $s$roughly what should I budget for this position$s$]::text[],
    $j$[{"id": "resolve_role_and_region", "tool": "context", "desc": "Read the role title, seniority, and target region from the request or available data so the research is scoped to the right market."}, {"id": "research_public_ranges", "tool": "firecrawl", "desc": "Research publicly-available compensation ranges for the role and region from reputable public salary sources on the web."}, {"id": "synthesize_reference", "tool": "anthropic", "desc": "Synthesize the collected figures into a plain low/mid/high range with cited public sources and an explicit note that this is a generic market reference, not a recommendation or HR/legal/tax advice — surfaced back to the user without saving or filing anything."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$firecrawl$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Public-market compensation referencing: scope a role and region, gather publicly-reported salary ranges from reputable web sources, and present a cited low/mid/high summary as a starting reference for the operator to react to — read-only, persisting nothing, and explicitly not a pay recommendation or professional advice.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$difficult_conversation_script$s$, $s$Difficult Conversation Script$s$, $s$Drafts a script for a hard employment conversation — a performance-improvement or corrective discussion with a team member — as a starting draft you can adapt. Paige reads the role and situation, drafts an opening, the specific concern framed on observable behavior, a two-way listening beat, agreed next steps, and a close in your voice, then saves an internal working record and files a rendered script for your approval. She drafts language only — she does not send anything, notify the employee, or record any HR action. This is a starting draft, NOT legal or HR advice; the wording of any corrective or performance-improvement conversation should be reviewed with a qualified advisor before you use it.$s$,
    $s$team_management$s$,
    ARRAY[$s$help me script a hard conversation with my team member$s$, $s$draft a corrective conversation script$s$, $s$I need to talk to someone about performance, draft it$s$]::text[],
    $j$[{"id": "gather_situation_context", "tool": "context", "desc": "Read the team member's role, the specific concern, and the observable facts from the request or available data so the script stays grounded in behavior rather than character."}, {"id": "draft_script", "tool": "anthropic", "desc": "Draft the conversation — a calm opening, the concern stated on specific observable behavior and its impact, an explicit pause to hear the employee's perspective, mutually-owned next steps and a follow-up date, and a supportive close — with an explicit note that this is a starting draft to review with a qualified advisor, not legal/HR advice."}, {"id": "save_working_record", "tool": "client_memory", "desc": "Save an internal working record of the drafted script so the manager can edit it and reference it after the conversation."}, {"id": "render_script", "tool": "pdf_render", "desc": "Render the script as a private document filed as a draft for the manager's approval before the conversation happens."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Behavior-anchored corrective-conversation scripting: structure a hard conversation into open, state-the-observable-concern, listen, agree-next-steps, and close beats that keep the discussion on specific behavior and its impact — delivered as a starting draft for advisor review, never as legal or HR advice.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$employee_offboarding_sequence$s$, $s$Employee Offboarding Sequence$s$, $s$Drafts a structured EMPLOYEE offboarding plan for a departing team member — knowledge and relationship handoffs, an access-removal checklist, return-of-property items, final-week tasks, and a departure communication. This is offboarding a person leaving your team; it is distinct from the engagement_wrapup_sequence (§18), which closes out a CLIENT engagement. Paige reads the role and what the person owned, drafts the sequence in your voice, saves an internal working record, and files a rendered plan for your approval. She drafts the checklist only — she does not revoke access, deactivate accounts, or execute any step.$s$,
    $s$team_management$s$,
    ARRAY[$s$someone's leaving, draft their offboarding plan$s$, $s$build an employee offboarding checklist$s$, $s$create a handoff and access-removal sequence for a departure$s$]::text[],
    $j$[{"id": "gather_role_context", "tool": "context", "desc": "Pull the departing person's role, the accounts and systems they hold, the work and relationships they own, and their last day from available team and role data."}, {"id": "pull_offboarding_norms", "tool": "rag", "desc": "Retrieve the business's existing offboarding norms and any prior departure checklists so nothing standard is missed and the plan matches how this team already closes people out."}, {"id": "draft_sequence", "tool": "anthropic", "desc": "Draft the sequence — knowledge and relationship handoffs to named owners, a system-by-system access-removal and return-of-property checklist, final-week tasks, and a departure note — sequenced against the last day so each step has an owner and a date."}, {"id": "save_working_record", "tool": "client_memory", "desc": "Save an internal working record of the drafted plan so it can be reviewed, edited, and reused for future departures."}, {"id": "render_plan", "tool": "pdf_render", "desc": "Render the offboarding plan as a shareable document filed as a draft for the manager's approval before any access is touched or any step is acted on."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Structured employee-departure offboarding: work backward from a last day to sequence knowledge and relationship handoffs, a system-by-system access-removal and property-return checklist, and a departure communication — each with a named owner and date — so a person's exit is orderly rather than improvised.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
