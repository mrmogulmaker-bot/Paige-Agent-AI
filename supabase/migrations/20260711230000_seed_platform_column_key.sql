-- The platform column-encryption key (used by platform_encrypt / platform_decrypt)
-- was never present in prod's _internal_secrets — the original seed in
-- 20260702022450 did not take effect here — so every platform_encrypt() call
-- threw 'platform_column_key not seeded'. That silently broke saving a tenant's
-- n8n connection (and any other platform_encrypt caller, e.g. the legacy
-- base_url_ct). Seed it idempotently now.
--
-- Safe to seed a fresh key: because every prior encrypt attempt FAILED, nothing
-- was ever successfully encrypted with a different key, so there is no orphaned
-- ciphertext to strand. ON CONFLICT keeps this a no-op if a key already exists.
INSERT INTO public._internal_secrets(key, value)
VALUES ('platform_column_key', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;
