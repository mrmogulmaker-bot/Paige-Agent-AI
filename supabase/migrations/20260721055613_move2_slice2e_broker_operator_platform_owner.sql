-- Move 2 · Slice 2e (broker cluster) — narrow the standalone has_role('admin') to is_platform_owner()
-- on the PLATFORM broker/referral program tables (6 tables). Brokers are a platform-operator concept
-- (§9 "us"): the operator runs a broker network — broker applications reviewed by the operator, referral
-- commissions, broker teams — with NO tenant dimension. A tenant admin has no business managing broker
-- profiles/commissions/relationships; only the super_admin operator. The broker-SELF clauses
-- (broker_profiles.user_id = auth.uid(), or auth.uid() = user_id on broker_profiles itself) are the
-- legitimate own-data access and are PRESERVED VERBATIM — only the admin operator-override term is swapped.
--
-- PURE NARROWING (§13/§31): swap ONLY has_role('admin') → is_platform_owner(); every broker-self EXISTS
-- clause and owner-self (auth.uid()=user_id) disjunct is preserved byte-for-byte.
--
-- user_business_limits IS folded in (crew verdict FOLD-IN-AS-OPERATOR): it keys on user_id only (no
-- tenant_id/business_id) and is a per-user PLATFORM quota row (max_businesses driven by plan slug +
-- additional_business_monthly_fee; operator-seeded) with an operator-override admin layer — structurally
-- the §9 operator family (like Slice 2d). Both admin policies → is_platform_owner(); the "Users view own"
-- (auth.uid()=user_id) SELF policy and the service-role policy are preserved. (Follow-up #395-adjacent: the
-- SECURITY DEFINER RPC admin_set_user_business_limit gates internally on has_role(admin) — bypasses RLS so
-- this doesn't break the modal, but should be narrowed to is_platform_owner in the RPC-scoping slice; filed.)
--
-- DATA-SAFETY: platform broker program + per-user quota, near-empty pre-launch.

-- broker_profiles — operator manage (delete/update/view) + broker-self (auth.uid()=user_id) preserved
ALTER POLICY "Admins delete broker profile" ON public.broker_profiles
  USING (public.is_platform_owner());
ALTER POLICY "Admins update broker profiles" ON public.broker_profiles
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins view all broker profiles" ON public.broker_profiles
  USING (public.is_platform_owner());
ALTER POLICY "Anyone can submit broker application" ON public.broker_profiles
  WITH CHECK ((auth.uid() = user_id) OR public.is_platform_owner());
ALTER POLICY "Brokers update own profile" ON public.broker_profiles
  USING ((auth.uid() = user_id) OR public.is_platform_owner())
  WITH CHECK ((auth.uid() = user_id) OR public.is_platform_owner());
ALTER POLICY "Brokers view own profile" ON public.broker_profiles
  USING ((auth.uid() = user_id) OR public.is_platform_owner());

-- broker_client_relationships — operator view-all + broker-self (via broker_profiles.user_id) preserved
ALTER POLICY "Admins view all broker client relationships" ON public.broker_client_relationships
  USING (public.is_platform_owner());
ALTER POLICY "Brokers manage their clients" ON public.broker_client_relationships
  USING (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE bp.id = broker_client_relationships.broker_id AND bp.user_id = auth.uid())))
  WITH CHECK (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE bp.id = broker_client_relationships.broker_id AND bp.user_id = auth.uid())));

-- broker_paige_sessions — broker-self manage (admin override → operator) preserved
ALTER POLICY "Brokers manage their sessions" ON public.broker_paige_sessions
  USING (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE bp.id = broker_paige_sessions.broker_id AND bp.user_id = auth.uid())))
  WITH CHECK (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE bp.id = broker_paige_sessions.broker_id AND bp.user_id = auth.uid())));

-- broker_referral_commissions — operator manage + broker-self read (referring/referred broker) preserved
ALTER POLICY "Admins manage broker referral commissions" ON public.broker_referral_commissions
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Brokers see their own referral commissions" ON public.broker_referral_commissions
  USING (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE (bp.id = broker_referral_commissions.referring_broker_id
                  OR bp.id = broker_referral_commissions.referred_broker_id)
             AND bp.user_id = auth.uid())));

-- broker_session_messages — operator read-all
ALTER POLICY "Admins read all broker session messages" ON public.broker_session_messages
  USING (public.is_platform_owner());

-- broker_team_members — operator manage-all + broker-self manage (via broker_profiles.user_id) preserved
ALTER POLICY "Admins can manage all team members" ON public.broker_team_members
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Brokers manage their team" ON public.broker_team_members
  USING (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE bp.id = broker_team_members.broker_id AND bp.user_id = auth.uid())))
  WITH CHECK (public.is_platform_owner() OR (EXISTS (SELECT 1 FROM broker_profiles bp
           WHERE bp.id = broker_team_members.broker_id AND bp.user_id = auth.uid())));

-- user_business_limits (user_id) — operator per-user quota; BOTH admin policies → is_platform_owner()
-- ("Admins manage" ALL carries an admin WITH CHECK = affiliate-trap INSERT residual, so narrow both sides).
ALTER POLICY "Admins manage business limits" ON public.user_business_limits
  USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
ALTER POLICY "Admins view all business limits" ON public.user_business_limits
  USING (public.is_platform_owner());
