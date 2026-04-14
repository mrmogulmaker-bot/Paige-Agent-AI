
DROP POLICY IF EXISTS "Service role can insert quality logs" ON public.extraction_quality_log;
DROP POLICY IF EXISTS "Service role can update quality logs" ON public.extraction_quality_log;

CREATE POLICY "Admins can insert quality logs"
  ON public.extraction_quality_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update quality logs"
  ON public.extraction_quality_log FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));
