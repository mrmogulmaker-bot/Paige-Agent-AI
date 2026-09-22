/**
 * useMcpGateway — the FIRST frontend binding of the G1a-1 registry-native connection writers
 * (PR #1322, migrations 20270319/20270330/20270331). It reads and writes the `mcp_connections`
 * registry DIRECTLY through SECURITY DEFINER RPCs.
 *
 * This is a DISTINCT authority from `useMcpConnection` (the legacy n8n/Zapier hook), which writes
 * through the `tenant-mcp-connect` edge function and reads `get_tenant_mcp_connections`. The two
 * never share a write path (single authority per facet — the G1a-1 rebuild rule). This hook never
 * calls a legacy writer.
 *
 * Truth boundaries (enforced by the backend contract, mirrored here so the UI can never over-claim):
 *   - Tenant is resolved SERVER-SIDE. Reads pass NO tenant argument; writes pass the caller's own
 *     `activeTenantId` only as an expected-tenant guard (a foreign id → uniform MCP_FORBIDDEN).
 *   - Secrets are NEVER returned. `get_mcp_connections_v2` returns the endpoint HOST only and the
 *     aggregate tool/approved counts — it does NOT return `auth_token_last4`; the last-4 exists only
 *     transiently in a create/re-key response. The UI shows host + type, never a credential.
 *   - A newly created / re-keyed row is `pending_verification / unknown` until the G2 verify probe
 *     (a later PR) promotes it. This hook never fabricates a `connected` state.
 *   - Per-connection tool-list READ and single-tool REVOKE are not defined by G1a-1, so this hook
 *     exposes neither; the detail surface shows the honest aggregate + pending state instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";

export type GatewayStatus = "unconfigured" | "pending_verification" | "connected" | "error";
export type GatewayHealth = "unknown" | "checking" | "healthy" | "needs_attention";

/** A row as the UI consumes it — host + aggregates only, never a secret. */
export type GatewayConnection = {
  id: string;
  providerKey: string;
  label: string;
  transport: string | null;
  authKind: string | null;
  configured: boolean;
  enabled: boolean;
  status: GatewayStatus;
  health: GatewayHealth;
  lastCheckedAt: string | null;
  grantedScopes: string[];
  visibility: string | null;
  serverUrlHost: string | null;
  toolCount: number | null;
  approvedCount: number | null;
};

/** The generic-remote-MCP credential shapes the create RPC accepts today (OAuth dance is UNDECIDED). */
export type GatewayAuthKind = "bearer" | "header" | "oauth" | "url" | "none";

export type CreateMcpDraft = {
  providerKey: string;
  label: string;
  serverUrl: string;
  authKind: GatewayAuthKind;
  authToken?: string | null;
  authHeaderName?: string | null;
};

export type CreateRestDraft = { label: string; baseUrl: string; apiKey: string };

/** Result of a write — carries the honest server outcome, never a hoped-for one. */
export type GatewayWriteResult = {
  ok: boolean;
  code: string | null;
  message: string | null;
  connectionId?: string | null;
  status?: string | null;
  /** last-4 is only ever present here (a create/re-key response), never in the list read. */
  last4?: string | null;
  mode?: string | null;
};

export type McpGatewayState = {
  tools: GatewayConnection[];
  loading: boolean;
  /** A failed READ — distinct from an empty account (no connections yet). */
  error: boolean;
  /** capability `mcp.connections.manage` proxy (owner / tenant-admin); the server is the real gate. */
  canWrite: boolean;
  saving: boolean;
  /** Owner-language message for the last failed write, or null. */
  writeError: string | null;
};

const EMPTY: McpGatewayState = {
  tools: [],
  loading: true,
  error: false,
  canWrite: false,
  saving: false,
  writeError: null,
};

const STATUSES = new Set<GatewayStatus>(["unconfigured", "pending_verification", "connected", "error"]);
const HEALTHS = new Set<GatewayHealth>(["unknown", "checking", "healthy", "needs_attention"]);

