-- S2 wave · Category 3 (Client Delivery) — seed 6 platform baseline skills into paige_skills.
--
-- These run through the generic S1b interpreter (default dispatch) — NO bespoke handler code. category =
-- 'client_delivery' (canonical §15, locked by the CHECK in 20260830000000). Each row is IP-CLEAN per
-- §14/§62 (mechanic-descriptive only — no anchor-person name, no branded framework title, no source-repo
-- name). tier_availability = §61 default; scoping = 'platform'.
--
-- §13 INTERPRETER-HONEST / §18 WRAP-DON'T-DUPLICATE: the S1b interpreter DRAFTS (it forges text, saves an
-- internal record, renders a doc, files an approval) — it cannot itself invite/send/mutate. So 5 of these
-- are DRAFTERS (draft+confirm) and 1 is a read-only status reader (read_only+auto); NONE send externally.
-- Each drafter NAMES the existing downstream seam in its step desc rather than reimplementing it:
--   • client_onboarding_sequence → send-portal-invite / send-welcome-email / systems-check-run-onboarding
--   • progress_checkin_draft, reactivation_sequence → the compose-email seam (downstream send)
--   • reactivation_sequence → crm_search_contacts (find lapsed clients)
-- And it REFERENCES the Cat 2 document skills instead of re-drafting them:
--   • engagement_wrapup_sequence orchestrates draft_offboarding_document + draft_testimonial_interview_outline
--   • client_onboarding_sequence is the multi-touch JOURNEY, distinct from the static draft_onboarding_packet
--   • the kickoff meeting-agenda need is already draft_meeting_agenda (§18 — excluded from this seed)
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): distilled from the
-- Anthropic Skills registry co-authoring/sequence STRUCTURE + standard client-success delivery mechanics
-- (onboarding-journey sequencing, pre-mortem-free delivery-health status, offer-grounded deliverable fill,
-- win-back re-engagement) — mechanics only, rewritten IP-clean.
--
-- §1 crew: distillation engineer + adversarial IP-clean/§16/§18 verifier (verdict SHIP; 0 IP violations,
--   0 risk/tool issues; all §18 dedup notes confirm wrap-not-duplicate against Cat 1/Cat 2).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$client_onboarding_sequence$s$, $s$New Client Kickoff Journey Drafter$s$, $s$Drafts the orchestrated multi-touch kickoff journey for a new client — the welcome touch, the intake questions to send, expectation-setting, and the first milestone — as one approval-ready sequence a human signs off on before anything goes out. This is the multi-step JOURNEY across time, distinct from the static draft_onboarding_packet (a one-time bundle of onboarding documents); this skill orchestrates the touches, it does not assemble the packet.$s$,
    $s$client_delivery$s$,
    ARRAY[$s$set up onboarding for my new client$s$, $s$draft the kickoff sequence for a new client$s$, $s$welcome my new client and get them started$s$]::text[],
    $j$[{"id": "gather_client", "tool": "context", "desc": "Read the new client's record (name, engagement, offer they bought, start date) plus the tenant's offer definition so the journey is grounded in this specific client, not a generic template."}, {"id": "pull_journey_template", "tool": "rag", "desc": "Retrieve the tenant's Playbook onboarding journey template (stages, standard intake questions, cadence) to shape the sequence to how this business actually onboards."}, {"id": "draft_sequence", "tool": "anthropic", "desc": "Draft the full kickoff journey as ordered touches — (1) welcome, (2) intake questions to gather, (3) expectation-setting, (4) first milestone — in the tenant's voice. Each delivery touch names its downstream seam for execution after approval: the portal-access touch routes through send-portal-invite, the welcome touch through send-welcome-email, and the tenant-side readiness step through systems-check-run-onboarding. This skill DRAFTS only; the actual invite/send/check fire later through those approved seams."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted sequence as an internal draft record tied to this client, filed for the human to review, edit, and approve before any touch is sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Orchestrated new-client onboarding as a sequenced set of approval-gated touches (welcome, intake, expectations, first milestone) grounded in the client record and the tenant's onboarding journey template, with each delivery touch mapped to its downstream execution seam.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$milestone_tracking$s$, $s$Client Delivery Status Reader$s$, $s$Reads where each active client sits in their delivery journey and returns a plain-language status summary — on-track, at-risk, or stalled — with the signal behind each call. Read-only: it inspects client data and journey state and reports; it saves nothing and sends nothing.$s$,
    $s$client_delivery$s$,
    ARRAY[$s$where are my clients in their journey$s$, $s$which clients are falling behind$s$, $s$give me a delivery status on my clients$s$]::text[],
    $j$[{"id": "read_client_state", "tool": "context", "desc": "Read active client records and their current delivery-journey position (stage reached, last activity, upcoming milestone, days since last touch)."}, {"id": "pull_stage_defs", "tool": "rag", "desc": "Retrieve the tenant's Playbook journey stage definitions and expected cadence so each client's real position can be compared against where they should be by now."}, {"id": "summarize_status", "tool": "anthropic", "desc": "Synthesize a status summary per client — on-track / at-risk / stalled — naming the concrete signal for each verdict (e.g. missed milestone, no touch in N days). Read-only output for the human to review; nothing is saved or sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read-only delivery-health assessment that positions each client against the expected journey cadence and classifies status (on-track / at-risk / stalled) with an explicit driving signal per client.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$client_deliverable_draft$s$, $s$Client Deliverable Drafter$s$, $s$Drafts the specific deliverable a tenant's offer produces for a client — an assessment, a plan, a report — grounded in the tenant's offer and this client's own context, and renders it as a document for review. It produces an approval-ready draft; the human reviews and approves before it reaches the client.$s$,
    $s$client_delivery$s$,
    ARRAY[$s$draft the assessment for my client$s$, $s$write up this client's plan$s$, $s$put together the report for my client$s$]::text[],
    $j$[{"id": "gather_context", "tool": "context", "desc": "Read this client's record, intake answers, and history plus the tenant's offer definition so the deliverable reflects what this client actually needs, not a template fill-in."}, {"id": "pull_deliverable_template", "tool": "rag", "desc": "Retrieve the tenant's deliverable structure and methodology for this offer (sections, framework, standard components) so the draft matches how this business delivers."}, {"id": "draft_deliverable", "tool": "anthropic", "desc": "Draft the specific deliverable (assessment / plan / report) in the tenant's voice, filling the methodology with this client's real context."}, {"id": "render_doc", "tool": "pdf_render", "desc": "Render the drafted deliverable as a formatted document so the human can review it as the client would see it."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the draft as an internal record tied to this client, filed for human review and approval before delivery."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$pdf_render$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Offer-grounded deliverable drafting that fills the tenant's delivery methodology with the individual client's context, renders it for review, and files it as an approval-gated draft.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$progress_checkin_draft$s$, $s$Client Progress Check-in Drafter$s$, $s$Drafts a periodic progress check-in message for a client on the engagement's cadence — what's been done, what's next, and one clear ask — in the tenant's voice. It produces an approval-ready message; after the human approves, the actual send happens through the compose-email seam.$s$,
    $s$client_delivery$s$,
    ARRAY[$s$draft a check-in for my client$s$, $s$send my client a progress update$s$, $s$write the weekly update for this client$s$]::text[],
    $j$[{"id": "read_progress", "tool": "context", "desc": "Read the client's record for what's been completed since the last touch, what milestone is next, and any open item that needs the client's input."}, {"id": "pull_cadence", "tool": "rag", "desc": "Retrieve the tenant's engagement cadence and journey template so the check-in matches the rhythm and tone this business uses."}, {"id": "draft_checkin", "tool": "anthropic", "desc": "Draft the check-in message — what's done, what's next, one specific ask — in the tenant's voice. Names the compose-email seam as the downstream send path used after approval; this skill DRAFTS only and does not itself send."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted message as an internal record tied to this client, filed for the human to review, edit, and approve before it is sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Cadence-driven progress check-in drafting structured as done / next / one ask, grounded in the client's recent delivery state, filed as an approval-gated draft for downstream send.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$engagement_wrapup_sequence$s$, $s$Engagement Graduation Flow Drafter$s$, $s$Drafts the end-of-engagement graduation flow for a client as one approval-ready sequence — a results recap, final handoffs, a renewal or next-step offer, and a testimonial ask. It orchestrates the pieces and sequences them; it references draft_offboarding_document for the formal offboarding document and draft_testimonial_interview_outline for the testimonial questions rather than re-drafting either.$s$,
    $s$client_delivery$s$,
    ARRAY[$s$wrap up my client's engagement$s$, $s$draft the graduation flow for this client$s$, $s$my client is finishing, set up the offboarding$s$]::text[],
    $j$[{"id": "gather_results", "tool": "context", "desc": "Read the client's engagement history and outcomes so the results recap and next-step offer are grounded in what this client actually achieved."}, {"id": "pull_wrapup_template", "tool": "rag", "desc": "Retrieve the tenant's graduation/offboarding journey template (recap structure, standard handoffs, renewal offers) so the flow matches how this business closes engagements."}, {"id": "draft_flow", "tool": "anthropic", "desc": "Draft the graduation flow as ordered touches — results recap, final handoffs, renewal/next-step offer, testimonial ask — in the tenant's voice. It ORCHESTRATES, not re-drafts: the formal offboarding document is produced by draft_offboarding_document and the testimonial questions by draft_testimonial_interview_outline; this sequence references and slots those pieces into the flow."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted graduation sequence as an internal record tied to this client, filed for human review and approval before any touch goes out."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$End-of-engagement graduation orchestration that sequences a results recap, handoffs, a renewal/next-step offer, and a testimonial ask, referencing the existing offboarding-document and testimonial-outline skills for those components rather than reproducing them.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$reactivation_sequence$s$, $s$Lapsed Client Win-Back Drafter$s$, $s$Drafts a win-back sequence for a lapsed client — a personalized re-engagement message that references their prior work plus a low-friction re-entry offer — as an approval-ready draft. It references crm_search_contacts to identify lapsed clients and the compose-email seam for the downstream send after the human approves.$s$,
    $s$client_delivery$s$,
    ARRAY[$s$win back my lapsed clients$s$, $s$draft a re-engagement message for a client who went quiet$s$, $s$reach out to clients who dropped off$s$]::text[],
    $j$[{"id": "find_lapsed", "tool": "context", "desc": "Read the target lapsed client's record — prior work, last engagement, what they were working toward — to personalize the outreach. References crm_search_contacts as the seam that identifies which clients have lapsed."}, {"id": "pull_reentry_offer", "tool": "rag", "desc": "Retrieve the tenant's win-back template and low-friction re-entry offer options so the sequence matches how this business re-engages past clients."}, {"id": "draft_winback", "tool": "anthropic", "desc": "Draft the personalized re-engagement message referencing the client's prior work and progress, paired with a specific low-friction re-entry offer, in the tenant's voice. Names the compose-email seam as the downstream send path used after approval; this skill DRAFTS only and does not itself send."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted win-back sequence as an internal record tied to this client, filed for the human to review, edit, and approve before it is sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Lapsed-client win-back drafting that grounds a personalized re-engagement message in the client's prior work and pairs it with a low-friction re-entry offer, identifying targets via the contact-search seam and filing an approval-gated draft for downstream send.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
