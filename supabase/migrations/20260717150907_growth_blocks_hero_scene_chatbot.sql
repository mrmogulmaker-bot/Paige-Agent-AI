-- Growth OS block allowlist — add `hero_scene` (#240, animated brand-toned hero) and repair a
-- live drift: `chatbot` shipped in the TS union + validator + prompt spec + renderer but was
-- NEVER added to this SQL allowlist, so a page containing a chatbot block is rejected on
-- save/publish today (§13). This CREATE OR REPLACE adds BOTH kinds; the rest of the validator
-- body is unchanged from 20260714091000_growth_authoring_seams.sql (the one hard persistence
-- gate; the TS validateBlock in _shared/growth-blocks.ts is the stricter advisory cleaner).
CREATE OR REPLACE FUNCTION public.growth_validate_blocks(p_blocks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _block jsonb;
  _btype text;
  _url   text;
  _img   jsonb;
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: blocks_json must be a JSON array' USING ERRCODE = '22023';
  END IF;
  FOR _block IN SELECT value FROM jsonb_array_elements(p_blocks) LOOP
    IF jsonb_typeof(_block) <> 'object' THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: each block must be an object' USING ERRCODE = '22023';
    END IF;
    _btype := _block->>'type';
    IF _btype IS NULL OR _btype NOT IN (
      'hero','hero_scene','phase_cards','feature_grid','cta','rich_text','embedded_form',
      'social_proof','testimonial','pricing','faq','media','stats','countdown',
      'two_column','image','gallery','steps','chatbot'
    ) THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: unknown block type %', COALESCE(_btype, '(null)') USING ERRCODE = '22023';
    END IF;

    IF _btype = 'rich_text' AND char_length(COALESCE(_block->>'html', '')) > 20000 THEN
      RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: rich_text html exceeds 20000 characters' USING ERRCODE = '22023';
    END IF;

    IF _btype = 'media' THEN
      IF COALESCE(_block->>'provider', '') NOT IN ('youtube','vimeo','loom','mp4') THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: media.provider must be one of youtube, vimeo, loom, mp4' USING ERRCODE = '22023';
      END IF;
      _url := _block->>'url';
      IF _url IS NULL OR _url !~ '^https://' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: media.url must be an https URL' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF _btype = 'image' THEN
      _url := _block->>'url';
      IF _url IS NULL OR _url !~ '^https://' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: image.url must be an https URL' USING ERRCODE = '22023';
      END IF;
    END IF;

    IF _btype = 'gallery' THEN
      IF jsonb_typeof(_block->'images') <> 'array' THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: gallery.images must be an array' USING ERRCODE = '22023';
      END IF;
      FOR _img IN SELECT value FROM jsonb_array_elements(_block->'images') LOOP
        _url := _img->>'url';
        IF _url IS NULL OR _url !~ '^https://' THEN
          RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: gallery image url must be an https URL' USING ERRCODE = '22023';
        END IF;
      END LOOP;
    END IF;

    IF _btype = 'countdown' THEN
      IF NULLIF(btrim(COALESCE(_block->>'ends_at', '')), '') IS NULL THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: countdown.ends_at is required' USING ERRCODE = '22023';
      END IF;
      BEGIN
        PERFORM (_block->>'ends_at')::timestamptz;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'GROWTH_INVALID_BLOCKS: countdown.ends_at must be a valid timestamp' USING ERRCODE = '22023';
      END;
    END IF;
  END LOOP;
END; $function$;

REVOKE ALL ON FUNCTION public.growth_validate_blocks(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.growth_validate_blocks(jsonb) TO authenticated, service_role;
