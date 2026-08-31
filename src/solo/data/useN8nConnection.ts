/**
 * n8n connection state for Settings → Integrations.
 *
 * Every read and write goes through the three authoritative RPCs that already
 * exist. They were audited before this hook was written (2026-08-31):
 *
 *   - the caller is always `auth.uid()`, never a parameter, so no passed-actor
 *     bypass is possible;
 *   - the tenant is always `current_user_tenant_id()`, and a differing
 *     `_tenant_id` raises 42501 unless the caller is a platform owner;
 *   - reads require tenant membership, writes and clears require tenant admin;
 *   - EXECUTE is granted to `authenticated` and `service_role` only — `anon`
 *     cannot call any of them, which is what makes the `auth.uid() IS NULL`
 *     service-role branch inside each function safe;
 *   - every rejection RAISEs rather than returning a silent null.
 *
 * The API key is write-only end to end. `get_tenant_n8n_connection` returns
 * `api_key_last4` and never the key itself, so there is no path by which a
 * stored key can be read back to a browser. This hook never holds the key: it
 * is passed as an argument, sent, and dropped.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";

export type N8nConnection = {
  configured: boolean;
  label: string | null;
  /** The tenant's own instance address. Not a secret; needed to show and re-edit. */
  baseUrl: string | null;
  /** Last four characters only. The key itself is never returned by the seam. */
  last4: string | null;
  status: string | null;
  lastSyncAt: string | null;
  workflowCount: number | null;
};

export type N8nState = N8nConnection & {
  loading: boolean;
  /** The read failed. Distinct from "not configured" — nothing is claimed. */
  error: boolean;
  /** Tenant admin. The RPC enforces this too; this only shapes the UI. */
  canWrite: boolean;
  saving: boolean;
  /** Owner-language only. Raw database text is never surfaced. */
  writeError: string | null;
};

export type N8nDraft = { baseUrl: string; apiKey: string; label: string };

const EMPTY: N8nConnection = {
  configured: false, label: null, baseUrl: null, last4: null,
  status: null, lastSyncAt: null, workflowCount: null,
};

/**
 * Whitelists the fields this surface may show. `last_error` is deliberately
 * NOT among them: it is written from provider responses by the n8n sync path,
 * so it is unbounded external text and has no place in a settings surface.
 */
function readConnection(value: unknown): N8nConnection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
  const row = value as Record<string, unknown>;
  return {
    configured: row.configured === true,
    label: typeof row.label === "string" && row.label.trim() ? row.label : null,
    baseUrl: typeof row.base_url === "string" && row.base_url.trim() ? row.base_url : null,
    last4: typeof row.api_key_last4 === "string" && row.api_key_last4.trim() ? row.api_key_last4 : null,
    status: typeof row.status === "string" ? row.status : null,
    lastSyncAt: typeof row.last_sync_at === "string" ? row.last_sync_at : null,
    workflowCount: typeof row.workflow_count === "number" ? row.workflow_count : null,
  };
}

/**
 * The seam RAISEs a prefixed, non-sensitive code for every rejection it models.
 * Mapping on that prefix keeps the owner's message in the product's own voice
 * and keeps constraint names, column names and provider text off the screen.
 * Anything unrecognised degrades to a plain statement rather than a guess.
 */
export function n8nWriteMessage(raw: unknown): string {
  const code = typeof raw === "string" ? raw : "";
  if (code.includes("N8N_FORBIDDEN")) return "Only a workspace admin can change this connection.";
  if (code.includes("N8N_INSECURE_URL")) return "The address has to start with https:// so the key is never sent in the clear.";
  // A URL like https://real.n8n.cloud@somewhere-else/ reads as the first host and
  // resolves to the second, so the message names the fix rather than the shape.
  if (code.includes("N8N_URL_CREDENTIALS")) return "Remove the username and password from the address — everything before the @ — and paste just your instance address.";
  if (code.includes("N8N_NO_URL")) return "Add the address of your n8n instance.";
  if (code.includes("N8N_NO_KEY")) return "Add an API key.";
  if (code.includes("N8N_NO_TENANT")) return "This workspace could not be identified, so nothing was changed.";
  return "That did not save, and nothing was changed. Check the address and the key, then try again.";
}

export function useN8nConnection() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<N8nState>({
    ...EMPTY, loading: true, error: false, canWrite: false, saving: false, writeError: null,
  });

  const load = useCallback(async () => {
    const token = gate.current.begin();
    if (!activeTenantId) {
      setState({ ...EMPTY, loading: false, error: false, canWrite: false, saving: false, writeError: null });
      return;
    }
    const [connection, admin] = await Promise.all([
      supabase.rpc("get_tenant_n8n_connection"),
      // Newer than the generated client types; returns a boolean only.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("is_current_user_tenant_admin"),
    ]);
    if (!gate.current.isCurrent(token)) return;
    if (connection.error) {
      // A failed read is never rendered as "not connected": that would be
      // indistinguishable from a workspace that genuinely has no connection.
      setState({ ...EMPTY, loading: false, error: true, canWrite: false, saving: false, writeError: null });
      return;
    }
    setState({
      ...readConnection(connection.data),
      loading: false,
      error: false,
      canWrite: admin?.error ? false : admin?.data === true,
      saving: false,
      writeError: null,
    });
  }, [activeTenantId]);

  useEffect(() => {
    const activeGate = gate.current;
    if (!tenantLoading) void load();
    return () => activeGate.clear();
  }, [load, tenantLoading]);

  const write = useCallback(async (run: () => Promise<{ error: unknown }>) => {
    // Only the saving flag moves. Raising the first-load flag here would blank
    // the whole surface mid-write.
    setState((prev) => ({ ...prev, saving: true, writeError: null }));
    const { error } = await run();
    if (error) {
      const message = (error as { message?: unknown })?.message;
      setState((prev) => ({ ...prev, saving: false, writeError: n8nWriteMessage(message) }));
      return false;
    }
    await load();
    return true;
  }, [load]);

  /**
   * The key is an argument. It is never placed in this hook's state, never
   * echoed into an error, and never logged.
   */
  const connect = useCallback(
    (draft: N8nDraft) => write(() => supabase.rpc("set_tenant_n8n_connection", {
      _base_url: draft.baseUrl.trim(),
      _api_key: draft.apiKey,
      _label: draft.label.trim() || undefined,
    }) as unknown as Promise<{ error: unknown }>),
    [write],
  );

  const disconnect = useCallback(
    () => write(() => supabase.rpc("clear_tenant_n8n_connection") as unknown as Promise<{ error: unknown }>),
    [write],
  );

  const dismissWriteError = useCallback(() => setState((prev) => ({ ...prev, writeError: null })), []);

  return { ...state, connect, disconnect, reload: load, dismissWriteError };
}
