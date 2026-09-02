-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- client_notes: a note must land on a client the author's tenant actually has.
--
-- THE GAP. The insert policy constrains the AUTHOR and the TENANT STAMP:
--
--     author_user_id = auth.uid()
--     AND (is_platform_owner() OR (tenant_id = current_user_tenant_id() AND admin-or-coach))
--
-- …and says nothing about `contact_id`. So a caller can write `tenant_id` = their own while
-- pointing `contact_id` at a client belonging to somebody else. The note is then readable by the
-- author's tenant and attached to a stranger's record.
--
-- It is not a read leak — the other tenant's admins filter on their own `tenant_id` and never see
-- it — which is exactly why it would go unnoticed. It is a misfiled record: a note ABOUT one
-- practice's client, sitting in another practice's file, invisible to the people it concerns.
--
-- WHY NOW. Paige is gaining a tool that files notes to a client, so "the correct client profile"
-- stops being a thing a human types and becomes a thing a model proposes. A routing decision made
-- by a model needs the destination constrained by the database, not by the model getting it right.
--
-- No producer changes. `ContactNotesPanel` files against the contact whose page is open, which is
-- always one of the caller's own; the chat tool resolves the contact in the caller's tenant before
-- proposing. Both already satisfy this — the policy just stops relying on them to.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Staff can create notes" ON public.client_notes;
CREATE POLICY "Staff can create notes" ON public.client_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (
      public.is_platform_owner()
      OR (
        tenant_id = public.current_user_tenant_id()
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'coach'::public.app_role)
        )
        -- THE ADDED CLAUSE: the client this note is about must be one of ours.
        AND EXISTS (
          SELECT 1 FROM public.clients c
          WHERE c.id = client_notes.contact_id
            AND c.tenant_id = public.current_user_tenant_id()
        )
      )
    )
  );
