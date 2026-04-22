-- Add has_broker_access flag to profiles to allow admins/coaches to access the broker workspace
-- without giving up their primary role.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_broker_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.has_broker_access IS
  'When true, this user can open the Broker Workspace in addition to their normal role (admin/coach/user).';