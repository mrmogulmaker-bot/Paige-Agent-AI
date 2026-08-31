-- `oauth_scopes` holds a list, so it is typed as one.
--
-- THE MISMATCH
--
-- The column was declared `text` while `set_tenant_zapier_mcp_connection` takes
-- `_scopes text[]` and inserts it directly, and `clear_tenant_mcp_connection` assigns
-- `ARRAY[]::text[]`. Postgres does not reject that: it applies an I/O assignment cast, so
-- a grant carrying `{"mcp:tools"}` is stored as the literal STRING `{mcp:tools}`.
--
-- WHY IT MATTERS EVEN THOUGH NOTHING READS IT YET
--
-- Nothing reads `oauth_scopes` today, which is exactly why this was invisible: the write
-- succeeded, the proof passed, and no consumer was there to disagree. The first reader to
-- expect the array the setter thinks it stored — a scope check before an action, a display
-- of what was granted — would get a string that looks like an array and is not one, and
-- would fail somewhere far from here. A column whose declared type contradicts every
-- writer is a defect whether or not today's code happens to survive it.
--
-- FORWARD ONLY. The existing values are in Postgres's own array-literal form, because
-- that is what the I/O cast produced, so they convert back exactly.
ALTER TABLE public.tenant_mcp_connections
  ALTER COLUMN oauth_scopes TYPE text[]
  USING CASE
    WHEN oauth_scopes IS NULL THEN NULL
    WHEN btrim(oauth_scopes) = '' THEN ARRAY[]::text[]
    ELSE oauth_scopes::text[]
  END;

COMMENT ON COLUMN public.tenant_mcp_connections.oauth_scopes IS
  'Scopes the provider granted, as a list. Typed text[] because every writer sends text[]; '
  'declared as text it silently stored a stringified array that no reader could use.';
