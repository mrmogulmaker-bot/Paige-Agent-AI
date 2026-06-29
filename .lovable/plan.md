# BTF Client Onboarding Flow — Build Plan

## Answers to your 5 questions (decisions baked into the plan below)

1. **Estimate.** v1 MVP (eSign + payment auth + intake + workspace handoff, admin-triggered): **~3 working days**. Full scope (admin "Start Onboarding" UX, task templates, bridge events for every transition, polished signed-PDF rendering, save/resume on every step): **~7–9 working days** total, landed in 3 increments.
2. **eSign approach.** Native. HTML canvas signature pad + typed-name fallback + server-side PDF render in an edge function using `pdf-lib` (already proven in our stack, no Chromium). Stored in a private Storage bucket with short-lived signed URLs. E-SIGN / UETA consent checkboxes captured into `signature_data` alongside IP, UA, tz, timestamp.
3. **Payment processor.** **Stripe.** Already connected (live + 2 sandbox per project memory), already used for `tier_state` + `stripe-webhook`. We'll use Stripe Customer + PaymentMethod (SetupIntent) for card-on-file, then a Subscription with a custom schedule for the split plans. No new processor.
4. **Separate flow, confirmed.** This is gated behind admin "Start Onboarding" → magic-link → `/onboard` wizard. It is NOT the `/signup` public wizard and does NOT share its routing. Public signup stays untouched.
5. **MVP for Jacqueline this week.** Ship in this exact order so she can be onboarded mid-week even if v2 polish slips:
   - Day 1: schema + admin "Start Onboarding" button + magic-link email (template already exists)
   - Day 2: `/onboard` Steps 1–3 (welcome, sign agreement, payment auth)
   - Day 3: Steps 4–6 (intake, doc upload, workspace handoff) + bridge events for `agreement_signed` / `payment_authorized` / `onboarding_completed`
   - v2: remaining 3 bridge events, task-template assignment UI, signed-PDF download in client workspace, save/resume polish, admin onboarding-state dashboard

If we slip past Wednesday, fall back to Antonio's manual hybrid for Jacqueline and ship the wizard clean for client #2.

---

## Phase 1 — Schema (Day 1, single migration)

New tables (all with `service_role` + `authenticated` grants, RLS scoped to `linked_user_id = auth.uid()` for client reads and `can_access_contact()` for staff):

- `paige_signed_agreements` — id, client_id, agreement_template_key, agreement_version, signed_pdf_path (Storage), signature_data jsonb, agreement_text_snapshot text, ip inet, user_agent text, signed_at timestamptz
- `paige_payment_authorizations` — id, client_id, plan_selected enum(`pay_in_full|split|get_started`), stripe_customer_id, stripe_payment_method_id, stripe_subscription_id, recurring_auth_text_snapshot, ip, user_agent, authorized_at, status enum(`active|revoked|expired`)
- `paige_client_intake_submissions` — id, client_id, section enum(`about_you|business|current_state|docs_checklist`), payload jsonb, submitted_at — one row per section so save/resume is trivial
- `paige_btf_documents` — id, client_id, category text (id, articles, ein_letter, bank_stmt, credit_report, other), storage_path, original_filename, mime, size_bytes, uploaded_by, uploaded_at

New columns on `clients` (additive, nullable):

- `lifecycle_stage` text — 11-state enum from Doctrine §111 (stored as text + CHECK so we can evolve without enum migrations)
- `onboarding_stage` text — `pre_invite|invited|signing_agreement|accepting_payment|completing_intake|uploading_docs|completed`
- `onboarding_started_at`, `onboarding_completed_at`, `agreement_signed_at` timestamptz (denormalized)

Storage: new private bucket `btf-onboarding` for signed PDFs + uploaded docs. RLS on `storage.objects` mirroring contact-access rules.

## Phase 2 — Admin "Start Onboarding" trigger (Day 1, late)

- New button in `ContactDetail.tsx` shown when `lifecycle_stage IN ('won','negotiating')` and `email IS NOT NULL`. Disabled with tooltip otherwise.
- New edge function `start-btf-onboarding`:
  1. Verifies caller has `admin`/`super_admin` or `lead_owner` of the contact
  2. Sets `clients.lifecycle_stage='client_active'`, `onboarding_stage='invited'`, `onboarding_started_at=now()`
  3. Mints a magic-link token (reuse the signed-JWT pattern from `invite-btf-client`) scoped to `/onboard`
  4. Calls existing `send_btf_template_email` MCP tool with `template_key='btf_welcome'` (creates template if missing)
  5. Audit-logs `start_onboarding` with deal_id, actor, contact_id
- Fires bridge event `client.onboarding_started` via `fireAndForgetBridge`.

## Phase 3 — `/onboard` Wizard (Days 2–3)

New route tree under `src/pages/onboard/`, white-labeled (Navy/Gold workspace shell, no "Paige" copy):

