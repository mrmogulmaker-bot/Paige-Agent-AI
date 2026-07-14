-- Recovered from the live migration ledger (supabase_migrations.schema_migrations.statements)
-- and committed for durability: this migration is APPLIED on prod but existed in no git file,
-- so a rebuild-from-git would silently drop it (drift audit 2026-07-14, prod-ahead-of-git).
-- SQL is verbatim from the ledger unless a marked adjustment note says otherwise.

-- The 2 new trailing params created a NEW overload rather than replacing the old
-- 5-arg provision_tenant. Drop the old ungated overload so the agreement gate
-- cannot be bypassed by calling the 5-arg form. Only the gated 7-arg remains.
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, text, text, text);

-- ADJUSTMENT (drift audit 2026-07-14, not in the live ledger statement): git also
-- re-creates an ungated 4-arg overload that live never had. Drop it too so a rebuild
-- converges on the single gated 7-arg form. No-op on live (no 4-arg exists there).
DROP FUNCTION IF EXISTS public.provision_tenant(text, text, text, text);
