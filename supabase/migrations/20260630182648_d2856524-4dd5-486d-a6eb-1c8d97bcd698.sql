-- growth_forms: restrict anon to only the columns needed to render the public form
REVOKE SELECT ON public.growth_forms FROM anon;
GRANT SELECT (
  id, slug, name, schema_json, success_action_json, status, created_at, updated_at
) ON public.growth_forms TO anon;

-- growth_pages: restrict anon to only the columns needed to render the public page
REVOKE SELECT ON public.growth_pages FROM anon;
GRANT SELECT (
  id, slug, title, blocks_json, theme_json, seo_json, og_image_url, status, created_at, updated_at
) ON public.growth_pages TO anon;