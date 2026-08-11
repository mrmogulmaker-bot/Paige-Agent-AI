-- Gap 3 fast-follow (owner-ruled 2026-08-11: "yes backfill, make sure it never
-- happens again"). Make a "headless" email approval structurally impossible so the
-- contact-lookup false-miss class (#127/#131) can never again file an un-sendable
-- email approval into the queue.
--
-- WHY: an EMAIL approval must carry a recipient — either a linked contact_id (the
-- Send handler re-resolves clients.email from it, #464) OR a snapshot recipient in
-- draft_content.to. A row with NEITHER can never be sent; it is a bug, not a state.
--
-- PART A — BACKFILL (report-only, nothing to link). Live-prod audit (2026-08-11)
-- found paige_pending_approvals = 4 rows, 2 orphans (contact_id NULL):
--   * 401965af-9ceb-4c2b-b0f8-96490c01f791  (type cs_draft, email, approved, 2026-07-10)
--   * 36da0115-c6f1-485a-bf71-15b660d82390  (type cs_draft, email, pending,  2026-08-10)
-- BOTH also lack draft_content.to AND any other recipient signal (draft_content
-- keys are only body/channel/subject), so there is NOTHING to backfill them from —
-- no email to match against clients, no name to tokenize (§13: we do not guess a
-- recipient). They are left as-is and grandfathered by the NOT VALID clause below;
-- the operator can resolve or discard them from the queue manually. (Because 0 rows
-- are backfillable, Part A adds no UPDATE — the real deliverable is the guard.)
--
-- PART B — GUARD. NOT VALID so the 2 legacy rows are not rejected (a plain CHECK
-- would fail this very migration); the constraint is still enforced on EVERY future
-- INSERT/UPDATE. Scoped to the SEND channels (category IN ('email','sms')) — both
-- need a recipient to be sendable — so a future NON-send approval type (a data/action
-- approval that legitimately has no recipient) is unaffected. §32.a pre-proven on
-- prod: exactly the 2 known orphans violate the predicate today, and there are 0 sms
-- or non-email rows.

ALTER TABLE public.paige_pending_approvals
  ADD CONSTRAINT paige_pending_approvals_send_recipient_present
  CHECK (
    category NOT IN ('email', 'sms')
    OR contact_id IS NOT NULL
    OR nullif(draft_content->>'to', '') IS NOT NULL
  ) NOT VALID;

COMMENT ON CONSTRAINT paige_pending_approvals_send_recipient_present
  ON public.paige_pending_approvals IS
  'Gap 3 guard (#132, owner-ruled 2026-08-11): an email/sms approval must carry a recipient (contact_id or draft_content.to). NOT VALID grandfathers 2 pre-existing recipient-less rows (401965af, 36da0115); enforced on all new writes so the #127/#131 headless-approval class cannot recur.';
