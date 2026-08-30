import { useCallback, useEffect, useRef, useState } from "react";
import { Blocks, Network, RefreshCw, ShieldCheck, Store, TriangleAlert, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate, type SettingsTruth } from "./settings-contract";
import "./settings-integrations.css";

type SafeConnectionStatus = {
  configured?: boolean;
  enabled?: boolean;
  label?: string | null;
  status?: "unconfigured" | "connected" | "error" | string;
  last_sync_at?: string | null;
  last_probed_at?: string | null;
  workflow_count?: number | null;
};

type IntegrationReadState = {
  tenantId: string | null;
  loading: boolean;
  error: boolean;
  n8n: SafeConnectionStatus | null;
  mcp: SafeConnectionStatus | null;
};

function sanitizeSafeConnectionStatus(value: unknown): SafeConnectionStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return {
    configured: typeof source.configured === "boolean" ? source.configured : undefined,
    enabled: typeof source.enabled === "boolean" ? source.enabled : undefined,
    label: typeof source.label === "string" ? source.label : null,
    status: typeof source.status === "string" ? source.status : undefined,
    last_sync_at: typeof source.last_sync_at === "string" ? source.last_sync_at : null,
    last_probed_at: typeof source.last_probed_at === "string" ? source.last_probed_at : null,
    workflow_count: typeof source.workflow_count === "number" ? source.workflow_count : null,
  };
}

function statusPresentation(value: SafeConnectionStatus | null) {
  if (!value?.configured || value.status === "unconfigured") {
    return { truth: "UNAVAILABLE" as SettingsTruth, account: "Not configured", health: "Not measurable", tone: "neutral" };
  }
  if (value.enabled === false) {
    return { truth: "PARTIAL" as SettingsTruth, account: "Turned off", health: "Paused", tone: "warn" };
  }
  if (value.status === "error") {
    return { truth: "PARTIAL" as SettingsTruth, account: "Configured", health: "Needs attention", tone: "bad" };
  }
  if (value.status === "connected") {
    return { truth: "LIVE" as SettingsTruth, account: "Connected", health: "Available", tone: "ok" };
  }
  return { truth: "PARTIAL" as SettingsTruth, account: "Configured", health: "Status not reported", tone: "neutral" };
}

function useIntegrationStatus() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<IntegrationReadState>({ tenantId: null, loading: true, error: false, n8n: null, mcp: null });

  const load = useCallback(async () => {
    const token = gate.current.begin();
    setState({ tenantId: null, loading: true, error: false, n8n: null, mcp: null });
    if (!activeTenantId) {
      setState({ tenantId: null, loading: false, error: false, n8n: null, mcp: null });
      return;
    }
    const [n8nResult, mcpResult] = await Promise.all([
      supabase.rpc("get_tenant_n8n_connection"),
      // This safe getter is newer than the generated client types. It returns status only;
      // its secret-bearing counterpart is never callable from this browser surface.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_tenant_mcp_connection"),
    ]);
    if (!gate.current.isCurrent(token)) return;
    const failed = Boolean(n8nResult.error || mcpResult.error);
    setState({
      tenantId: activeTenantId,
      loading: false,
      error: failed,
      n8n: failed ? null : sanitizeSafeConnectionStatus(n8nResult.data),
      mcp: failed ? null : sanitizeSafeConnectionStatus(mcpResult.data),
    });
  }, [activeTenantId]);

  useEffect(() => {
    const activeGate = gate.current;
    if (!tenantLoading) void load();
    return () => activeGate.clear();
  }, [load, tenantLoading]);

  return {
    ...state,
    loading: tenantLoading || state.loading || Boolean(activeTenantId && state.tenantId !== activeTenantId),
    retry: load,
  };
}

function Truth({ value, capability = false }: { value: SettingsTruth; capability?: boolean }) {
  return <span className="ss-truth" data-truth={value}>{capability ? `Capability: ${value}` : value}</span>;
}

function BridgeCard({
  name,
  kind,
  icon: Icon,
  value,
}: {
  name: string;
  kind: string;
  icon: typeof Workflow;
  value: SafeConnectionStatus | null;
}) {
  const state = statusPresentation(value);
  const evidence = value?.last_sync_at || value?.last_probed_at;
  return <article className="ss-card ss-integration-card">
    <header>
      <span className="ss-card-icon"><Icon aria-hidden /></span>
      <div className="ss-integration-title"><h2>{value?.label?.trim() || name}</h2><span>{kind}</span></div>
      <Truth value="LIVE" capability />
    </header>
    <div className="ss-card-body">
      <dl className="ss-integration-state">
        <div><dt>Workspace configuration</dt><dd>{state.account}</dd></div>
        <div><dt>Operational health</dt><dd><span className="ss-status" data-tone={state.tone}><i />{state.health}</span></dd></div>
      </dl>
      <div className="ss-integration-evidence">
        <span>Latest safe evidence</span>
        <strong>{evidence ? "Recorded by the provider bridge" : "Not reported"}</strong>
      </div>
      {typeof value?.workflow_count === "number" && <p className="ss-note">{value.workflow_count} workflow {value.workflow_count === 1 ? "record" : "records"} reported. This is not a run or success claim.</p>}
      <div className="ss-integration-footer"><Truth value={state.truth} /><span>No credentials or provider payloads shown</span></div>
    </div>
  </article>;
}

export function SoloIntegrationsView() {
  const status = useIntegrationStatus();

  return <div className="ss-integrations">
    <section className="ss-integrations-intro" aria-labelledby="ss-integrations-title">
      <span className="ss-card-icon"><Blocks aria-hidden /></span>
      <div><h2 id="ss-integrations-title">External tools and bridges</h2><p>Tenant-safe status only. Communications setup stays in Connections.</p></div>
      <Truth value="PARTIAL" />
    </section>

    {status.loading ? <div className="ss-state" role="status"><RefreshCw className="ss-spin" />Clearing and resolving this account…</div>
      : status.error ? <div className="ss-state" role="alert"><TriangleAlert /><span><strong>Couldn’t read integration status</strong>No connection state is being claimed for this account.</span><button type="button" onClick={status.retry}>Retry</button></div>
      : <div className="ss-integration-grid">
        <BridgeCard name="n8n" kind="Workflow bridge" icon={Workflow} value={status.n8n} />
        <BridgeCard name="MCP / Zapier" kind="External tool bridge" icon={Network} value={status.mcp} />
      </div>}

    <div className="ss-integration-grid ss-integration-supporting">
      <section className="ss-card">
        <header><span className="ss-card-icon"><Store aria-hidden /></span><h2>Marketplace handoff</h2><Truth value="UNAVAILABLE" /></header>
        <div className="ss-card-body"><p>Marketplace owns capability discovery and installation. A tenant-safe installed-capability handoff is not available from Settings yet, so this page does not infer products or entitlement from catalog fixtures.</p></div>
      </section>
      <section className="ss-card">
        <header><span className="ss-card-icon"><ShieldCheck aria-hidden /></span><h2>Permissions and governed actions</h2><Truth value="UNAVAILABLE" /></header>
        <div className="ss-card-body"><p>Connection permissions, revocation, and PAIGE actions appear only when an authoritative tenant-safe contract supports them. Any future action must use the existing Action Bus and Trust Compass controls.</p><p className="ss-note">No raw payloads, credentials, messages, prompts, hidden reasoning, or silent execution are exposed here.</p></div>
      </section>
    </div>
  </div>;
}
