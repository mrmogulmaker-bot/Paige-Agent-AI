-- Audit hardening for the avatars bucket.
-- 1) Enforce size + type server-side so the client checks are defense-in-depth,
--    not the only gate (a direct API upload can't drop a 500MB file or an
--    HTML/SVG payload onto the platform's public storage origin).
update storage.buckets
set file_size_limit = 3145728,  -- 3 MB
    allowed_mime_types = array['image/png','image/jpeg','image/webp']
where id = 'avatars';

-- 2) Close cross-tenant enumeration. Public serving of an avatar goes through
--    the public object path (/object/public/avatars/…) which does NOT consult
--    RLS, so <img src> keeps working. The permissive SELECT policy only enabled
--    the authenticated .list()/.download() API — which let any user enumerate
--    every user's uid folder across every tenant. Restrict it to own folder.
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars owner list" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
