
-- Add coach assignment column for pre-auth clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_coach_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_assigned_coach_user_id
  ON public.clients(assigned_coach_user_id)
  WHERE assigned_coach_user_id IS NOT NULL;

-- Allow assigned coaches to manage their clients (in addition to existing creator/admin policies)
DROP POLICY IF EXISTS "Assigned coaches can manage their clients" ON public.clients;
CREATE POLICY "Assigned coaches can manage their clients"
ON public.clients
FOR ALL
USING (assigned_coach_user_id = auth.uid())
WITH CHECK (assigned_coach_user_id = auth.uid());

-- When a client converts to an auth user, mirror the assignment into coach_clients
CREATE OR REPLACE FUNCTION public.sync_assigned_coach_to_coach_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_coach_user_id IS NOT NULL
     AND NEW.linked_user_id IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.assigned_coach_user_id IS DISTINCT FROM NEW.assigned_coach_user_id
       OR OLD.linked_user_id IS DISTINCT FROM NEW.linked_user_id
     )
  THEN
    INSERT INTO public.coach_clients (coach_user_id, client_user_id, status)
    VALUES (NEW.assigned_coach_user_id, NEW.linked_user_id, 'active')
    ON CONFLICT (coach_user_id, client_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_assigned_coach_to_coach_clients ON public.clients;
CREATE TRIGGER trg_sync_assigned_coach_to_coach_clients
AFTER INSERT OR UPDATE OF assigned_coach_user_id, linked_user_id ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.sync_assigned_coach_to_coach_clients();
