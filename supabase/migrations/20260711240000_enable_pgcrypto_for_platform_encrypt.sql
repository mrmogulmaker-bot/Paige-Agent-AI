-- platform_encrypt/decrypt call pgp_sym_encrypt/decrypt (pgcrypto), but pgcrypto
-- was never installed in this project — so every encrypt threw "function
-- pgp_sym_encrypt(text,text) does not exist", silently breaking the tenant n8n
-- connection save (and the legacy base_url_ct encryption). Install pgcrypto in
-- the standard `extensions` schema and extend the two functions' search_path to
-- include it so the unqualified pgp_sym_* calls resolve.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER FUNCTION public.platform_encrypt(text)  SET search_path = public, extensions;
ALTER FUNCTION public.platform_decrypt(bytea) SET search_path = public, extensions;
