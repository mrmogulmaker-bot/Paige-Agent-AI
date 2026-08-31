-- Legacy rows in the PRE-migration shape, seeded before the MCP migrations run.
--
-- WHY THIS FILE EXISTS AS A FILE
--
-- The legacy-normalisation behaviour was previously checked by typing an INSERT into a
-- scratch database by hand. That check passed, and it covered exactly one legacy shape —
-- the one that happened to be typed. The transport shapes the old table also accepted were
-- never seeded, so the migration's transport constraint went unexercised and shipped able to
-- abort a deploy. A proof that is retyped each time only ever covers what the typist thought
-- of; a proof that is a file covers what the file says, every run, including the runs where
-- nobody is thinking about it.
--
-- WHAT A LEGACY ROW IS: a connection written by 20260804130000, before `provider` and
-- `auth_kind` existed. Every such row therefore backfills to provider='zapier' (the column
-- default) and auth_kind='bearer', and its transport is whichever of http/sse/stdio the old
-- CHECK allowed. All three are seeded because all three were storable.
INSERT INTO public.tenants (id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_mcp_connections
  (tenant_id, label, server_url_ct, auth_token_ct, auth_token_last4, transport, enabled, status)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'legacy http',
   public.platform_encrypt('https://mcp.example.test/http'),
   public.platform_encrypt('pasted-token-aaaa'), 'aaaa', 'http',  true, 'connected'),
  ('22222222-2222-2222-2222-222222222222', 'legacy sse',
   public.platform_encrypt('https://mcp.example.test/sse'),
   public.platform_encrypt('pasted-token-bbbb'), 'bbbb', 'sse',   true, 'connected'),
  ('33333333-3333-3333-3333-333333333333', 'legacy stdio',
   public.platform_encrypt('https://mcp.example.test/stdio'),
   public.platform_encrypt('pasted-token-cccc'), 'cccc', 'stdio', true, 'connected');
