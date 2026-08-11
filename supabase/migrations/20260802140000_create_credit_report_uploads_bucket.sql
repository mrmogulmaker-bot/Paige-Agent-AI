-- P0 #322 — (re)create the `credit-report-uploads` private storage bucket + its RLS.
--
-- Drift fix: the bucket + its storage.objects policies were authored back in
-- 20260411023125 (and hardened in 20260418031616 / 20260411204739 / 20260629002628)
-- but NEVER landed on prod — verified 2026-08-02 via MCP: the bucket row is absent
-- (only avatars, comms-attachments, growth-assets, paige-generated, studio-deliverables,
-- tenant-brand, tenant-knowledge, tts-cache exist) and ZERO storage.objects policies
-- reference this bucket. That drift silently broke BOTH the pre-existing credit-report
-- upload path AND the general-PDF durable-storage block in paige-ai-chat (which reused
-- this bucket). This migration re-lands the WHOLE set idempotently on a clean base, so
-- the same private bucket + the same owner/coach/admin scoping the original migrations
-- intended is finally live. Nothing here is new scheme — it mirrors the last-known
-- canonical form of each policy (coach policies in their 20260629002628 `coach`-role +
-- coach_clients shape; owner policies in their 20260418031616 folder[1] shape).
--
-- Path conventions in this bucket (folder[1] is ALWAYS the target user's id):
--   credit path : {user_id}/{timestamp}_paige_{file}
--   general path: {user_id}/general/{timestamp}_paige_{file}   (§12 — never mixes with credit)
-- So the owner-scoped `auth.uid()::text = (storage.foldername(name))[1]` predicate governs
-- BOTH paths identically.

-- 1. The bucket — private, idempotent.
INSERT INTO storage.buckets (id, name, public)
VALUES ('credit-report-uploads', 'credit-report-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS on storage.objects for this bucket. Every policy is dropped-then-created so a
--    re-run (or a partial prior landing) converges cleanly (CREATE POLICY has no
--    IF NOT EXISTS in Postgres, so DROP IF EXISTS is the idempotency primitive).

-- 2a. Owner-scoped: a user reads/writes/updates/deletes ONLY their own folder.
DROP POLICY IF EXISTS "Users can view own credit reports" ON storage.objects;
CREATE POLICY "Users can view own credit reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can upload own credit reports" ON storage.objects;
CREATE POLICY "Users can upload own credit reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can update own credit reports" ON storage.objects;
CREATE POLICY "Users can update own credit reports"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete own credit reports" ON storage.objects;
CREATE POLICY "Users can delete own credit reports"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 2b. Admin-scoped: platform admins read/write anywhere in the bucket.
DROP POLICY IF EXISTS "Admins can view all credit reports" ON storage.objects;
CREATE POLICY "Admins can view all credit reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Admins can upload credit reports" ON storage.objects;
CREATE POLICY "Admins can upload credit reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 2c. Coach-on-behalf: a coach reads/writes a folder that belongs to one of their OWN
--     actively-assigned clients (folder[1] = the client's auth user_id via coach_clients).
--     This is the policy the credit path's coach-on-behalf write (folder = client's id)
--     relies on for direct JWT access. NOTE (§9): the edge function itself uploads with
--     the SERVICE-ROLE client (RLS-bypassing), so these policies govern direct browser/JWT
--     access, not the server write — the server write is authorized in code (see the
--     paige-ai-chat change: a body-supplied clientId is validated against the caller's
--     RLS-visible clients before it is used as the folder).
DROP POLICY IF EXISTS "Coaches can view assigned client credit reports" ON storage.objects;
CREATE POLICY "Coaches can view assigned client credit reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'coach'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND (cc.client_user_id)::text = (storage.foldername(objects.name))[1]
      AND cc.status = 'active'
  )
);

DROP POLICY IF EXISTS "Coaches can upload assigned client credit reports" ON storage.objects;
CREATE POLICY "Coaches can upload assigned client credit reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'credit-report-uploads'
  AND public.has_role(auth.uid(), 'coach'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.coach_clients cc
    WHERE cc.coach_user_id = auth.uid()
      AND (cc.client_user_id)::text = (storage.foldername(objects.name))[1]
      AND cc.status = 'active'
  )
);
