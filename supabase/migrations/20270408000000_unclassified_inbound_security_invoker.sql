-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- §9/§59 — public.paige_unclassified_inbound must run as its INVOKER, not as its owner.
--
-- THE LEAK, measured rather than assumed. The view was created in
-- `20270115000000_conversation_labels.sql` L102 without `security_invoker`, so it defaults to OFF
-- and executes as its OWNER. Its body selects `id, tenant_id, contact_id, subject, body_text,
-- created_at` straight from `public.messages`, and `public.messages` is RLS-enabled
-- (`20260726190000_comms_c1_messages_channel_connectors.sql` L193) behind a tenant-scoped policy:
--
--     messages_select ... using (is_platform_owner()
--                                or (tenant_id = current_user_tenant_id()
--                                    and has_any_role(auth.uid(), array['admin','coach'])))
--
-- An owner-run view bypasses that policy entirely, so any role holding SELECT on the view could
-- read EVERY tenant's inbound message subjects and body text. That is message CONTENT across the
-- tenant boundary — the same class of hole §59 closes for SECURITY DEFINER functions, in the view
-- object type that #116 governs.
--
-- WHY `security_invoker = true` BREAKS NO PRODUCER (§37). The view has exactly one consumer in the
-- tree — `supabase/functions/paige-inbox-triage/index.ts` L85 — and that function builds its client
-- with `SUPABASE_SERVICE_ROLE_KEY` (L40/L66) and refuses any caller that is not bearing the service
-- role (L68). Under `security_invoker = true` the view's reads are evaluated as service_role, which
-- `messages_service_all` (`for all to service_role using (true)`) admits in full, so the triage cron
-- still sees the whole queue. Nothing in `src/` reads this view; the grep for it returns the
-- migration and that one edge function and nothing else.
--
-- The REVOKE is belt-and-braces, not the fix: the invoker flag is what closes the hole, and the
-- revoke removes the reachability that made it exploitable in the first place.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter view public.paige_unclassified_inbound set (security_invoker = true);

revoke all on public.paige_unclassified_inbound from anon, authenticated;
grant select on public.paige_unclassified_inbound to service_role;
