-- 1) Constrain client.status to a known set of values so any update path
--    (UI, edge function, script) is forced to use a valid value.
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('pending', 'active', 'inactive', 'archived'));

-- 2) Prevent two client records from being linked to the same auth user.
--    Partial index so multiple unlinked (NULL) rows remain allowed.
CREATE UNIQUE INDEX IF NOT EXISTS clients_linked_user_id_unique
  ON public.clients (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

-- 3) Prevent two client records (created by the same coach/admin) from sharing
--    the same email. Case-insensitive, partial so NULL/empty emails are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS clients_created_by_email_unique
  ON public.clients (created_by, lower(email))
  WHERE email IS NOT NULL AND email <> '';