import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Blocks, RefreshCw, ShieldCheck, Store, TriangleAlert } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
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
  server_url_host?: string | null;
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
    server_url_host: typeof source.server_url_host === "string" ? source.server_url_host : null,
  };
}

type ProviderIdentity = "n8n" | "zapier" | "mcp";

function isZapierMcpHost(host: string | null | undefined) {
  if (!host) return false;
  try {
    return new URL(host).hostname.toLowerCase() === "mcp.zapier.com";
  } catch {
    return false;
  }
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
  provider,
  value,
  action,
}: {
  name: string;
  kind: string;
  provider: ProviderIdentity;
  value: SafeConnectionStatus | null;
  action?: { href: string; label: string } | null;
}) {
  const state = statusPresentation(value);
  const evidence = value?.last_sync_at || value?.last_probed_at;
  const mark = provider === "n8n" ? "n8n" : provider === "zapier" ? "zapier" : "MCP";
  return <article className="ss-card ss-integration-card" data-provider={provider}>
    <header>
      <span className="ss-provider-mark" data-provider-mark={provider} aria-hidden>{mark}</span>
      <div className="ss-integration-title"><h2>{name}</h2><span>{value?.label?.trim() || kind}</span></div>
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
      <div className="ss-integration-actions">
        {action ? <Link className="ss-integration-cta" to={action.href}>{action.label}<ArrowUpRight aria-hidden /></Link> : <span className="ss-integration-handoff">Setup handoff unavailable</span>}
        <span>No credentials or provider payloads shown</span>
      </div>
      <div className="ss-integration-footer"><Truth value={state.truth} /><span>{action ? "Opens a separate established owner" : "No safe Solo configuration handoff is available yet."}</span></div>
    </div>
  </article>;
}

const RECOVERED_SURFACES = [
  { id: "quickbooks", name: "QuickBooks", category: "Financial tools", truth: "PARTIAL" as SettingsTruth, owner: "Integrations", note: "OAuth and financial sync seams exist, but no canonical active-Solo-tenant readiness projection is proven." },
  { id: "stripe", name: "Stripe Connect", category: "Commerce", truth: "PARTIAL" as SettingsTruth, owner: "Marketplace / Storefront", note: "Tenant payout-account records exist. They are not Paige subscription or Billing evidence.", route: "marketplace" as const, action: "Browse Marketplace" },
  { id: "docusign", name: "DocuSign", category: "Documents", truth: "UNAVAILABLE" as SettingsTruth, owner: "Integrations", note: "Legacy admin and signature seams need a tenant-safe governed contract." },
  { id: "apollo", name: "Apollo", category: "Client data", truth: "UNAVAILABLE" as SettingsTruth, owner: "Integrations → Clients", note: "Legacy enrichment configuration is platform-global and cannot establish this workspace’s connection." },
  { id: "plaid", name: "Plaid", category: "Financial tools", truth: "UNAVAILABLE" as SettingsTruth, owner: "Integrations → financial owner", note: "Bank-link scaffolding does not prove tenant-safe readiness." },
  { id: "api", name: "Webhooks & direct API", category: "Developer tools", truth: "UNAVAILABLE" as SettingsTruth, owner: "Integrations", note: "Existing platform webhook and API-key records are not a Solo tenant contract." },
] as const;

function useSoloDestination(slug: "automations" | "marketplace") {
  const { pathname } = useLocation();
  // This preserves route context only. Tenant authority still comes exclusively from
  // useTenantContext and the server-resolved RPCs above; the URL never scopes a read.
  const match = pathname.match(/^(\/solo\/[^/]+)(?:\/|$)/);
  return match ? `${match[1]}/${slug}` : null;
}

export function SoloIntegrationsView() {
  const status = useIntegrationStatus();
  const mcpProvider: ProviderIdentity = isZapierMcpHost(status.mcp?.server_url_host) ? "zapier" : "mcp";
  const automationsHref = useSoloDestination("automations");
  const marketplaceHref = useSoloDestination("marketplace");

  return <div className="ss-integrations">
    <section className="ss-integrations-intro" aria-labelledby="ss-integrations-title">
      <span className="ss-card-icon"><Blocks aria-hidden /></span>
      <div><h2 id="ss-integrations-title">External tools and bridges</h2><p>Tenant-safe status only. Communications setup stays in Connections.</p></div>
      <Truth value="PARTIAL" />
    </section>

    <section className="ss-catalogue" aria-labelledby="ss-catalogue-title">
      <div className="ss-catalogue-heading">
        <div><span>Browse by provider</span><h2 id="ss-catalogue-title">Integration catalogue</h2></div>
        <p>Provider color identifies the tool—not readiness or permission.</p>
      </div>
      <div className="ss-catalogue-scroll" role="region" aria-label="Integration catalogue" tabIndex={0}>
        {status.loading ? <div className="ss-state" role="status"><RefreshCw className="ss-spin" />Clearing and resolving this account…</div>
          : status.error ? <div className="ss-state" role="alert"><TriangleAlert /><span><strong>Couldn’t read integration status</strong>No connection state is being claimed for this account.</span><button type="button" onClick={status.retry}>Retry</button></div>
          : <div className="ss-integration-grid">
            <BridgeCard name="n8n" kind="Automation" provider="n8n" value={status.n8n} action={automationsHref ? { href: automationsHref, label: "Open Automations" } : null} />
            <BridgeCard name={mcpProvider === "zapier" ? "Zapier MCP" : "MCP bridge"} kind="External tool bridge" provider={mcpProvider} value={status.mcp} />
          </div>}

        <section className="ss-recovered" aria-labelledby="ss-recovered-title">
          <div className="ss-recovered-heading">
            <div><span>Version One evidence</span><h2 id="ss-recovered-title">Recovered, not connected</h2></div>
            <p>No tenant connection is claimed</p>
          </div>
          <div className="ss-recovered-grid">
            {RECOVERED_SURFACES.map((surface) => {
              const href = "route" in surface && surface.route === "marketplace" ? marketplaceHref : null;
              return <article key={surface.name} className="ss-recovered-item" data-provider={surface.id}>
                <span className="ss-recovered-mark" aria-hidden>{surface.name.slice(0, 2)}</span>
                <div className="ss-recovered-title"><span>{surface.category}</span><strong>{surface.name}</strong><small>{surface.owner}</small></div>
                <Truth value={surface.truth} />
                <p>{surface.note}</p>
                <div className="ss-recovered-action">
                  {href && "action" in surface ? <Link className="ss-integration-cta" to={href}>{surface.action}<ArrowUpRight aria-hidden /></Link> : <span className="ss-integration-handoff">Setup handoff unavailable</span>}
                </div>
              </article>;
            })}
          </div>
        </section>
      </div>
    </section>

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

