
-- Trigger 1: When a new credit alert is inserted, dispatch via send-notification edge function
CREATE OR REPLACE FUNCTION public.notify_credit_alert_inserted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _project_url text;
  _service_key text;
  _user_id uuid;
  _sms_body text;
  _bureau_label text;
BEGIN
  _project_url := 'https://bfmyebsjyuoecmjskqhs.supabase.co';

  SELECT value INTO _service_key
  FROM public._internal_secrets
  WHERE key = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- credit_alerts.client_id refers to profiles.user_id
  _user_id := NEW.client_id;

  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  _bureau_label := COALESCE(NEW.bureau, 'your credit');
  _sms_body := 'PaigeAgent Alert: ' || left(COALESCE(NEW.alert_title, 'New credit event'), 80) ||
               '. Check the app for details. Reply STOP to unsubscribe.';

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', _user_id,
      'message_type', 'credit_alert',
      'email_data', jsonb_build_object(
        'alertType', COALESCE(NEW.alert_type, 'New Credit Event'),
        'alertTitle', COALESCE(NEW.alert_title, 'Credit alert detected'),
        'alertDescription', COALESCE(NEW.alert_description, ''),
        'bureau', _bureau_label
      ),
      'sms_body', _sms_body
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_credit_alert_inserted failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_credit_alert_inserted ON public.credit_alerts;
CREATE TRIGGER trg_notify_credit_alert_inserted
AFTER INSERT ON public.credit_alerts
FOR EACH ROW
EXECUTE FUNCTION public.notify_credit_alert_inserted();

-- Trigger 2: New auth.users signup -> send onboarding welcome email (immediate)
CREATE OR REPLACE FUNCTION public.notify_new_user_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _project_url text;
  _service_key text;
BEGIN
  _project_url := 'https://bfmyebsjyuoecmjskqhs.supabase.co';

  SELECT value INTO _service_key
  FROM public._internal_secrets
  WHERE key = 'service_role_key'
  LIMIT 1;

  IF _service_key IS NULL OR NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := _project_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.id,
      'message_type', 'onboarding',
      'email_data', jsonb_build_object(
        'firstName', COALESCE(NEW.raw_user_meta_data->>'full_name', '')
      )
    )::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_new_user_onboarding failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_user_onboarding ON auth.users;
CREATE TRIGGER trg_notify_new_user_onboarding
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_user_onboarding();
