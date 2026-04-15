
CREATE OR REPLACE FUNCTION public.delete_credit_report_upload(_upload_id uuid, _calling_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _upload record;
  _file_path text;
BEGIN
  IF NOT (public.has_role(_calling_user_id, 'admin') OR public.has_role(_calling_user_id, 'coach')) THEN
    RAISE EXCEPTION 'Unauthorized: only admins or coaches can delete uploads';
  END IF;

  SELECT id, file_path, user_id INTO _upload
  FROM public.credit_report_uploads
  WHERE id = _upload_id;

  IF _upload IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Upload not found');
  END IF;

  _file_path := _upload.file_path;

  DELETE FROM public.credit_report_personal_info
  WHERE credit_report_upload_id = _upload_id;

  DELETE FROM public.credit_report_uploads
  WHERE id = _upload_id;

  INSERT INTO public.audit_logs (user_id, entity, action, entity_id, data)
  VALUES (
    _calling_user_id,
    'credit_report_uploads',
    'admin_delete',
    _upload_id,
    jsonb_build_object('file_path', _file_path, 'target_user_id', _upload.user_id::text)
  );

  RETURN json_build_object(
    'success', true,
    'file_path', _file_path,
    'message', 'Upload and related data deleted'
  );
END;
$$;
