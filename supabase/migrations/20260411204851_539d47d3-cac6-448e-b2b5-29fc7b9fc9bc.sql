
-- Remove NOT NULL constraint on token column since we now use token_hash
ALTER TABLE public.invitations ALTER COLUMN token DROP NOT NULL;

-- Also drop the default token generation since we generate tokens in the edge function
ALTER TABLE public.invitations ALTER COLUMN token DROP DEFAULT;

-- Clear any remaining plaintext tokens
UPDATE public.invitations SET token = NULL WHERE token IS NOT NULL;

-- Drop the old token index
DROP INDEX IF EXISTS idx_invitations_token;
