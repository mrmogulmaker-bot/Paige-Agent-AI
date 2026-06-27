
DROP POLICY IF EXISTS "Service role can insert personal info" ON public.credit_report_personal_info;
CREATE POLICY "Service role can insert personal info"
  ON public.credit_report_personal_info
  FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage economic rates" ON public.economic_rates_cache;
CREATE POLICY "Service role can manage economic rates"
  ON public.economic_rates_cache
  FOR ALL
  TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
