/** Tenant-scoped API readiness. Credentials are sent only to the authenticated
 * save-and-validate action; only its bounded summary enters React state. */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";

export type N8nHealth = "not_configured" | "saved_unverified" | "checking" | "connected" | "needs_attention";
export type N8nFailure = "authentication_rejected" | "request_refused" | "endpoint_not_found" | "provider_unavailable" | "response_invalid" | "inventory_incomplete" | "address_rejected" | "validation_expired";
export type N8nConnection = {
  tenantId: string;
  canWrite: boolean;
  configured: boolean;
  label: string | null;
  baseUrl: string | null;
  health: N8nHealth;
  failureCode: N8nFailure | null;
  workflowCount: number | null;
  checkedAt: string | null;
  lastSuccessAt: string | null;
};
export type N8nState = N8nConnection & { loading: boolean; error: boolean; saving: boolean; writeError: string | null };
export type N8nDraft = { baseUrl: string; apiKey: string; label: string };
const EMPTY: N8nConnection = { tenantId: "", canWrite: false, configured: false, label: null, baseUrl: null, health: "not_configured", failureCode: null, workflowCount: null, checkedAt: null, lastSuccessAt: null };
const withoutProof = (value: N8nConnection, health: N8nHealth): N8nConnection => ({ ...value, health, failureCode: null, workflowCount: null, checkedAt: null, lastSuccessAt: null });
const HEALTH = new Set<N8nHealth>(["not_configured", "saved_unverified", "checking", "connected", "needs_attention"]);
const FAILURES = new Set<N8nFailure>(["authentication_rejected", "request_refused", "endpoint_not_found", "provider_unavailable", "response_invalid", "inventory_incomplete", "address_rejected", "validation_expired"]);
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

/** A tenant mismatch or malformed summary is unavailable, never an empty connection. */
export function readN8nReadiness(value: unknown, expectedTenantId: string): N8nConnection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.tenant_id !== expectedTenantId || typeof row.configured !== "boolean" || typeof row.can_write !== "boolean" || !HEALTH.has(row.health as N8nHealth)) return null;
  const health = row.health as N8nHealth;
  if (row.configured === (health === "not_configured")) return null;
  const checkedAt = date(row.checked_at), lastSuccessAt = date(row.last_success_at);
  // Green requires the successful-check provenance, never an old stored status.
  if (health === "connected" && (!checkedAt || !lastSuccessAt || Date.parse(checkedAt) !== Date.parse(lastSuccessAt) || row.failure_code !== null || typeof row.workflow_count !== "number" || !Number.isSafeInteger(row.workflow_count) || row.workflow_count < 0)) return null;
  return {
    tenantId: expectedTenantId, canWrite: row.can_write, configured: row.configured,
    label: typeof row.label === "string" && row.label.trim() ? row.label : null,
    baseUrl: typeof row.base_url === "string" && row.base_url.trim() ? row.base_url : null,
    health, failureCode: FAILURES.has(row.failure_code as N8nFailure) ? row.failure_code as N8nFailure : null,
    workflowCount: health === "connected" && typeof row.workflow_count === "number" && Number.isSafeInteger(row.workflow_count) && row.workflow_count >= 0 ? row.workflow_count : null,
    checkedAt, lastSuccessAt,
  };
}

export function n8nWriteMessage(code: unknown): string {
  if (code === "forbidden") return "Only a workspace admin can change this connection.";
  if (code === "unauthorized") return "Sign in again, then refresh this connection's status.";
  if (code === "tenant_changed") return "This workspace changed. Refresh its connection status before trying again.";
  if (code === "not_configured") return "Save an n8n API connection before checking it.";
  if (code === "validation_busy") return "A connection check is already in progress. Refresh its status shortly.";
  return "We could not confirm the result. Refresh the connection status before trying again; your changes may have been saved.";
}

async function safeErrorCode(data: unknown, error: unknown): Promise<unknown> {
  const code = (value: unknown) => value && typeof value === "object" ? (value as Record<string, unknown>).error : null;
  if (code(data)) return code(data);
  // The function uses HTTP errors for refusals. Read only its bounded code,
  // never the SDK message, response text, provider payload, or stack.
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  try { return typeof context?.json === "function" ? code(await context.json()) : null; } catch { return null; }
}