- `OnboardLayout.tsx` — magic-link token verification, loads client row, enforces `onboarding_stage` so users can't deep-link past their current step.
- `Step1Welcome.tsx` — confirms email/phone, password set if not yet set (Supabase `updateUser`). Advances stage → `signing_agreement`.
- `Step2Agreement.tsx`:
  - Renders agreement template (Phase 5 below) with placeholders filled.
  - Scroll-sentinel enables signature block.
  - Signature: `react-signature-canvas` (lightweight, no new heavy dep) + typed-name fallback + 2 consent checkboxes.
  - Submit → `POST /functions/v1/finalize-agreement` → edge fn renders PDF via `pdf-lib`, uploads to `btf-onboarding`, inserts `paige_signed_agreements`, sets `clients.agreement_signed_at`, advances stage, fires `client.agreement_signed`.
- `Step3Payment.tsx`:
  - Stripe Elements (PaymentElement) in SetupIntent mode.
  - Renders payment-plan summary from the deal record.
  - On confirm → `POST /functions/v1/authorize-btf-payment` → creates/attaches PaymentMethod, creates Customer if missing, creates Subscription per plan, inserts `paige_payment_authorizations`, advances stage, fires `client.payment_authorized`.
- `Step4Intake.tsx` — 4 sub-sections (About / Business / Current State / Docs Checklist). Each section autosaves to `paige_client_intake_submissions` on blur. Final submit advances stage and fires `client.intake_submitted`.
- `Step5Documents.tsx` — drag-drop per category, ID required, others optional. Skip allowed for non-ID categories. Fires `client.initial_docs_uploaded` (even with only the ID).
- `Step6Complete.tsx` — phase tracker + first 3 tasks (read from `paige_btf_phase_items` seeded by admin or by a default Phase-1 template). CTA → `/workspace`. Fires `client.onboarding_completed`.

Wizard is fully resumable: any visit to `/onboard` jumps to current `onboarding_stage`.

## Phase 4 — Bridge events

Single helper `fireOnboardingBridge(verb, client_id, extra)` calling `fireAndForgetBridge` (sanitization already strips consumer-credit fields). All 6 verbs wired in Phases 2–3.

## Phase 5 — Agreement template infrastructure

- New table row in existing `email_templates` won't fit (different shape) — instead use existing `rag_documents` with `document_type='legal_agreement_template'` keyed by `agreement_template_key` + `agreement_version`. Free-form markdown + `metadata.placeholders[]`.
- Seed v1 from `mma-os/docs/legal/btf-service-agreement-v1.md` via a one-off `supabase--insert`. Future updates by upserting a new `agreement_version`; old signed agreements keep their `agreement_text_snapshot`.
- Renderer (`src/lib/agreementRenderer.ts`): mustache-style placeholder substitution, returns plain text + structured blocks for the PDF generator.

## Phase 6 — Task templates + admin task UI (v2, Days 6–8)

- Seed `btf_phase_item_templates` with the Phase-1 BUILD checklist (8 items) already referenced in MMA OS docs.
- Admin button on `ContactDetail.tsx`: "Load Phase 1 BUILD checklist" → bulk-inserts into `paige_btf_phase_items`.
- Add task create / complete UI (client can check `client_action`, coach can check `agency_action`) — extend existing `WorkspacePhases.tsx`.

## Phase 7 — Verification

- `tsgo` clean.
- Playwright smoke: trigger onboarding for a seed contact, walk all 6 steps headless, assert `clients.onboarding_stage='completed'`, `paige_signed_agreements` row exists, signed PDF downloads, Stripe subscription created (test mode).
- Manually verify Jacqueline's row before sending her the live email.

## Out of scope (call out so we don't scope-creep)

- DocuSign / HelloSign integration (native eSign instead).
- Public landing page changes.
- Mobile-app shell — wizard is responsive web, no native build.
- Refactoring the existing `/signup` public wizard.
- Lawyer-stamped v2 agreement — we ship v1 from Antonio's paralegal draft; v2 drops in as a new `agreement_version` row without code changes.

## Open items needing your confirmation before I start

1. **Stripe price IDs for the 3 plans (`pay_in_full $4,997`, `split`, `get_started`).** I'll create them via `stripe--create_stripe_product_and_price` if you confirm the exact split schedule (e.g. Jacqueline = $497/mo × 8 starting [date]).
2. **Magic-link domain.** Same `portal.mogulmakeracademy.com` we use for BTF invites — confirming we reuse, not introduce a new host.
3. **Whose name signs the company side** of the rendered PDF — "Antonio Cook, Mogul Maker Academy LLC"? Need the exact legal entity string for the template snapshot.

I can start Phase 1 the moment you greenlight. If you want me to defer Stripe (Phase 3 Step 3) and ship a "payment confirmed manually" stub for Jacqueline only, say the word and I'll cut a day off the MVP.
