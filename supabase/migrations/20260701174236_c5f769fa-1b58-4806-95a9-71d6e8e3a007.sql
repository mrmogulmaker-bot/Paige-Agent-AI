INSERT INTO public._internal_secrets (key, value, updated_at)
VALUES ('platform_stage_change_webhook_url',
        'https://mrmogulmaker.app.n8n.cloud/webhook/paige-stage-change',
        now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
RETURNING key, length(value) AS len, updated_at;