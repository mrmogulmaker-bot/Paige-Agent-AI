-- Add `developer` role for platform integration engineers.
-- Per agreed scope: full platform admin powers minus destructive deletes.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'developer';