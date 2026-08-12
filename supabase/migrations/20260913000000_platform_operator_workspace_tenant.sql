-- ============================================================================
-- Platform Operator Workspace Tenant  (Task #126 — §32.c live-drive fix)
-- ============================================================================
-- WHAT
--   Creates ONE dedicated, coaching-generic platform-operator system workspace
--   tenant and re-points `admin_app_settings.platform_operator_tenant_id` at it,
--   replacing a §200 PHANTOM id (94af805c-6d21-450d-a50b-bbf4dea7571a) that no
--   longer matched any tenant row.
--
-- WHY
--   Task #126 Slice 2's §32.c live-drive of skill `verify_deployed_surface`
--   returned `tenant_unresolved`. Two compounding defects:
--     (1) admin_app_settings.platform_operator_tenant_id pointed at a tenant that
--         DOES NOT EXIST (phantom) — so the resolver, correctly failing closed,
--         returned null.
--     (2) The sole operator admin@paigeagent.ai is a tenant-less super_admin USER
--         (active_tenant_id null, 0 memberships), so operator-run platform-scope
--         work had no forge tenant to resolve to.
--   This migration fixes defect (1): a REAL, fully-provisioned operator workspace
--   now backs the setting. Defect (2) is fixed in paige-mcp actorTenantId() (the
--   platform-OWNER USER fallback), which reads this SAME setting via the resolver
--   `supabase/functions/_shared/platform-operator-tenant.ts` (validates the value
--   is a well-formed UUID under key 'platform_operator_tenant_id').
--
-- WHAT THIS TENANT IS *NOT* (§9/§200)
--   * NOT the God/Super-Admin account (the operator is a tenant-less USER).
--   * NOT the "Paige Platform Defaults" registry tenant (5ccc75e0…).
--   * NOT a vertical/business tenant. It is a dedicated operator system workspace
--     the operator dogfoods — a real, top-level, coaching-generic tenant.
--
-- DOCTRINE
--   §2  coaching-generic: name/slug/brand carry ZERO finance/credit/funding
--       wording; brand defaults to '{}'. Nothing vertical is seeded.
--   §50 no active pop-culture marks in the name/slug.
--   §51 top-level STANDALONE: account_type defaults to 'standalone',
--       parent_tenant_id NULL — never agency/enterprise, never a sub_account.
--       Satisfies the invariant (parent NULL OR account_type NOT IN
--       ('agency','enterprise')).
--   §10 config-as-data: the operator tenant is designated by a data write, not a
--       hardcoded constant — swappable with one row update, no redeploy.
--
-- PROVISIONING TRIGGERS (a real workspace, minus the customer-only bits)
--   The BEFORE-INSERT trigger `tenant_set_account_number_prefix` derives
--   account_number_prefix from the slug (→ "POW") and fills the NOT NULL column,
--   so we do NOT set it here. Of the 7 AFTER-INSERT provisioning triggers, 5 fire
--   normally (features-row, revenue-classification, default-calendar, email-IDENTITY,
--   starter-business); the 2 CUSTOMER-only ones (managed email-CONNECTOR + onboarding
--   systems-check enqueue) SKIP because features.system_workspace=true (see below) —
--   correct for a system workspace, and it means NO async net.http_post fires here.
--
--   §13 EMAIL-PROVISIONER SAFETY CHECK (verified 2026-08-12 against prod
--   xygzykjyynhzqytbqnzu via pg_get_functiondef): BOTH email provisioners
--   `public.provision_tenant_email_identity` and
--   `public.provision_paige_managed_email_connector` are pure PL/pgSQL — they do
--   ONLY local SELECT/INSERT/UPDATE (no pg_net, no http extension, no external
--   HTTP call of any kind). They CANNOT make a synchronous failing external call
--   during this INSERT, so the tenant row commits cleanly. (Any real domain/DNS
--   verification happens later, out of band.)
--
-- IDEMPOTENT / RE-RUN-SAFE
--   Pinned tenant UUID literal + ON CONFLICT DO NOTHING on the tenant insert; the
--   setting upsert is ON CONFLICT (key) DO UPDATE. Re-running is a no-op.
--
-- migration-lint-ignore: pattern-1 — JUSTIFIED: PATTERN-1 guards against a seed
--   INSERT that carries a hard-coded auth.users UUID (FK → 23503 on a fresh, empty
--   auth.users). This INSERT sets NO auth.users-referencing column — the pinned
--   UUID is the TENANT'S OWN id (a purpose-built system workspace), and
--   owner_user_id is intentionally left NULL. No auth.users FK is exercised, so
--   there is no 23503 on a clean rebuild. The lint's suggested rewrite
--   (`WHERE EXISTS (SELECT 1 FROM auth.users …)`) would be WRONG here: on a fresh
--   empty DB it would SKIP the insert and the operator workspace would never be
--   created. The §32.a rollback proof (ran GREEN against prod) confirms the row
--   inserts cleanly against the real schema.
-- ============================================================================

-- 1) The dedicated operator system workspace tenant.
--    Pinned UUID so the migration is idempotent AND referenceable elsewhere.
--    account_type/parent_tenant_id intentionally NOT set (defaults: standalone /
--    NULL — §51-clean). account_number_prefix intentionally NOT set (BEFORE-INSERT
--    trigger derives "POW" from the slug). brand/onboarding_state default '{}';
--    status defaults 'trial'.
--
--    features = {"system_workspace": true} — the ESTABLISHED system-tenant marker
--    (§9/§52/§57; precedent: the 'Paige Platform Defaults' tenant carries it,
--    20260730180000). It classifies this row as a platform SYSTEM workspace, not a
--    customer, and is honored structurally by two of the AFTER-INSERT triggers:
--      * `trg_enqueue_onboarding_systems_check` early-returns on it (20260818000000)
--        — no onboarding systems-check is enqueued (so NO async net.http_post fires
--        for this workspace), which is correct: it is not a real coaching book.
--      * `provision_paige_managed_email_connector` early-returns on it — no managed
--        customer-email connector is provisioned (the operator does not send client
--        email from this workspace). The email-IDENTITY row still provisions.
--    It is ALSO the §57 exclusion hook: operator fleet/revenue aggregates that honor
--    `features.system_workspace` must not count this as a real trial tenant. (Ensuring
--    every such aggregate consumes the flag is a tracked fast-follow; the marker being
--    SET here is the prerequisite.)
INSERT INTO public.tenants (id, slug, name, features)
VALUES (
  'd1f0a7e2-6c3b-4b9a-9e2d-0a1b2c3d4e5f',
  'paige-operator-workspace',
  'Paige Operator Workspace',
  '{"system_workspace": true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 2) Re-point the operator-tenant designation at the real workspace, replacing
--    the phantom. value is jsonb NOT NULL; stored as a bare JSON string scalar
--    (to_jsonb(text)) exactly as the resolver expects; updated_at is NOT NULL.
--    ON CONFLICT DO UPDATE (not DO NOTHING) is REQUIRED here: the setting row
--    ALREADY EXISTS carrying the phantom id, so DO NOTHING would leave the phantom
--    in place and the fix would be a no-op. The migration applies exactly once
--    (schema_migrations-tracked), so this cannot clobber a later operator
--    re-designation.
INSERT INTO public.admin_app_settings (key, value, updated_at)
VALUES (
  'platform_operator_tenant_id',
  to_jsonb('d1f0a7e2-6c3b-4b9a-9e2d-0a1b2c3d4e5f'::text),
  now()
)
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();