export function useN8nConnection() {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const scope = `${activeUserId ?? ""}:${activeTenantId ?? ""}:${tenantLoading}`;
  const scopeRef = useRef(scope), mounted = useRef(false), mutation = useRef(0), pendingMutation = useRef(false), pendingCheck = useRef(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  if (scopeRef.current !== scope) { scopeRef.current = scope; gate.current.clear(); mutation.current += 1; pendingMutation.current = false; pendingCheck.current = false; }
  const [state, setState] = useState<N8nState>({ ...EMPTY, loading: true, error: false, saving: false, writeError: null });

  const load = useCallback(async () => {
    if (!mounted.current || scopeRef.current !== scope) return;
    const token = gate.current.begin();
    if (!activeTenantId || tenantLoading) { setState({ ...EMPTY, loading: false, error: false, saving: false, writeError: null }); return; }
    // This additive RPC is newer than the generated client types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await Promise.resolve((supabase as any).rpc("get_tenant_n8n_api_readiness")).catch(() => ({ data: null, error: true }));
    if (!mounted.current || scopeRef.current !== scope || !gate.current.isCurrent(token)) return;
    setLoadedScope(scope);
    const connection = !result || result.error ? null : readN8nReadiness(result.data, activeTenantId);
    setState({ ...(connection && pendingCheck.current ? withoutProof(connection, "checking") : connection ?? EMPTY), loading: false, error: !connection, saving: pendingMutation.current, writeError: null });
  }, [activeTenantId, scope, tenantLoading]);

  useEffect(() => { mounted.current = true; const activeGate = gate.current; if (!tenantLoading) void load(); return () => { mounted.current = false; mutation.current += 1; pendingMutation.current = false; pendingCheck.current = false; activeGate.clear(); }; }, [load, tenantLoading]);

  // A reopened in-progress check finishes without requiring a manual status read.
  useEffect(() => {
    if (state.health !== "checking" || state.saving || state.error) return;
    let reads = 0;
    const timer = setInterval(() => { if (++reads >= 16) clearInterval(timer); void load(); }, 2000);
    return () => clearInterval(timer);
  }, [state.health, state.saving, state.error, load]);

  const write = useCallback(async (action: "save" | "validate" | "disconnect", draft?: N8nDraft) => {
    if (!activeTenantId || tenantLoading || !mounted.current || scopeRef.current !== scope || loadedScope !== scope || !state.canWrite || pendingMutation.current) return false;
    pendingMutation.current = true;
    const checkingConnection = action !== "disconnect";
    pendingCheck.current = checkingConnection;
    const request = ++mutation.current;
    gate.current.clear();
    const current = () => mounted.current && scopeRef.current === scope && mutation.current === request;
    setState(prev => ({ ...prev, ...(checkingConnection ? withoutProof(prev, "checking") : {}), saving: true, writeError: null }));
    try {
      const body = { action, expected_tenant_id: activeTenantId, ...(draft ? { base_url: draft.baseUrl.trim(), api_key: draft.apiKey, label: draft.label.trim() || undefined } : {}) };
      const { data, error } = await supabase.functions.invoke("tenant-n8n-api-connect", { body });
      if (!current()) return false;
      if (error || data?.ok !== true) {
        const code = await safeErrorCode(data, error);
        if (current()) setState(prev => ({ ...prev, ...(checkingConnection ? withoutProof(prev, prev.configured ? "saved_unverified" : "not_configured") : {}), saving: false, error: true, writeError: n8nWriteMessage(code) }));
        return false;
      }
      const connection = readN8nReadiness(data.connection, activeTenantId);
      const completed = connection && (action === "disconnect" ? data.outcome === "disconnected" && !connection.configured : (data.outcome === "connected" && connection.health === "connected") || (data.outcome === "needs_attention" && connection.health === "needs_attention"));
      if (!connection || !completed || (action === "save" && data.saved !== true)) {
        if (connection && data.outcome === "stale") setState(prev => ({ ...prev, ...connection, loading: false, error: false, saving: false, writeError: "This connection changed while it was being checked. Review its current status before trying again." }));
        else setState(prev => ({ ...prev, ...(checkingConnection ? withoutProof(prev, prev.configured ? "saved_unverified" : "not_configured") : {}), saving: false, error: true, writeError: n8nWriteMessage(null) }));
        return false;
      }
      // Invalidate reads started while this write was pending; they cannot
      // replace its newer persisted readiness with an older snapshot.
      gate.current.clear();
      setState({ ...connection, loading: false, error: false, saving: false, writeError: null });
      return true; // A persisted refusal completes save; it is not healthy success.
    } catch {
      if (current()) setState(prev => ({ ...prev, ...(checkingConnection ? withoutProof(prev, prev.configured ? "saved_unverified" : "not_configured") : {}), saving: false, error: true, writeError: n8nWriteMessage(null) }));
      return false;
    } finally { if (current()) { gate.current.clear(); pendingMutation.current = false; pendingCheck.current = false; setState(prev => ({ ...prev, saving: false })); } }
  }, [activeTenantId, tenantLoading, scope, loadedScope, state.canWrite]);

  const connect = useCallback((draft: N8nDraft) => write("save", draft), [write]);
  const validate = useCallback(() => write("validate"), [write]);
  const disconnect = useCallback(() => write("disconnect"), [write]);
  const dismissWriteError = useCallback(() => setState(prev => ({ ...prev, writeError: null })), []);
  const visible = loadedScope === scope && !tenantLoading ? state : { ...EMPTY, loading: !!activeTenantId || tenantLoading, error: false, saving: false, writeError: null };
  return { ...visible, connect, validate, disconnect, reload: load, dismissWriteError };
}
