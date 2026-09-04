import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export type N8nReadiness = {
  tenantId: string; canManage: boolean;
  api: { state: string; workflowCount: number | null; lastSuccessAt: string | null };
  mcp: { serverUrl: string | null; state: string; authKind: string | null; oauthReadiness: string; approvedWorkflowCount: number | null; approvedToolCount: number | null; lastSuccessAt: string | null; actionNeeded: string | null };
  attemptState: string | null;
};
export type N8nOAuthLaunch = { launchUrl: string; launchTicket: string; launchProof: string };
export type N8nApprovedWorkflow = { id: string; name: string; approved: boolean };
const safeAddress = (v: unknown): string | null => { try { if (typeof v !== "string") return null; const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash ? u.href : null; } catch { return null; } };
const STATES = new Set(["api_saved", "api_health_failed", "api_connected_zero", "api_connected", "mcp_not_configured", "oauth_needed", "mcp_disabled", "success", "not_connected", "not_configured", "health_failed", "connected", "connected_zero_workflows", "authorization_needed", "consent_in_progress", "connected_no_approved_tools", "connected_approved_tools", "provider_unavailable", "token_expired", "pending_verification", "cancelled", "refused", "expired", "failed"]);
const row = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const state = (v: unknown) => typeof v === "string" && STATES.has(v) ? v : "unavailable";
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 ? Number(v) : null;
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
export function readN8nReadiness(value: unknown, tenantId: string): N8nReadiness | null {
  const r = row(value), a = row(r.api), m = row(r.mcp);
  if (r.tenant_id !== tenantId) return null;
  return { tenantId, canManage: r.can_manage === true,
    api: { state: state(a.state), workflowCount: ["api_connected", "api_connected_zero", "connected", "connected_zero_workflows"].includes(state(a.state)) && typeof a.workflow_count === "number" ? count(a.workflow_count) : null, lastSuccessAt: date(a.last_success_at) },
    mcp: { serverUrl: safeAddress(m.server_url), state: state(m.state), authKind: ["oauth", "bearer", "header"].includes(String(m.auth_kind)) ? String(m.auth_kind) : null,
      oauthReadiness: ["ready", "authorized", "authorization_needed", "consent_in_progress", "unavailable", "expired"].includes(String(m.oauth_readiness)) ? String(m.oauth_readiness) : "unavailable",
      approvedWorkflowCount: count(m.approved_workflow_count), approvedToolCount: count(m.approved_tool_count), lastSuccessAt: date(m.last_success_at),
      actionNeeded: typeof m.action_needed === "string" && /^[a-z_]{1,64}$/.test(m.action_needed) ? m.action_needed : null },
    attemptState: typeof r.attempt_state === "string" && STATES.has(r.attempt_state) ? r.attempt_state : null };
}
export function n8nMcpStateWords(value: string): string {
  const words: Record<string, string> = { mcp_not_configured: "MCP not configured", oauth_needed: "MCP OAuth authorization needed", mcp_disabled: "MCP turned off", not_configured: "MCP not configured", not_connected: "Not connected", authorization_needed: "MCP OAuth authorization needed", consent_in_progress: "OAuth consent in progress", connected_no_approved_tools: "Connected, with no approved workflows or tools", connected_approved_tools: "Connected with explicitly approved tools", connected: "Connected", provider_unavailable: "Provider unavailable", token_expired: "Authorization expired", pending_verification: "Saved, not checked yet", cancelled: "Authorization cancelled", refused: "Authorization refused", expired: "Authorization attempt expired", failed: "Authorization failed" };
  return words[value] ?? "Connection status unavailable";
}
const FAILURE = "The request could not be completed. Check the connection and try again.";
export function useN8nOAuth() {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const scopeKey = `${activeUserId ?? ""}:${activeTenantId ?? ""}:${tenantLoading}`;
  const ownerIdentity = useRef(scopeKey); ownerIdentity.current = scopeKey;
  const [resolvedScope, setResolvedScope] = useState<string | null>(null);
  const identity = useRef(activeTenantId); identity.current = activeTenantId;
  const epoch = useRef(0), mutation = useRef(0), mounted = useRef(true), inFlight = useRef(false);
  const [readiness, setReadiness] = useState<N8nReadiness | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const discoveryId = useRef<string | null>(null);
  const [workflows, setWorkflows] = useState<N8nApprovedWorkflow[] | null>(null);
  const current = useCallback((tenant: string | null, ticket: number) => mounted.current && ownerIdentity.current === scopeKey && identity.current === tenant && epoch.current === ticket, [scopeKey]);
  const reload = useCallback(async () => {
    const ticket = ++epoch.current, tenant = activeTenantId;
    setLoading(true);
    if (!tenant || tenantLoading) { setReadiness(null); setLoading(false); return; }
    try {
      // A server-derived safe evidence summary; credentials are not in this contract.
      const { data, error: failure } = await (supabase.rpc as CallableFunction)("get_n8n_connection_readiness");
      if (!current(tenant, ticket)) return;
      const safe = failure ? null : readN8nReadiness(data, tenant);
      setReadiness(safe); setResolvedScope(scopeKey); setError(safe ? null : "The n8n connection state could not be read.");
    } catch { if (current(tenant, ticket)) { setReadiness(null); setError("The n8n connection state could not be read."); } }
    finally { if (current(tenant, ticket)) setLoading(false); }
  }, [activeTenantId, tenantLoading, current, scopeKey]);
  useEffect(() => {
    const readEpoch = epoch, writeEpoch = mutation;
    mounted.current = true; setReadiness(null); setWorkflows(null); setPreviewName(null); discoveryId.current = null; setBusy(false); inFlight.current = false; setError(null); void reload();
    return () => { mounted.current = false; ++readEpoch.current; ++writeEpoch.current; };
  }, [reload]);
  const request = useCallback(async (action: string, fields: Record<string, unknown> = {}) => {
    const tenant = activeTenantId, ticket = epoch.current;
    if (!tenant || tenantLoading || identity.current !== tenant || ownerIdentity.current !== scopeKey || !mounted.current || !readiness?.canManage || readiness.tenantId !== tenant || busy || inFlight.current) return null;
    const operation = ++mutation.current;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { data, error: failure } = await supabase.functions.invoke("tenant-n8n-oauth", { body: { action, expected_tenant_id: tenant, ...fields } });
      if (!current(tenant, ticket) || mutation.current !== operation) return null;
      const result = row(data);
      if (failure || result.error || result.ok === false) {
        inFlight.current = false; setBusy(false); setWorkflows(null); setPreviewName(null);
        await reload();
        if (mounted.current && ownerIdentity.current === scopeKey && identity.current === tenant) setError(FAILURE);
        return null;
      }
      return result;
    } catch { if (current(tenant, ticket) && mutation.current === operation) setError(FAILURE); return null; }
    finally { if (current(tenant, ticket) && mutation.current === operation) { inFlight.current = false; setBusy(false); } }
  }, [activeTenantId, tenantLoading, readiness, busy, current, reload, scopeKey]);
  const begin = useCallback(async (serverUrl: string): Promise<N8nOAuthLaunch | null> => {
    const tenant = identity.current;
    const result = await request("begin", { server_url: serverUrl.trim() });
    if (!mounted.current || ownerIdentity.current !== scopeKey || identity.current !== tenant) return null;
    if (typeof result?.launch_url !== "string" || typeof result.launch_ticket !== "string" || typeof result.launch_proof !== "string") return null;
    try { const url = new URL(result.launch_url); return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? { launchUrl: url.href, launchTicket: result.launch_ticket, launchProof: result.launch_proof } : null; } catch { return null; }
  }, [request, scopeKey]);
  const perform = useCallback(async (action: string, fields?: Record<string, unknown>) => {
    const tenant = identity.current;
    if (!await request(action, fields) || !mounted.current || ownerIdentity.current !== scopeKey || identity.current !== tenant) return false;
    setWorkflows(null); setPreviewName(null); discoveryId.current = null; await reload(); return true;
  }, [request, reload, scopeKey]);
  const discover = useCallback(async () => {
    const tenant = identity.current;
    const result = await request("discover"); if (!result || !mounted.current || ownerIdentity.current !== scopeKey || identity.current !== tenant) return;
    discoveryId.current = typeof result.discovery_id === "string" ? result.discovery_id : null;
    setWorkflows(Array.isArray(result.workflows) ? result.workflows.flatMap((value: unknown) => {
      const w = row(value); return typeof w.id === "string" && typeof w.name === "string" ? [{ id: w.id, name: w.name.slice(0, 160), approved: w.approved === true }] : [];
    }) : []);
  }, [request, scopeKey]);
  const preview = useCallback(async (workflowId: string) => {
    const tenant = identity.current;
    setPreviewName(null);
    const result = await request("preview", { workflow_id: workflowId });
    if (!result || !mounted.current || ownerIdentity.current !== scopeKey || identity.current !== tenant) return false;
    const workflow = row(result.workflow);
    if (result.executed !== false || workflow.id !== workflowId || workflow.mode !== "read_preview" || typeof workflow.name !== "string") {
      setError("Read access could not be verified. Try checking the connection again."); return false;
    }
    setPreviewName(workflow.name.slice(0, 160)); return true;
  }, [request, scopeKey]);
  const scoped = resolvedScope === scopeKey && readiness?.tenantId === activeTenantId ? readiness : null;
  return { readiness: scoped, loading: loading || tenantLoading || !!activeTenantId && !scoped && !error, busy, error, workflows: scoped ? workflows : null, previewName: scoped ? previewName : null, reload, begin, discover, preview,
    cancel: () => perform("cancel"), verify: () => perform("verify"), disconnect: () => perform("disconnect"), approve: (workflowIds: string[]) => discoveryId.current ? perform("approve", { workflow_ids: workflowIds, discovery_id: discoveryId.current }) : Promise.resolve(false) };
}
