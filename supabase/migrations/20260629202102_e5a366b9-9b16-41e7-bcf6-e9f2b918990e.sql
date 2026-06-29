
-- 1) Remove publicly-readable broker_auto_approve policy. Admin policies remain.
DROP POLICY IF EXISTS "Anyone can read broker_auto_approve flag" ON public.admin_app_settings;

-- 2) Add tenant isolation to coach access on paige_conversations.
DROP POLICY IF EXISTS "Coaches read assigned contact conversations" ON public.paige_conversations;
CREATE POLICY "Coaches read assigned contact conversations"
ON public.paige_conversations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND can_access_contact(auth.uid(), contact_id)
  AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id() OR public.is_platform_owner())
);

DROP POLICY IF EXISTS "Coaches update assigned contact conversations" ON public.paige_conversations;
CREATE POLICY "Coaches update assigned contact conversations"
ON public.paige_conversations
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'coach'::app_role)
  AND can_access_contact(auth.uid(), contact_id)
  AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id() OR public.is_platform_owner())
)
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND can_access_contact(auth.uid(), contact_id)
  AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id() OR public.is_platform_owner())
);

DROP POLICY IF EXISTS "Coaches write assigned contact conversations" ON public.paige_conversations;
CREATE POLICY "Coaches write assigned contact conversations"
ON public.paige_conversations
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND can_access_contact(auth.uid(), contact_id)
  AND (tenant_id IS NULL OR tenant_id = public.current_user_tenant_id() OR public.is_platform_owner())
);
