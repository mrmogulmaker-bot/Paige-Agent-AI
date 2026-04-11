CREATE OR REPLACE FUNCTION public.log_profile_pii_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.ssn_encrypted IS DISTINCT FROM NEW.ssn_encrypted) OR
       (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) THEN
      
      INSERT INTO public.pii_access_log (
        accessed_user_id,
        accessor_user_id,
        table_name,
        field_names,
        access_type
      ) VALUES (
        NEW.user_id,
        auth.uid(),
        'profiles',
        ARRAY['ssn_encrypted', 'date_of_birth'],
        'update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;