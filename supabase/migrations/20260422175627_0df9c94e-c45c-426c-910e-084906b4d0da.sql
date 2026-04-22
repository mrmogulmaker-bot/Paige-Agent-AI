-- Phase 4: Broker team sub-account authentication
-- Adds auth columns + permissions to broker_team_members, RPC, RLS, and broker_team_member role.

-- 1. Add new role to enum (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'broker_team_member' 
                 AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'broker_team_member';
  END IF;
END $$;

-- 2. Add columns to broker_team_members
ALTER TABLE public.broker_team_members
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invitation_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT
    '{"can_add_clients": false, "can_remove_clients": false, "can_run_sessions": true, "can_share_summaries": true, "can_manage_team": false, "can_view_commissions": false}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_broker_team_members_auth_user_id ON public.broker_team_members(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_broker_team_members_invitation_token ON public.broker_team_members(invitation_token) WHERE invitation_token IS NOT NULL;

-- 3. Trigger to set default permissions per role on insert/update of role
CREATE OR REPLACE FUNCTION public.set_broker_team_default_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-set on insert, OR when role changes and permissions weren't explicitly altered
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role) THEN
    NEW.permissions := CASE NEW.role
      WHEN 'lead_broker' THEN
        '{"can_add_clients": true, "can_remove_clients": true, "can_run_sessions": true, "can_share_summaries": true, "can_manage_team": true, "can_view_commissions": false}'::jsonb
      WHEN 'advisor' THEN
        '{"can_add_clients": false, "can_remove_clients": false, "can_run_sessions": true, "can_share_summaries": true, "can_manage_team": false, "can_view_commissions": false}'::jsonb
      WHEN 'assistant' THEN
        '{"can_add_clients": false, "can_remove_clients": false, "can_run_sessions": false, "can_share_summaries": false, "can_manage_team": false, "can_view_commissions": false}'::jsonb
      ELSE NEW.permissions
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broker_team_default_permissions ON public.broker_team_members;
CREATE TRIGGER trg_broker_team_default_permissions
  BEFORE INSERT OR UPDATE OF role ON public.broker_team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_broker_team_default_permissions();

-- 4. RPC: get_broker_team_member by auth_user_id (returns active member's row)
CREATE OR REPLACE FUNCTION public.get_broker_team_member(_auth_user_id UUID)
RETURNS TABLE(
  id UUID,
  broker_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  status TEXT,
  permissions JSONB,
  business_name TEXT,
  firm_description TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tm.id, tm.broker_id, tm.email, tm.first_name, tm.last_name, tm.role, tm.status, tm.permissions,
    bp.business_name, bp.firm_description
  FROM public.broker_team_members tm
  JOIN public.broker_profiles bp ON bp.id = tm.broker_id
  WHERE tm.auth_user_id = _auth_user_id
    AND tm.status = 'active'
  LIMIT 1;
$$;

-- 5. Helper: is the calling user a team member of the given broker_id?
CREATE OR REPLACE FUNCTION public.is_broker_team_member_of(_broker_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.broker_team_members
    WHERE auth_user_id = auth.uid()
      AND broker_id = _broker_id
      AND status = 'active'
  );
$$;

-- 6. RLS updates for broker_team_members
ALTER TABLE public.broker_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can read their own row" ON public.broker_team_members;
CREATE POLICY "Team members can read their own row"
ON public.broker_team_members
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Brokers can read their team" ON public.broker_team_members;
CREATE POLICY "Brokers can read their team"
ON public.broker_team_members
FOR SELECT
TO authenticated
USING (
  broker_id IN (SELECT id FROM public.broker_profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Brokers can manage their team" ON public.broker_team_members;
CREATE POLICY "Brokers can manage their team"
ON public.broker_team_members
FOR ALL
TO authenticated
USING (
  broker_id IN (SELECT id FROM public.broker_profiles WHERE user_id = auth.uid())
)
WITH CHECK (
  broker_id IN (SELECT id FROM public.broker_profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage all team members" ON public.broker_team_members;
CREATE POLICY "Admins can manage all team members"
ON public.broker_team_members
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 7. RLS: Team members can read broker_client_relationships for their parent broker
DROP POLICY IF EXISTS "Team members can read broker client relationships" ON public.broker_client_relationships;
CREATE POLICY "Team members can read broker client relationships"
ON public.broker_client_relationships
FOR SELECT
TO authenticated
USING (public.is_broker_team_member_of(broker_id));

-- Team members with can_add_clients can insert
DROP POLICY IF EXISTS "Team members can add broker client relationships" ON public.broker_client_relationships;
CREATE POLICY "Team members can add broker client relationships"
ON public.broker_client_relationships
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_broker_team_member_of(broker_id)
  AND COALESCE((SELECT (permissions->>'can_add_clients')::boolean
                FROM public.broker_team_members
                WHERE auth_user_id = auth.uid() AND broker_id = broker_client_relationships.broker_id), false)
);

DROP POLICY IF EXISTS "Team members can update broker client relationships" ON public.broker_client_relationships;
CREATE POLICY "Team members can update broker client relationships"
ON public.broker_client_relationships
FOR UPDATE
TO authenticated
USING (public.is_broker_team_member_of(broker_id))
WITH CHECK (public.is_broker_team_member_of(broker_id));

-- 8. RLS: Team members can read/write broker_paige_sessions for parent broker
DROP POLICY IF EXISTS "Team members can read broker paige sessions" ON public.broker_paige_sessions;
CREATE POLICY "Team members can read broker paige sessions"
ON public.broker_paige_sessions
FOR SELECT
TO authenticated
USING (public.is_broker_team_member_of(broker_id));

DROP POLICY IF EXISTS "Team members can insert broker paige sessions" ON public.broker_paige_sessions;
CREATE POLICY "Team members can insert broker paige sessions"
ON public.broker_paige_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_broker_team_member_of(broker_id)
  AND COALESCE((SELECT (permissions->>'can_run_sessions')::boolean
                FROM public.broker_team_members
                WHERE auth_user_id = auth.uid() AND broker_id = broker_paige_sessions.broker_id), false)
);

DROP POLICY IF EXISTS "Team members can update broker paige sessions" ON public.broker_paige_sessions;
CREATE POLICY "Team members can update broker paige sessions"
ON public.broker_paige_sessions
FOR UPDATE
TO authenticated
USING (public.is_broker_team_member_of(broker_id))
WITH CHECK (public.is_broker_team_member_of(broker_id));

-- 9. RLS: broker_session_messages — allow team member access via parent broker
DROP POLICY IF EXISTS "Team members can read broker session messages" ON public.broker_session_messages;
CREATE POLICY "Team members can read broker session messages"
ON public.broker_session_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.broker_paige_sessions s
    WHERE s.id = broker_session_messages.session_id
      AND public.is_broker_team_member_of(s.broker_id)
  )
);

DROP POLICY IF EXISTS "Team members can insert broker session messages" ON public.broker_session_messages;
CREATE POLICY "Team members can insert broker session messages"
ON public.broker_session_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.broker_paige_sessions s
    WHERE s.id = broker_session_messages.session_id
      AND public.is_broker_team_member_of(s.broker_id)
  )
);

-- Note: broker_profiles policies are NOT changed; team members cannot read billing/commission data.
-- broker_referral_commissions policies are NOT changed; team members have no access.