-- ============================================================================
-- Marketplace — list the roadmap items so the registry is the single source of
-- truth for the tenant Marketplace page (#217 UI repoint).
--
-- portal_theming / voice_agent / automations were seeded 'unlisted', so the
-- tenant-facing catalog RPC (marketplace_catalog_for_tenant) hid them. List them
-- so they surface as "coming soon" cards — they have NO published version
-- (current_version_id IS NULL), which is exactly how the UI reads "roadmap":
-- available = version is not null. Nothing becomes installable that wasn't before.
-- ============================================================================

BEGIN;

UPDATE public.marketplace_items
   SET status = 'listed'
 WHERE slug IN ('portal_theming','voice_agent','automations')
   AND status = 'unlisted';

COMMIT;