/**
 * Closed-set error-code → owner-facing copy. Ported verbatim from the approved pack (the closed set
 * is the backend contract's). An unknown code degrades to a plain, honest sentence — never a raw code.
 */
const ERR: Record<string, string> = {
  MCP_FORBIDDEN: "You don't have permission to manage tools for this workspace.",
  MCP_BAD_PROVIDER: "That provider isn't recognized.",
  MCP_BAD_LABEL: "Enter a name for this tool.",
  MCP_BAD_VISIBILITY: "That visibility isn't valid for this tool.",
  MCP_BAD_AUTH_KIND: "That sign-in type isn't valid for this tool.",
  MCP_AUTH_KIND_NOT_EXECUTABLE:
    "An API key can't be used for a remote MCP server — add it as an n8n API-key tool instead.",
  MCP_BAD_ENDPOINT:
    "That address can't be used. Enter a public https:// address — local, private, or non-HTTPS addresses aren't allowed.",
  MCP_BAD_CREDENTIAL_BUNDLE: "Those credentials are incomplete for this sign-in type.",
  MCP_OAUTH_TOKEN_EXPIRED: "That access token has already expired. Get a fresh one and try again.",
  MCP_DUPLICATE_LABEL: "You already have a tool with that name — pick a different name.",
  MCP_NOT_A_REST_CONNECTION: "This isn't an API-key tool, so it can't be re-keyed this way.",
  MCP_NO_CONNECTION: "That tool could not be found.",
  // This row is a projection of the shipped n8n/Zapier path, which still owns it. Telling the owner
  // to "disconnect and add it again" here would be an instruction this surface cannot carry out —
  // the same writers that refuse the edit refuse the disconnect. Name the surface that CAN.
  MCP_LEGACY_CONNECTION_READONLY:
    "This one is managed on its own integration card below — open n8n or Zapier there to change it.",
};

/** Owner-facing copy for an MCP_* code. Exported so both the hook and its callers map identically. */
export function mcpGatewayMessage(code: string | null): string {
  if (code && ERR[code]) return ERR[code];
  return "That didn't go through. Check the details and try again.";
}

/** Pull the closed-set MCP_* token out of a Postgres error (raised as the exception MESSAGE). */
function extractCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: unknown; details?: unknown; hint?: unknown };
  for (const field of [e.message, e.details, e.hint]) {
    if (typeof field === "string") {
      const m = field.match(/MCP_[A-Z_]+/);
      if (m) return m[0];
    }
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
function bool(value: unknown): boolean {
  return value === true;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function scopes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Parse one registry row into the host-only, secret-free shape the UI renders. */
function readRow(value: unknown): GatewayConnection | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const id = str(r.connection_id);
  if (!id) return null;
  const status = (str(r.status) ?? "unconfigured") as GatewayStatus;
  const health = (str(r.health) ?? "unknown") as GatewayHealth;
  return {
    id,
    providerKey: str(r.provider_key) ?? "generic-remote",
    label: str(r.label) ?? "Tool",
    transport: str(r.transport),
    authKind: str(r.auth_kind),
    configured: bool(r.configured),
    enabled: bool(r.enabled),
    status: STATUSES.has(status) ? status : "unconfigured",
    health: HEALTHS.has(health) ? health : "unknown",
    lastCheckedAt: str(r.last_checked_at),
    grantedScopes: scopes(r.granted_scopes),
    visibility: str(r.visibility),
    serverUrlHost: str(r.server_url_host),
    toolCount: count(r.tool_count),
    approvedCount: count(r.approved_count),
  };
}

/** `get_mcp_connections_v2` returns a jsonb array; tolerate a `{connections:[…]}` wrapper defensively. */
function readList(value: unknown): GatewayConnection[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { connections?: unknown }).connections)
      ? (value as { connections: unknown[] }).connections
      : [];
  return rows.map(readRow).filter((row): row is GatewayConnection => row !== null);
}

