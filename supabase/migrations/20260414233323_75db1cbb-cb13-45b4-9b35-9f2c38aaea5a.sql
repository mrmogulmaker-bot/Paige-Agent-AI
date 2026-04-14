CREATE OR REPLACE FUNCTION public.factory_reset_delete_dispute_related(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  linked_client_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO linked_client_ids
  FROM public.clients
  WHERE linked_user_id = _user_id;

  DELETE FROM public.dispute_outcomes WHERE user_id = _user_id;
  DELETE FROM public.dispute_letters WHERE user_id = _user_id;
  DELETE FROM public.disputes WHERE user_id = _user_id;
  DELETE FROM public.credit_negative_items WHERE user_id = _user_id;
  DELETE FROM public.credit_report_personal_info WHERE user_id = _user_id;

  IF array_length(linked_client_ids, 1) IS NOT NULL THEN
    DELETE FROM public.dispute_outcomes WHERE client_id = ANY(linked_client_ids);
    DELETE FROM public.disputes WHERE client_id = ANY(linked_client_ids);
    DELETE FROM public.credit_negative_items WHERE client_id = ANY(linked_client_ids);
    DELETE FROM public.credit_report_personal_info WHERE client_id = ANY(linked_client_ids);
  END IF;
END;
$$;