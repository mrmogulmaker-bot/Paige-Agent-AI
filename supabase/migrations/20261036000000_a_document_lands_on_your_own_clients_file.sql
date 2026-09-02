-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A document lands on YOUR OWN client's file — and stops being movable off it.
--
-- This is the file-shaped twin of 20261031000000, which closed the same hole on `client_notes`.
-- The reason it needs its own migration is that documents have a verb notes do not: they get
-- RE-FILED. A note is written once, to a client named at the time. A document arrives first and
-- is routed second — that is the whole point of the routing tool this migration precedes — so for
-- files the dangerous operation is the UPDATE, not the INSERT.
--
-- ── HOLE 1: INSERT does not constrain the destination (identical to the note case).
--
--     uploaded_by_user_id = auth.uid()
--     AND (is_platform_owner() OR (tenant_id = current_user_tenant_id() AND admin-or-coach))
--
-- Nothing about `contact_id`. So a caller may stamp `tenant_id` with their own while pointing
-- `contact_id` at somebody else's client: a document ABOUT one practice's client, filed in another
-- practice's cabinet, invisible to the people it concerns.
--
-- ── HOLE 2: UPDATE constrains WHO may edit and nothing about WHERE the row may land.
--
--     USING (uploaded_by_user_id = auth.uid() OR is_platform_owner()
--            OR (tenant_id = current_user_tenant_id() AND admin))
--
-- and no WITH CHECK at all — which in Postgres means the USING expression is reused as the check.
-- So the uploader of a file may move `contact_id` to ANY contact in the database, and may set
-- `tenant_id` to any tenant, because neither appears in the predicate. Re-filing is exactly the
-- operation the new `crm_file_document` tool performs, and it is a destination a MODEL proposes.
-- A routing decision made by a model needs the destination constrained by the database rather than
-- by the model getting it right — the same sentence as the note migration, for the same reason.
--
-- ── WHY THE STAMP AND THE DESTINATION MUST AGREE.
--
-- The read policy admits a row on `tenant_id = current_user_tenant_id() AND admin`. So a row whose
-- `contact_id` points at tenant A's client while its `tenant_id` reads B is readable by B's admins
-- and belongs to A's client. Constraining only the destination would leave that shape reachable,
-- so the check requires both: the destination client is one of ours, AND the row's own stamp is
-- that client's tenant. There are no rows to grandfather — `client_files` is empty on production
-- (verified 2026-09-01, 0 rows) — so this can be stated as an equality rather than a NULL-tolerant
-- approximation that would preserve the hole it is meant to close.
--
-- ── PRODUCER INVENTORY (§37), walked in full because a half-hardened write is worse than an open
-- one. Writers of `client_files`, entire repository: `ContactFilesPanel.upload` (INSERT — the open
-- contact, always one of the caller's own), `ContactFilesPanel.toggleShare` (UPDATE visibility
-- only, contact unchanged), `ContactFilesPanel.remove` (DELETE — untouched here), and the new chat
-- tool, which resolves the destination in the caller's tenant before proposing. No edge function,
-- no trigger, no pg_cron job, no MCP tool, no webhook, no CI script writes this table; the only
-- other SQL reference is the read in `handle_data_subject_request`, addressed below. Every one of
-- them already satisfies the new predicate — the policy stops relying on them to.
--
-- `client_notes` gets the UPDATE half of the same fix. 20261031000000 closed its INSERT and left
-- its UPDATE with the identical unconstrained-destination shape; a note can currently be re-filed
-- onto any contact in the database by its author. No producer does that (`ContactNotesPanel`
-- toggles `pinned`), which is precisely why it would sit there indefinitely.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- ── client_files: the destination must be one of ours, on the way in …
DROP POLICY IF EXISTS "Staff insert files" ON public.client_files;
CREATE POLICY "Staff insert files" ON public.client_files
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by_user_id = auth.uid()
    AND (
      public.is_platform_owner()
      OR (
        tenant_id = public.current_user_tenant_id()
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'coach'::public.app_role)
        )
        -- THE ADDED CLAUSE: the client this document is filed on must be one of ours.
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = client_files.contact_id
            AND c.tenant_id = public.current_user_tenant_id()
        )
      )
    )
  );

-- … and on every move afterwards. USING is unchanged — who may touch the row is not the question
-- this migration answers — and WITH CHECK is stated EXPLICITLY so it stops silently inheriting a
-- predicate that says nothing about where the row ends up.
DROP POLICY IF EXISTS "Uploader or admin update files" ON public.client_files;
CREATE POLICY "Uploader or admin update files" ON public.client_files
  FOR UPDATE TO authenticated
  USING (
    uploaded_by_user_id = auth.uid()
    OR public.is_platform_owner()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    (
      uploaded_by_user_id = auth.uid()
      OR public.is_platform_owner()
      OR (
        tenant_id = public.current_user_tenant_id()
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    )
    AND (
      public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_files.contact_id
          AND c.tenant_id = public.current_user_tenant_id()
          -- The stamp and the destination agree, so a row can never be readable by one tenant's
          -- admins while attached to another tenant's client.
          AND client_files.tenant_id = c.tenant_id
      )
    )
  );

