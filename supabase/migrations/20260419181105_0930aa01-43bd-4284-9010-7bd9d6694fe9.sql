
-- ============================================================
-- 1. Plaid access tokens: move to server-only table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.connected_bank_account_secrets (
  account_row_id uuid PRIMARY KEY REFERENCES public.connected_bank_accounts(id) ON DELETE CASCADE,
  plaid_access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connected_bank_account_secrets ENABLE ROW LEVEL SECURITY;

-- No client policies — only the service role (which bypasses RLS) can read/write.
-- Explicit deny for authenticated/anon by simply not creating any policy.

-- Backfill from existing column
INSERT INTO public.connected_bank_account_secrets (account_row_id, plaid_access_token)
SELECT id, plaid_access_token
FROM public.connected_bank_accounts
WHERE plaid_access_token IS NOT NULL
ON CONFLICT (account_row_id) DO UPDATE SET plaid_access_token = EXCLUDED.plaid_access_token;

-- Drop the column from the user-readable table
ALTER TABLE public.connected_bank_accounts DROP COLUMN IF EXISTS plaid_access_token;

-- ============================================================
-- 2. Bank accounts INSERT must enforce auth.uid() = user_id
-- ============================================================
DROP POLICY IF EXISTS "Users can insert own bank accounts" ON public.connected_bank_accounts;
CREATE POLICY "Users can insert own bank accounts"
  ON public.connected_bank_accounts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. Coach dispute outcomes: restrict INSERT to assigned clients
-- ============================================================
DROP POLICY IF EXISTS "Coaches can insert dispute outcomes" ON public.dispute_outcomes;
CREATE POLICY "Coaches can insert dispute outcomes"
  ON public.dispute_outcomes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'coach'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_user_id = auth.uid()
        AND cc.client_user_id = dispute_outcomes.user_id
        AND cc.status = 'active'
    )
  );

-- Also tighten coach SELECT to assigned clients
DROP POLICY IF EXISTS "Coaches can view all dispute outcomes" ON public.dispute_outcomes;
CREATE POLICY "Coaches can view assigned dispute outcomes"
  ON public.dispute_outcomes
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'coach'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.coach_clients cc
      WHERE cc.coach_user_id = auth.uid()
        AND cc.client_user_id = dispute_outcomes.user_id
        AND cc.status = 'active'
    )
  );

-- ============================================================
-- 4. Realtime channel authorization
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to own topics" ON realtime.messages;
CREATE POLICY "Users can subscribe to own topics"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- topic must start with the user's uid (e.g. "<uid>:notifications")
    -- or be a globally-public topic explicitly prefixed with "public:"
    (realtime.topic() LIKE auth.uid()::text || ':%')
    OR (realtime.topic() = auth.uid()::text)
    OR (realtime.topic() LIKE 'public:%')
  );

DROP POLICY IF EXISTS "Users can broadcast to own topics" ON realtime.messages;
CREATE POLICY "Users can broadcast to own topics"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (realtime.topic() LIKE auth.uid()::text || ':%')
    OR (realtime.topic() = auth.uid()::text)
  );

-- ============================================================
-- 5. Email-assets bucket: remove broad listing policy
-- ============================================================
-- Public bucket still serves /object/public/<path> URLs without a SELECT
-- policy, so transactional email logos continue to work. Removing this
-- policy prevents enumeration of bucket contents.
DROP POLICY IF EXISTS "Email assets are publicly accessible" ON storage.objects;

-- ============================================================
-- 6. Move vector extension out of public schema
-- ============================================================
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;

-- Make sure roles can still resolve types from the extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, authenticated, service_role, anon;
