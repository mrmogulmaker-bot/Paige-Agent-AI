-- The schema stops accepting a transport the client cannot speak.
--
-- THE GAP BETWEEN WHAT WAS OFFERED AND WHAT EXISTS
--
-- `tenant_mcp_connections_transport_chk` accepted `sse` for n8n, the settings form offered
-- it, and the setter stored it. Nothing else in the system has ever read it: `mcp-client.ts`
-- always sends one Streamable-HTTP POST and implements no SSE session or message handshake,
-- and `resolveConnection` does not pass the stored transport to the client at all.
--
-- So an admin with an SSE-only endpoint could choose the option that describes their server,
-- have it accepted and stored, and then watch verification fail every time with nothing on
-- screen explaining why. A choice that is recorded and then ignored is worse than one that
-- was never offered: it tells someone the system understood them when it did not.
--
-- Nothing is lost. This transport never worked, and no row on production holds it — the
-- table has no rows at all — so this refuses to ship a broken option rather than removing a
-- working one. Re-offering `sse` means implementing the transport end to end first, at
-- which point this constraint is the thing to widen.
ALTER TABLE public.tenant_mcp_connections
  DROP CONSTRAINT IF EXISTS tenant_mcp_connections_transport_chk;
ALTER TABLE public.tenant_mcp_connections
  ADD CONSTRAINT tenant_mcp_connections_transport_chk CHECK (transport = 'http');

COMMENT ON COLUMN public.tenant_mcp_connections.transport IS
  'Always http. The MCP client speaks Streamable HTTP only; widen this constraint when a '
  'second transport is actually implemented, never before it is offered.';