-- ── client_notes: the same UPDATE half, left open by 20261031000000.
DROP POLICY IF EXISTS "Authors and admins can update notes" ON public.client_notes;
CREATE POLICY "Authors and admins can update notes" ON public.client_notes
  FOR UPDATE TO authenticated
  USING (
    author_user_id = auth.uid()
    OR public.is_platform_owner()
    OR (
      tenant_id = public.current_user_tenant_id()
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    (
      author_user_id = auth.uid()
      OR public.is_platform_owner()
      OR (
        tenant_id = public.current_user_tenant_id()
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    )
    AND (
      public.is_platform_owner()
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_notes.contact_id
          AND c.tenant_id = public.current_user_tenant_id()
          AND client_notes.tenant_id = c.tenant_id
      )
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- A FINDING, NOT A FIX: `handle_data_subject_request` HAS NEVER RUN — not the export, the whole
-- function, for all four request types. NO DDL BELOW. This is a comment, deliberately.
--
-- Found while walking the §37 producer inventory for `client_files`: that function is the only
-- other SQL in the repository referencing the table, and it references it by a column that does
-- not exist. Driving it against production then found that it is broken about a dozen ways, and
-- every attempt to fix "the last one" surfaced another. The honest read is that this function was
-- written against a schema that is not the one it runs on.
--
-- Every item below was reproduced on production, 2026-09-01, by driving the function inside a
-- rolled-back transaction — none is inferred from reading:
--
--   THE `pii_access_log` INSERT, which runs BEFORE the branch on request type, so it fails export,
--   portability, correct and delete identically:
--     · names user_id, accessed_by, column_name, action, reason — the table has accessed_user_id,
--       accessor_user_id, table_name, field_names, access_type. Five of six columns do not exist.
--     · never supplies field_names, which is NOT NULL.
--     · the value it wants for access_type ('dsr.' || type) is refused by
--       CHECK (access_type = ANY (ARRAY['read','update'])) — so even with the right column names
--       it would still fail.
--     → ERROR: 42703: column "user_id" of relation "pii_access_log" does not exist
--
--   THE EXPORT BRANCH (reached only once the above is repaired, which is how these were found):
--     · client_notes n WHERE n.client_id  → the column is contact_id
--     · client_files f WHERE f.client_id  → the column is contact_id
--     · deals d WHERE d.contact_id        → the column is contact_client_id
--     (client_memory genuinely does key on client_id. That one is right.)
--
--   THE CORRECT BRANCH: its allow-list and its UPDATE both name zip, address_line1 and
--   address_line2. None of the three is a column on `clients`.
--
--   THE DELETE BRANCH: names ssn_last_4, address_line1, address_line2, zip — none exists — and
--   then writes data_deletion_requests(..., reason), where the column is `metadata`. Its user_id
--   is NOT NULL with a foreign key into auth.users while the function passes
--   COALESCE(linked_user_id, _contact_id); a clients.id is not an auth user, so for any client
--   without a portal login that row is unwritable by construction.
--
-- WHY THIS IS NOT FIXED HERE. I did write the fix, and the proof rejected it — twice, each time
-- surfacing references I had not yet found. What is left is not a column rename: someone has to
-- decide what a data-subject request actually owes a person on THIS schema — which fields a
-- correction may touch, what redaction must null, whether the export should carry the stored
-- objects in the `client-files` bucket rather than only their rows, and whether `delete` should
-- reach the client's notes, files and memory at all rather than redacting the contact and leaving
-- them. Those are legal-compliance decisions, and answering them inside a document-routing slice
-- to keep a migration tidy would be the wrong kind of tidy. A half-repaired version raises just as
-- reliably as the current one while looking like it was handled.
--
-- WHAT THIS SLICE DOES OWE, AND HAS DONE: find it, prove it, write it down where the next person
-- looking at this table will see it, and not add rows to a cabinet while quietly knowing its legal
-- export cannot run. The reproduction is scripts/proofs/d2-document-routing-proof.sql, which
-- asserts all four request types raise; if someone repairs the function, that assertion goes red
-- and tells them the finding is stale.
--
-- A CORRECTION TO MY OWN FIRST ACCOUNT (§13). I initially wrote that the function "raises AFTER
-- writing a pii_access_log row and a paige_audit_log row saying the export happened", and called
-- it an audit trail asserting a success that never occurred. That is wrong. It raises ON the
-- pii_access_log write, before either row commits, so the statement aborts whole and leaves no
-- misleading row behind. The failure is total rather than deceptive. Recorded rather than quietly
-- deleted, because the false version was the more alarming one and would have been repeated.
-- ═════════════════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A CORRECTION TO THIS FILE'S OWN COMMIT MESSAGE (§13), added 2026-09-01.
--
-- Commit 22c14f2e4 — the commit that introduced this migration — says of the data-subject
-- function: "Corrected to two identifiers, function otherwise verbatim", and describes it as
-- raising AFTER writing an audit row that claims success. Both statements are wrong, and both
-- were already corrected in the section above before the file was finished; the commit message
-- was written first and never caught up.
--
--   · There is NO fix in this migration. `grep -c "CREATE OR REPLACE FUNCTION"` over this file
--     returns 0. The repair was written, rejected twice by its own proof, and withdrawn in favour
--     of the finding above, because what remains is a legal-compliance decision rather than a
--     column rename.
--   · It raises ON the `pii_access_log` write, before either audit row commits, so the statement
--     aborts whole and leaves nothing behind. The failure is total, not deceptive.
--
-- The commit message cannot be edited without rewriting pushed history on a shared branch, so the
-- correction lives here instead — beside the code, where the next reader is actually looking.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
