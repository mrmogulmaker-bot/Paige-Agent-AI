-- Move 2 · Slice 2g (operator reference) — narrow the standalone has_role('admin') to is_platform_owner()
-- on the doctrine_120 canonical registry (2 read policies). These are platform reference/registry tables
-- (no tenant_id, no scope cols) — a plain global admin reading the operator's canonical-column/enum
-- registry is a §9 operator-reference exposure; only the super_admin operator should read it. The policy
-- ALREADY carries is_platform_owner() as a disjunct, so this simply drops the redundant has_role('admin')
-- term. Pure narrowing. Same F5/2d operator pattern.
--
-- HONEST RE-SCOPE OF #398 (§13): the #398 HIGH premise — "plain global admin can view/revoke cross-tenant
-- MCP OAuth tokens" — was DISPROVEN by grounding. paige_mcp_oauth_tokens ("view"/"revoke") and
-- paige_mcp_oauth_clients ("view") already gate on `has_role(super_admin) OR <self>` (operator + the
-- token/client owner), and paige_mcp_connections was narrowed to is_platform_owner() in Slice 2d. There is
-- NO plain-admin path on the MCP OAuth surface; the 2f compliance note mis-transcribed super_admin as admin.
-- So this slice narrows ONLY the genuine leftover: doctrine_120. (The has_role(super_admin) vs
-- is_platform_owner() idiom difference on the MCP tables is functionally identical — both = super_admin
-- only — and is left as-is; normalizing it would be cosmetic, not a security fix.)
--
-- DATA-SAFETY: platform reference registry, operator-read only.

ALTER POLICY "Admins read doctrine_120 column registry" ON public.doctrine_120_canonical_columns
  USING (public.is_platform_owner());
ALTER POLICY "Admins read doctrine_120 registry" ON public.doctrine_120_canonical_enums
  USING (public.is_platform_owner());
