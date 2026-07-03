-- ============================================================
-- Security hardening: 5 findings from scanner
-- ============================================================

-- 1. corporate_entity_registry — remove public read exposure of corporate hierarchy
DROP POLICY IF EXISTS "corp entities public read" ON public.corporate_entity_registry;

CREATE POLICY "corp entities admin read"
  ON public.corporate_entity_registry
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Also tighten Data API grants: anon no longer needs SELECT here
REVOKE SELECT ON public.corporate_entity_registry FROM anon;

-- 2. broker_profiles — hide Stripe identifier columns from authenticated (including brokers)
-- These columns remain readable to service_role (edge functions / admin RPCs) only.
REVOKE SELECT (stripe_customer_id, stripe_subscription_id)
  ON public.broker_profiles FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id)
  ON public.broker_profiles FROM anon;

-- 3. paige_bank_connections — hide plaintext-column Plaid token from authenticated (including admins)
REVOKE SELECT (plaid_access_token_encrypted)
  ON public.paige_bank_connections FROM authenticated;
REVOKE SELECT (plaid_access_token_encrypted)
  ON public.paige_bank_connections FROM anon;

-- 4. quickbooks_connections — hide encrypted OAuth tokens from authenticated (owners, admins, coaches)
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.quickbooks_connections FROM authenticated;
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.quickbooks_connections FROM anon;

-- 5. tenant_service_subscriptions — split ALL policy into read-only for tenant staff
-- Mutations must go through admin_*_customer_subscription RPCs (SECURITY DEFINER) or service_role.
DROP POLICY IF EXISTS "tenant staff manages own service subs" ON public.tenant_service_subscriptions;

CREATE POLICY "tenant staff reads own service subs"
  ON public.tenant_service_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    (tenant_id = current_user_tenant_id())
    OR is_platform_owner(auth.uid())
  );

-- Explicit service_role escape hatch for edge functions / SECURITY DEFINER RPCs
CREATE POLICY "service role manages service subs"
  ON public.tenant_service_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
