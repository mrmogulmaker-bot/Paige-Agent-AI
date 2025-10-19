-- Add coach role to app_role enum (must be in separate transaction)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';