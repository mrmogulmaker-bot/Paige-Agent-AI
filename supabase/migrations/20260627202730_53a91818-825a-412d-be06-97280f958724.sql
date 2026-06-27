
ALTER TABLE public.paige_config
  ADD COLUMN IF NOT EXISTS meta_ads_features_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS docusign_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS meta_pixel_tracked_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_capi_access_token text,
  ADD COLUMN IF NOT EXISTS meta_capi_test_event_code text;
