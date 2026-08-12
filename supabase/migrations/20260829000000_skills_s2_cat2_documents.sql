-- S2 wave · Category 2 (Document Creation) — seed 17 platform baseline skills into paige_skills.
--
-- These run through the generic S1b interpreter (default dispatch) — NO bespoke handler code. category =
-- 'documents' so the S1d format-picker (needsFormat) fires: each doc skill asks Word/Google Doc/PDF/Markdown
-- before generating (§19/Task #50). Each row is IP-CLEAN per §14/§62: name + description + steps +
-- methodology_anchor are MECHANIC-DESCRIPTIVE only — no anchor-person name, no branded framework title, no
-- source-repo name. tier_availability = §61 default; scoping = 'platform'; every skill is a DRAFTER
-- (risk_level 'draft' + autonomy_lane 'confirm') — Paige drafts, a human approves (§16/§36 draft-first).
-- NONE send externally: the interpreter files a draft to paige_pending_approvals; any send is a later,
-- human-approved seam.
--
-- §18 SCOPE (integrator): the §15 Document-Creation list items that belong to OTHER homes are excluded here
--   — 'Landing page draft' + 'Funnel step drafts' are Studio §19 artifacts (routed to the Studio, not a doc
--   recipe); 'Invoice / SOW' + 'Reminder / dunning' are Financial Ops (Cat 8, seeded later). This leaves 17
--   genuine document-deliverable skills. draft_and_email_document (the existing bespoke email-a-doc skill) is
--   NOT duplicated: these 17 are type-specific DRAFTERS that save a record and send nothing.
--
-- SOURCING LINEAGE (attribution lives here in the commit/migration reference ONLY, never in a row, per §14):
--   Distilled from the Anthropic Skills registry document/co-authoring STRUCTURE (doc-coauthoring, docx/pdf
--   creation patterns) + standard business-document mechanics (SOW problem-to-price, situation-action-result
--   case study, problem-agitate-solution direct-response letter, purpose/owner/steps SOP) — mechanics only,
--   rewritten IP-clean. No branded framework or person name in any row.
--
-- §1 crew: 2 distillation engineers + adversarial IP-clean/§16/§18 verifier (verdict SHIP; 0 IP violations,
--   0 risk/tool issues; integrator softened draft_ebook_guide 'Playbook' wording to avoid the §7 platform
--   'Playbook' term collision).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$draft_offer_letter$s$, $s$Offer Letter Drafter$s$, $s$Drafts an engagement or hire offer letter that states the role, terms, compensation, start date, and acceptance step in a clear, confident tone. Produces a draft for the owner to review and approve before it goes out.$s$,
    $s$documents$s$,
    ARRAY[$s$draft an offer letter$s$, $s$write an offer for this hire$s$, $s$put together a contractor offer$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the recipient name, role, compensation, start date, and engagement terms from the request and existing records."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the offer letter opening with a warm confirmation, then state role, compensation, start date, and terms, and close with a single clear acceptance step."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted offer letter as a record tied to the recipient for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$confirm-then-terms structure: lead with a warm role confirmation, enumerate compensation and start terms plainly, and end on a single explicit acceptance action$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_client_proposal$s$, $s$Scoped Proposal Drafter$s$, $s$Drafts a statement-of-work proposal scoped to a specific client: the problem, the proposed scope of work, deliverables, timeline, and pricing. Produces a draft for the owner to review and approve.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a proposal for this client$s$, $s$write a statement of work$s$, $s$put together a scoped proposal$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the client name, stated need, engagement scope, and pricing basis from the request and existing records."}, {"id": "reference", "tool": "rag", "desc": "Reference the tenant's service offerings and playbook to align deliverables and pricing with how the business actually works."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the proposal as problem framing, proposed scope and deliverables, timeline, and a clear pricing section with a next-step to move forward."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted proposal as a record tied to the client for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$problem-to-price sequence: frame the client's problem, lay out scoped deliverables and timeline, then present pricing tied to a single move-forward action$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_engagement_contract$s$, $s$Engagement Contract Template Drafter$s$, $s$Drafts a starting engagement agreement template covering scope, term, payment terms, responsibilities, and termination as a first draft to review with a qualified advisor. This is a starting template, not legal advice.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a contract template$s$, $s$write a basic engagement agreement$s$, $s$put together a starting contract$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the party names, engagement scope, term, and payment terms from the request and existing records."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a plain-language engagement template with scope, term, payment, responsibilities, and termination clauses, and note plainly that it is a starting draft to review with a qualified advisor before use."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted contract template as a record tied to the engagement for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$clause-block template assembly: standard engagement sections (scope, term, payment, responsibilities, termination) drafted in plain language as a review-first starting point, explicitly flagged as not legal advice$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_welcome_email$s$, $s$Welcome Email Drafter$s$, $s$Drafts a warm welcome email for a new client, new hire, or new list member that confirms the relationship, sets expectations, and points to the first step. Produces a draft only; nothing is sent.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a welcome email$s$, $s$write a welcome message for a new client$s$, $s$welcome this new hire$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the recipient name, relationship type, and the intended first step from the request and existing records."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a warm welcome that confirms the relationship, sets clear expectations, and directs the reader to one specific first step."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted welcome email as a record tied to the recipient for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$confirm-expect-direct structure: affirm the new relationship, set expectations for what comes next, and point to a single concrete first action$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_followup_email$s$, $s$Follow-Up Email Drafter$s$, $s$Drafts a single follow-up email after a meeting or touchpoint that references the prior context, restates the value, and asks for one clear next step. Produces a draft only; nothing is sent.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a follow-up email$s$, $s$write a follow-up after this meeting$s$, $s$send them a follow-up$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the recipient name, the prior touchpoint details, and the desired next step from the request and existing records."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a short follow-up that references the prior conversation, restates the value briefly, and asks for one specific next step."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted follow-up email as a record tied to the recipient for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$reference-value-ask structure: anchor to the prior touchpoint, restate the value in one line, and close on a single explicit next step$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_meeting_recap$s$, $s$Meeting Recap Drafter$s$, $s$Drafts a post-meeting summary that captures the key discussion, decisions made, and assigned action items with owners. Produces a draft record for the owner to review and approve.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a meeting recap$s$, $s$summarize what we decided$s$, $s$write up the meeting notes$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the meeting participants, discussion points, decisions, and action items from the provided notes or transcript."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the recap as a brief summary followed by a decisions list and an action-items list with an owner and due timing for each item."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted meeting recap as a record tied to the meeting for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$summary-decisions-actions structure: condense the discussion, list the decisions reached, then enumerate action items each with an owner and timing$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_meeting_agenda$s$, $s$Meeting Agenda Drafter$s$, $s$Drafts a pre-meeting agenda for a specific meeting type with a clear objective, ordered topics with time allocations, and a desired outcome. Produces a draft for the owner to review and approve.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a meeting agenda$s$, $s$put together an agenda for this call$s$, $s$plan the agenda$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the meeting type, participants, objective, and time available from the request and existing records."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the agenda with a stated objective, ordered topics each with a time allocation, and the desired outcome to close on."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted agenda as a record tied to the meeting for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$objective-topics-outcome structure: open with the meeting objective, sequence timed discussion topics, and name the outcome the meeting should reach$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_one_pager$s$, $s$One-Pager Drafter$s$, $s$Drafts a single-page overview of an offer, service, or set of credentials with a headline, the core value, supporting points, and a call to action. Produces a draft for the owner to review and approve.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a one-pager$s$, $s$write a one page overview$s$, $s$make a one-pager for this service$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the offer or service details, audience, and key credentials from the request and existing records."}, {"id": "reference", "tool": "rag", "desc": "Reference the tenant's offerings and brand material to ground the value points and proof in how the business actually presents itself."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the one-pager with a sharp headline, the core value statement, three to five supporting proof points, and a single call to action."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted one-pager as a record tied to the offer for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$headline-value-proof-action structure: lead with a sharp headline, state the core value, back it with a few proof points, and close on one call to action$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_case_study$s$, $s$Case Study Drafter$s$, $s$Drafts a client-outcome case study organized as situation, what was done, and the result, with concrete details and a closing takeaway. Produces a draft for the owner to review and approve.$s$,
    $s$documents$s$,
    ARRAY[$s$draft a case study$s$, $s$write up this client result$s$, $s$turn this win into a case study$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the client situation, the work performed, and the measurable result from the request and existing records."}, {"id": "reference", "tool": "rag", "desc": "Reference the tenant's service details and prior client records to ground the case study in what was actually delivered."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the case study as the starting situation, the specific work done, and the concrete result, closing with a takeaway that generalizes the win."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted case study as a record tied to the client for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$situation-action-result narrative: open on the client's starting situation, detail the specific work performed, and land on the measurable outcome with a closing takeaway$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_ebook_guide$s$, $s$Long-Form Guide & Ebook Drafter$s$, $s$Drafts a structured multi-section lead-magnet or reference document — chapters, sub-points, and a closing next-step — from a topic and the tenant's knowledge base, for the owner to review before publishing. Saves a record of the drafted guide.$s$,
    $s$documents$s$,
    ARRAY[$s$draft an ebook on this$s$, $s$make me a guide for my leads$s$, $s$turn my material into a downloadable guide$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Collect the topic, target reader, desired length, and the core promise the document should deliver."}, {"id": "ground", "tool": "rag", "desc": "Pull the tenant's relevant knowledge, playbook material, and prior positioning to source the substance from what they actually teach."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a chaptered draft that opens with the reader's problem, builds section by section from foundation to advanced, and closes with a single clear next step."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted guide as a reviewable record tied to its topic and intended audience."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$progressive chaptered structure moving from problem to foundational to advanced material, closing on one call to action$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_checklist_worksheet$s$, $s$Checklist & Worksheet Builder$s$, $s$Drafts an actionable checklist or fill-in worksheet — ordered steps or prompted blanks a client completes — from a described task or outcome, for the owner to review. Saves a record of the drafted worksheet.$s$,
    $s$documents$s$,
    ARRAY[$s$make a checklist for this$s$, $s$build me a worksheet$s$, $s$turn this process into a fill-in sheet$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Capture the task or outcome the checklist serves, who fills it out, and whether it should be check-off items or prompted blanks."}, {"id": "compose", "tool": "anthropic", "desc": "Compose an ordered set of concrete, single-action items or fill-in prompts grouped into logical stages with a clear completion marker."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted checklist or worksheet as a reviewable record tied to its task."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$decomposition of an outcome into ordered single-action items or prompted blanks grouped by stage$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_sales_letter$s$, $s$Direct-Response Sales Letter Drafter$s$, $s$Drafts a long-form persuasive letter that names the reader's problem, deepens the stakes of leaving it unsolved, presents the offer as the resolution, and drives one clear call to action — for the owner to review before sending. Saves a record of the drafted letter.$s$,
    $s$documents$s$,
    ARRAY[$s$write a sales letter for my offer$s$, $s$draft a long-form pitch$s$, $s$make me a persuasive letter to sell this$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Collect the offer, the target reader, the core problem it solves, the proof available, and the single action the letter should drive."}, {"id": "ground", "tool": "rag", "desc": "Pull the tenant's voice, positioning, and prior client outcomes to keep the claims specific and on-brand."}, {"id": "compose", "tool": "anthropic", "desc": "Compose the letter as problem statement, escalation of the cost of inaction, the offer as resolution, and one unambiguous call to action."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted sales letter as a reviewable record tied to its offer."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$problem-agitate-solution framing resolving into a single clear call to action$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_sop_process_doc$s$, $s$Standard Operating Procedure Drafter$s$, $s$Drafts a step-by-step operating procedure for a repeatable task — purpose, owner, prerequisites, numbered steps, and a done-check — for the owner to review before adopting. Saves a record of the drafted procedure.$s$,
    $s$documents$s$,
    ARRAY[$s$write an SOP for this$s$, $s$document this process step by step$s$, $s$turn how we do this into a procedure$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Capture the task, who performs it, the trigger that starts it, the tools involved, and what a finished result looks like."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a procedure with purpose, role owner, prerequisites, numbered sequential steps, and an explicit completion check."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted procedure as a reviewable record tied to its task and owner role."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$purpose-and-owner header followed by prerequisites, numbered sequential steps, and a completion verification$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_onboarding_packet$s$, $s$Client Onboarding Packet Assembler$s$, $s$Drafts the bundle of kickoff materials a new client receives — welcome note, what-to-expect timeline, first steps, and key contacts — from the engagement details, for the owner to review before sending. Saves a record of the drafted packet.$s$,
    $s$documents$s$,
    ARRAY[$s$put together an onboarding packet$s$, $s$draft welcome materials for a new client$s$, $s$make a kickoff bundle$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Collect the engagement type, start date, client name, first milestones, and the points of contact the client will work with."}, {"id": "ground", "tool": "rag", "desc": "Pull the tenant's brand voice, journey stages, and standard first-steps material to keep the packet native to their business."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a welcome note, a what-to-expect timeline, the client's first concrete actions, and a key-contacts section as one cohesive packet."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted onboarding packet as a reviewable record tied to the client and engagement."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$kickoff bundle sequencing welcome, expectation-setting timeline, first actions, and contacts into one packet$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_offboarding_document$s$, $s$Engagement Wrap-Up & Termination Drafter$s$, $s$Drafts an end-of-engagement document — summary of what was delivered, final handoffs, outstanding items, and closing terms — from the engagement record, for the owner to review before sending. Saves a record of the drafted document.$s$,
    $s$documents$s$,
    ARRAY[$s$draft an offboarding document$s$, $s$write a wrap-up for a finished client$s$, $s$put together a termination notice$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Collect the engagement outcome, what was delivered, any open items, the effective end date, and the tone the close should carry."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a summary of results delivered, final handoffs, a list of any outstanding items, and clear closing terms with an effective date."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted offboarding document as a reviewable record tied to the client and end date."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$engagement-close structure summarizing delivery, handoffs, open items, and effective closing terms$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_testimonial_interview_outline$s$, $s$Testimonial Interview Outline Builder$s$, $s$Drafts a sequenced question outline that walks a client from their starting problem through the turning point to a concrete result, designed to elicit a specific, usable testimonial — for the owner to review before the interview. Saves a record of the drafted outline.$s$,
    $s$documents$s$,
    ARRAY[$s$make a testimonial interview outline$s$, $s$draft questions to get a good testimonial$s$, $s$help me interview a client for a review$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Capture the client, the offer they bought, the result they got, and the specific angle the testimonial should highlight."}, {"id": "compose", "tool": "anthropic", "desc": "Compose an ordered question set moving from the before-state and hesitation, through the decision and experience, to the measurable after-result and a recommendation prompt."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted interview outline as a reviewable record tied to the client."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$before-turning-point-after question sequencing that surfaces a concrete result and recommendation$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$draft_stakeholder_update_deck$s$, $s$Stakeholder Update & Board Deck Drafter$s$, $s$Drafts a periodic stakeholder update — a short narrative of the period plus prompted slots for the key metrics, wins, risks, and asks — from the reporting inputs, for the owner to review before circulating. Saves a record of the drafted update.$s$,
    $s$documents$s$,
    ARRAY[$s$draft my investor update$s$, $s$put together a board deck$s$, $s$write a stakeholder update for this month$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Collect the reporting period, headline developments, the metrics to report, current risks, and any specific asks of the stakeholders."}, {"id": "ground", "tool": "rag", "desc": "Pull prior updates and the tenant's own targets so the narrative shows change against a consistent baseline."}, {"id": "compose", "tool": "anthropic", "desc": "Compose a concise period narrative followed by structured sections for key metrics, wins, risks, and asks, with prompted slots where a figure is still needed."}, {"id": "save", "tool": "client_memory", "desc": "Save the drafted stakeholder update as a reviewable record tied to its reporting period."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$period narrative paired with structured metrics, wins, risks, and asks reported against a consistent baseline$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