export type UseMcpGateway = McpGatewayState & {
  createMcp: (draft: CreateMcpDraft) => Promise<GatewayWriteResult>;
  createRest: (draft: CreateRestDraft) => Promise<GatewayWriteResult>;
  rekeyMcp: (
    connectionId: string,
    serverUrl: string,
    authKind: GatewayAuthKind,
    authToken?: string | null,
    authHeaderName?: string | null,
  ) => Promise<GatewayWriteResult>;
  rekeyRest: (connectionId: string, baseUrl: string, apiKey: string) => Promise<GatewayWriteResult>;
  disconnect: (connectionId: string, hard: boolean) => Promise<GatewayWriteResult>;
  reload: () => void;
  dismissWriteError: () => void;
};

export function useMcpGateway(): UseMcpGateway {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  // The gateway lists ALL of a tenant's connections, so the scope is provider-agnostic.
  const scope = `${activeUserId ?? ""}:${activeTenantId ?? ""}:${tenantLoading}`;
  const scopeRef = useRef(scope);
  const mounted = useRef(false);
  const mutation = useRef(0);
  const pendingMutation = useRef(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [state, setState] = useState<McpGatewayState>({ ...EMPTY });

  // Mask stale data the instant the workspace identity changes — before any effect can paint it.
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    gate.current.clear();
    mutation.current += 1;
    pendingMutation.current = false;
    if (loadedScope !== null) setLoadedScope(null);
  }

  const load = useCallback(async () => {
    if (tenantLoading) return;
    const token = gate.current.begin();
    const [list, admin] = (await Promise.all([
      // Reads take NO tenant argument — the server derives the tenant. (Locked by the settings
      // truth-boundary test: every get_* call carries exactly its own name and no args.)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_mcp_connections_v2"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("is_current_user_tenant_admin"),
    ]).catch(() => [
      { data: null, error: true },
      { data: null, error: true },
    ])) as [{ data: unknown; error: unknown }, { data: unknown; error: unknown }];

    if (!mounted.current || scopeRef.current !== scope || !gate.current.isCurrent(token)) return;
    setLoadedScope(scope);
    if (list.error) {
      // A failed READ is never rendered as "no connections" — that would lie about the account.
      setState((prev) => ({
        ...EMPTY,
        loading: false,
        error: true,
        canWrite: false,
        saving: pendingMutation.current,
        writeError: prev.writeError,
      }));
      return;
    }
    setState((prev) => ({
      tools: readList(list.data),
      loading: false,
      error: false,
      canWrite: admin && (admin as { error?: unknown }).error ? false : (admin as { data?: unknown }).data === true,
      saving: pendingMutation.current,
      writeError: prev.writeError,
    }));
  }, [scope, tenantLoading]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const run = useCallback(
    async (name: string, params: Record<string, unknown>): Promise<GatewayWriteResult> => {
      // Guard: real tenant, current scope, mounted, write authority, no in-flight write.
      if (!activeTenantId || tenantLoading) {
        // Not ready is not a rejection: nothing was sent, so nothing was refused.
        return { ok: false, code: "MCP_NOT_READY", message: null };
      }
      if (!state.canWrite) {
        return { ok: false, code: "MCP_FORBIDDEN", message: ERR.MCP_FORBIDDEN };
      }
      if (pendingMutation.current) {
        // A write is already in flight; this one is dropped, and the one running still decides.
        return { ok: false, code: "MCP_BUSY", message: null };
      }
      const request = ++mutation.current;
      pendingMutation.current = true;
      const current = () => mounted.current && scopeRef.current === scope && mutation.current === request;
      setState((prev) => ({ ...prev, saving: true, writeError: null }));

      // Writes carry the caller's OWN tenant id as an expected-tenant guard against a mid-flight switch.
      // `supabase.rpc()` returns a PostgrestFilterBuilder — a thenable with NO `.catch`, so it is
      // adopted by Promise.resolve BEFORE any rejection handler is attached. Calling `.catch` on the
      // builder directly throws before the request is sent (and an `as Promise<…>` assertion hides
      // that from tsc). Same idiom as useN8nConnection.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = (supabase as any).rpc(name, { ...params, _tenant_id: activeTenantId });
      const { data, error } = (await Promise.resolve(call).catch(() => ({
        data: null,
        error: true as unknown,
      }))) as { data: unknown; error: unknown };

      if (!current()) {
        pendingMutation.current = false;
        return { ok: false, code: null, message: null };
      }
      pendingMutation.current = false;

      if (error) {
        const code = extractCode(error);
        const message = mcpGatewayMessage(code);
        setState((prev) => ({ ...prev, saving: false, writeError: message }));
        return { ok: false, code, message };
      }
      const out = (data ?? {}) as Record<string, unknown>;
      setState((prev) => ({ ...prev, saving: false, writeError: null }));
      // Success — reload the list from the server (never optimistic; the server is the truth).
      void load();
      return {
        ok: true,
        code: null,
        message: null,
        connectionId: str(out.connection_id),
        status: str(out.status),
        last4: str(out.auth_token_last4),
        mode: str(out.mode),
      };
    },
    [activeTenantId, tenantLoading, state.canWrite, scope, load],
  );

  const createMcp = useCallback(
    (draft: CreateMcpDraft) =>
      run("create_mcp_connection", {
        _provider_key: draft.providerKey,
        _label: draft.label,
        _server_url: draft.serverUrl,
        _auth_kind: draft.authKind,
        // Only the credential the chosen auth_kind actually uses is sent; nothing else.
        _auth_token: draft.authKind === "bearer" || draft.authKind === "header" ? draft.authToken ?? null : null,
        _auth_header_name: draft.authKind === "header" ? draft.authHeaderName ?? null : null,
      }),
    [run],
  );

  const createRest = useCallback(
    (draft: CreateRestDraft) =>
      // NAMED params are mandatory: create_mcp_rest_connection's first arg `_provider_key` defaults
      // to 'n8n', so a positional label would misbind it → MCP_BAD_PROVIDER. supabase.rpc's params
      // object binds by name, which is exactly what the contract requires.
      run("create_mcp_rest_connection", {
        _provider_key: "n8n",
        _label: draft.label,
        _base_url: draft.baseUrl,
        _api_key: draft.apiKey,
      }),
    [run],
  );

  const rekeyMcp = useCallback(
    (
      connectionId: string,
      serverUrl: string,
      authKind: GatewayAuthKind,
      authToken?: string | null,
      authHeaderName?: string | null,
    ) =>
      run("set_mcp_connection_endpoint", {
        _connection_id: connectionId,
        _server_url: serverUrl,
        _auth_kind: authKind,
        // `url` and `none` carry no credential by contract; every other kind carries what it was given.
        _auth_token: authKind === "url" || authKind === "none" ? null : authToken ?? null,
        _auth_header_name: authKind === "header" ? authHeaderName ?? null : null,
      }),
    [run],
  );

  const rekeyRest = useCallback(
    (connectionId: string, baseUrl: string, apiKey: string) =>
      run("set_mcp_rest_connection_endpoint", {
        _connection_id: connectionId,
        _base_url: baseUrl,
        _api_key: apiKey,
      }),
    [run],
  );

  const disconnect = useCallback(
    (connectionId: string, hard: boolean) =>
      run("disconnect_mcp_connection", { _connection_id: connectionId, _hard: hard }),
    [run],
  );

  const reload = useCallback(() => {
    void load();
  }, [load]);

  const dismissWriteError = useCallback(() => {
    setState((prev) => ({ ...prev, writeError: null }));
  }, []);

  // While the scope has not finished loading (or the tenant is still resolving), present the masked
  // EMPTY state rather than another workspace's rows.
  const visible: McpGatewayState =
    loadedScope !== scope || tenantLoading
      ? { ...EMPTY, loading: true, saving: state.saving, writeError: state.writeError }
      : state;

  return {
    ...visible,
    createMcp,
    createRest,
    rekeyMcp,
    rekeyRest,
    disconnect,
    reload,
    dismissWriteError,
  };
}
