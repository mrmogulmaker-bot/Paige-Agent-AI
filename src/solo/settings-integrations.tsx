import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Link2Off, Plug, RefreshCw, TriangleAlert, Workflow, X, Zap } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SoloAutomationsView } from "./settings-automations";
import { useN8nConnection } from "./data/useN8nConnection";
import { useMcpConnection } from "./data/useMcpConnection";
import { useMcpCapabilities } from "./data/useMcpCapabilities";
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
  scopeKey: string | null;
  apiError: boolean;
  mcpError: boolean;
  tenantId: string | null;
  loading: boolean;
  error: boolean;
  /** The shipped n8n API-key connection. Separate from n8n's MCP endpoint. */
  n8n: SafeConnectionStatus | null;
  /**
   * MCP connections keyed by provider. The registry is provider-scoped: one
   * workspace may hold an n8n MCP endpoint AND a Zapier one at the same time,
   * so a single `mcp` slot can no longer represent it.
   */
  mcp: Partial<Record<"n8n" | "zapier", SafeConnectionStatus>>;
};

/**
 * Whitelists what may cross into the surface. `last_error` and any raw payload
 * are deliberately absent: provider error text is unbounded external content.
 */
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

/**
 * The provider-scoped getter returns `{ n8n: {...}, zapier: {...} }`. Each entry
 * goes through the same field whitelist as a single connection, so `last_error`
 * and any provider payload stay out of the browser exactly as before.
 */
function sanitizeMcpByProvider(value: unknown): Partial<Record<"n8n" | "zapier", SafeConnectionStatus>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Partial<Record<"n8n" | "zapier", SafeConnectionStatus>> = {};
  for (const provider of ["n8n", "zapier"] as const) {
    const entry = sanitizeSafeConnectionStatus(source[provider]);
    if (entry) out[provider] = entry;
  }
  return out;
}

type ProviderIdentity = "n8n" | "zapier" | "mcp" | "quickbooks" | "stripe" | "docusign" | "apollo" | "plaid" | "api";
type CatalogueCategory = "all" | "automation" | "financial" | "documents" | "client-data" | "developer";

const CATALOGUE_FILTERS: ReadonlyArray<{ id: CatalogueCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "automation", label: "Automation" },
  { id: "financial", label: "Financial" },
  { id: "documents", label: "Documents" },
  { id: "client-data", label: "Client data" },
  { id: "developer", label: "Developer" },
];

function statusPresentation(value: SafeConnectionStatus | null) {
  if (!value?.configured || value.status === "unconfigured") {
    return { truth: "UNAVAILABLE" as SettingsTruth, account: "Not connected", tone: "neutral" };
  }
  if (value.enabled === false) return { truth: "PARTIAL" as SettingsTruth, account: "Turned off", tone: "warn" };
  if (value.status === "error") return { truth: "PARTIAL" as SettingsTruth, account: "Needs attention", tone: "bad" };
  if (value.status === "connected") return { truth: "LIVE" as SettingsTruth, account: "Connected", tone: "ok" };
  // Anything else means it exists but has not been proven to work — for a granted
  // connection, that the consent completed but the check has not. It is never rendered
  // as connected, and never as a status code the reader has to interpret.
  return { truth: "PARTIAL" as SettingsTruth, account: "Setup not finished", tone: "neutral" };
}

function useIntegrationStatus() {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const scopeKey = `${activeUserId ?? ""}:${activeTenantId ?? ""}:${tenantLoading}`;
  const gate = useRef(createSettingsRequestGate());
  const identity = useRef(scopeKey); identity.current = scopeKey;
  const mounted = useRef(false);
  const [state, setState] = useState<IntegrationReadState>({ scopeKey: null, tenantId: null, loading: true, error: false, apiError: false, mcpError: false, n8n: null, mcp: {} });
  const load = useCallback(async () => {
    if (!mounted.current || identity.current !== scopeKey || tenantLoading) return;
    const token = gate.current.begin();
    setState({ scopeKey: null, tenantId: null, loading: true, error: false, apiError: false, mcpError: false, n8n: null, mcp: {} });
    if (!activeTenantId) { setState({ scopeKey, tenantId: null, loading: false, error: false, apiError: true, mcpError: true, n8n: null, mcp: {} }); return; }
    const results = await Promise.allSettled([
      supabase.rpc("get_tenant_n8n_connection"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_tenant_mcp_connections"),
    ]);
    if (!gate.current.isCurrent(token) || identity.current !== scopeKey || !mounted.current) return;
    const api = results[0].status === "fulfilled" ? results[0].value : null;
    const mcp = results[1].status === "fulfilled" ? results[1].value : null;
    const apiError = !api || !!api.error || !api.data || typeof api.data !== "object" || Array.isArray(api.data);
    const mcpError = !mcp || !!mcp.error || !mcp.data || typeof mcp.data !== "object" || Array.isArray(mcp.data);
    setState({ scopeKey, tenantId: activeTenantId, loading: false, error: apiError || mcpError, apiError, mcpError,
      n8n: apiError ? null : sanitizeSafeConnectionStatus(api.data), mcp: mcpError ? {} : sanitizeMcpByProvider(mcp.data) });
  }, [activeTenantId, scopeKey, tenantLoading]);
  useEffect(() => { const activeGate = gate.current; mounted.current = true; if (!tenantLoading) void load(); return () => { mounted.current = false; activeGate.clear(); }; }, [load, tenantLoading]);
  return { ...state, loading: tenantLoading || state.loading || state.scopeKey !== scopeKey, retry: load };
}

/* ── The catalogue ────────────────────────────────────────────────────────────
   One row per provider. `connectable` is the whole product rule: a card either
   owns a real, tenant-safe connection contract for that exact provider, or it
   says so plainly. It never points at another surface. */

type ProviderRow = {
  id: ProviderIdentity;
  name: string;
  kind: string;
  filter: Exclude<CatalogueCategory, "all">;
  /** Only true where an audited, tenant-scoped connection seam exists today. */
  connectable: boolean;
  /** Why the connection cannot be offered yet. Shown in the panel, not the card. */
  note: string;
};

const PROVIDERS: ReadonlyArray<ProviderRow> = [
  { id: "n8n", name: "n8n", kind: "Automation", filter: "automation", connectable: true,
    note: "" },
  // Connectable through an authorization grant rather than a pasted credential, so the
  // panel offers consent instead of a form. The card's label is CD's to set; this row
  // only changes whether the connection can be made.
  // The Zapier slot. It can only ever hold Zapier: the setter writes that provider and
  // that endpoint, and the registry's CHECK refuses a Zapier row that is not OAuth. So
  // the card is named for what it is rather than for the protocol underneath it.
  { id: "mcp", name: "Zapier", kind: "MCP connection", filter: "developer", connectable: true,
    note: "" },
  { id: "quickbooks", name: "QuickBooks", kind: "Financial tools", filter: "financial", connectable: false,
    note: "The sync seams exist, but nothing yet proves a connection belongs to this workspace, so no setup is offered." },
  { id: "stripe", name: "Stripe Connect", kind: "Commerce", filter: "financial", connectable: false,
    note: "Payout records exist at the platform level. They do not show that this workspace is connected, so nothing is claimed." },
  { id: "docusign", name: "DocuSign", kind: "Documents", filter: "documents", connectable: false,
    note: "The signature seams are older than the tenant-safe rules this surface follows, so setup is not offered yet." },
  { id: "apollo", name: "Apollo", kind: "Client data", filter: "client-data", connectable: false,
    note: "Enrichment settings are shared platform-wide, which cannot establish a connection for this workspace on its own." },
  { id: "plaid", name: "Plaid", kind: "Financial tools", filter: "financial", connectable: false,
    note: "Bank-link scaffolding exists but does not amount to a connection this workspace owns." },
  { id: "api", name: "Webhooks & direct API", kind: "Developer tools", filter: "developer", connectable: false,
    note: "Platform webhook and key records are not the same thing as a connection for this workspace." },
];

function providerMark(id: ProviderIdentity) {
  if (id === "n8n") return "n8n";
  if (id === "mcp") return "zap";
  return id.slice(0, 2).toUpperCase();
}

/* ── n8n: the one provider with a real connection flow ────────────────────── */

function N8nPanelBody({ a, onDirtyChange, onChanged }: { a: ReturnType<typeof useN8nConnection>; onDirtyChange: (dirty: boolean) => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const commit = useCallback(async (run: () => Promise<boolean>) => {
    const ok = await run();
    if (alive.current && ok) onChanged();
    return alive.current && ok;
  }, [onChanged]);
  return <>
    <p className="ig-lede">Let Paige see the n8n workspace and its available workflows.</p>
    {a.loading ? <p className="ig-state" role="status">Checking the API connection…</p> : a.error ? <div className="ig-state" role="alert"><span>The API connection could not be read. Its status and workflow count are unavailable.</span><button type="button" className="ig-btn" onClick={() => void a.reload()}>Try again</button></div> : <>
      {!editing && <>
        <dl className="ig-facts">
          <div><dt>API connection</dt><dd>{!a.configured ? "Not connected" : "Needs attention"}</dd></div>
          <div><dt>Workflow visibility</dt><dd>{a.configured ? "Unavailable until health is verified for this saved configuration" : "Not connected"}</dd></div>
          {a.baseUrl && <div><dt>Instance address</dt><dd className="ig-mono">{a.baseUrl}</dd></div>}
          {a.configured && <div><dt>API key</dt><dd>Stored</dd></div>}
          {a.lastSyncAt && <div><dt>Recorded check</dt><dd>{safeCheckDate(a.lastSyncAt)} — may predate the saved configuration</dd></div>}
        </dl>
        {a.configured && <p className="ig-note">{a.status === "error" ? "The API connection is saved, but its recorded health check failed. The workflow count is unavailable." : "The API connection is saved; health has not been verified for this saved configuration."} This does not describe Paige tools access.</p>}
      </>}
      {a.writeError && <p className="ig-error" role="alert">{a.writeError}</p>}
      {!a.canWrite && <p className="ig-note">Only a workspace admin can change this connection. You can see its state here.</p>}
      {editing && a.canWrite ? <N8nForm a={a} existing={a.configured} onDirtyChange={onDirtyChange} onCommit={commit} onDone={() => { setEditing(false); onDirtyChange(false); }} /> : <div className="ig-actions">
        {a.canWrite && <><button type="button" className="ig-btn" data-primary disabled={a.saving} onClick={() => setEditing(true)}>{!a.configured ? "Connect API" : a.status === "error" ? "Reconnect API" : "Edit API connection"}</button>{a.configured && <button type="button" className="ig-btn" disabled={a.saving} onClick={() => setConfirmingDisconnect(true)}>Disconnect API</button>}</>}
        <button type="button" className="ig-btn" disabled={a.saving} onClick={() => void a.reload()}>Refresh status</button>
      </div>}
      {confirmingDisconnect && <div className="ig-confirm-close" role="alertdialog" aria-label="Confirm API disconnect"><p>Disconnect the API connection? Paige tools access will stay unchanged.</p><div className="ig-actions"><button type="button" className="ig-btn" data-danger autoFocus disabled={a.saving} onClick={() => { setConfirmingDisconnect(false); void commit(a.disconnect); }}>Confirm disconnect</button><button type="button" className="ig-btn" onClick={() => setConfirmingDisconnect(false)}>Keep connection</button></div></div>}
    </>}
  </>;
}

function safeCheckDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Time unavailable";
}

/* ── What Paige may actually run ───────────────────────────────────────────
   A connection is reachability. This is authority, and it is a separate act on
   purpose: a workspace that connected a provider has not thereby agreed that
   Paige may do everything on it. Nothing is approved until somebody says so
   here, and until then every call is refused. */

function CapabilityApproval({ provider }: { provider: "n8n" | "zapier" }) {
  const { activeTenantId } = useTenantContext();
  const caps = useMcpCapabilities(provider);
  const [chosen, setChosen] = useState<string[] | null>(null);

  // The unsaved draft belongs to the workspace it was made in. Resetting the hook's tool
  // list was not enough: this state lives in the parent, so an admin who ticked boxes for
  // one workspace, switched to another with the drawer open, and loaded ITS tools would
  // find the draft still overriding what the second workspace has actually approved —
  // matching names arriving pre-ticked and approvable on the strength of a decision made
  // somewhere else.
  useEffect(() => { setChosen(null); }, [activeTenantId]);

  // The list on screen is the source of the choice until it is saved; before that,
  // what is ticked is whatever the server said is approved.
  const selection = chosen ?? (caps.tools ?? []).filter((t) => t.approved).map((t) => t.name);
  const dirty = chosen !== null
    && JSON.stringify([...chosen].sort()) !== JSON.stringify((caps.tools ?? []).filter((t) => t.approved).map((t) => t.name).sort());

  const toggle = (name: string) =>
    setChosen(selection.includes(name) ? selection.filter((n) => n !== name) : [...selection, name]);

  return <div className="ig-caps">
    <h4>What Paige may run</h4>

    {caps.tools === null && !caps.loading && <>
      <p className="ig-lede">
        Nothing is approved yet, so Paige will not run anything here. Load the list to choose what she may do.
      </p>
      <div className="ig-actions">
        <button type="button" className="ig-btn" onClick={() => void caps.discover()}>
          <RefreshCw aria-hidden size={14} />See what is available
        </button>
      </div>
    </>}

    {caps.loading && <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Asking the provider…</p>}

    {caps.error && <p className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} />{caps.error}</p>}

    {caps.tools !== null && caps.tools.length === 0 && !caps.loading &&
      <p className="ig-note">The provider offers nothing this workspace can run.</p>}

    {caps.tools !== null && caps.tools.length > 0 && <>
      <ul className="ig-caplist">
        {caps.tools.map((tool) => {
          const on = selection.includes(tool.name);
          return <li key={tool.name}>
            <button type="button" aria-pressed={on} onClick={() => toggle(tool.name)} disabled={caps.saving}>
              <span className="ig-cap-name">{tool.name}</span>
              {/* The provider wrote this. It is shown to a person deciding, and never
                  travels on the path that reaches a model, where provider prose is an
                  instruction surface rather than a description. */}
              {tool.description && <span className="ig-cap-desc">{tool.description}</span>}
            </button>
          </li>;
        })}
      </ul>
      <p className="ig-note">
        Approving records the exact shape of each action as it is today. If the provider changes one,
        Paige stops running it until you approve it again.
      </p>
      <div className="ig-actions">
        <button type="button" className="ig-btn" data-primary disabled={!dirty || caps.saving}
          onClick={() => void caps.approve(selection).then((ok) => { if (ok) setChosen(null); })}>
          {caps.saving ? "Saving…" : `Approve ${selection.length} of ${caps.tools.length}`}
        </button>
        {dirty && <button type="button" className="ig-btn" onClick={() => setChosen(null)} disabled={caps.saving}>Cancel</button>}
      </div>
    </>}
  </div>;
}

/* ── Zapier: connected by consent, never by a pasted credential ────────────
   Zapier runs an authorization server, so a workspace grants access instead of
   handing over a key. There is no form here on purpose: nothing this surface
   could collect would be a credential worth having, and asking for one would
   invite somebody to paste a long-lived token that cannot be rotated. */

function ZapierPanelBody({ onChanged }: { onChanged: () => void }) {
  const { activeTenantId } = useTenantContext();
  const m = useMcpConnection("zapier");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [label, setLabel] = useState("");

  // The address is cleared on save whether or not the probe succeeded: it has been stored
  // either way, and leaving a secret-bearing URL sitting in a field after it is no longer
  // needed is one more place for it to be seen or captured.
  const save = useCallback(async () => {
    const ok = await m.connectByUrl(serverUrl, label);
    setServerUrl("");
    onChanged();
    return ok;
  }, [m, serverUrl, label, onChanged]);

  const begin = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    // Starting a grant is a write too: it registers a single-use flow against a workspace.
    // Sent for the same reason as every other call here — the server resolves the tenant
    // and this only lets it refuse if the person has since moved somewhere else.
    const { data, error } = await supabase.functions.invoke("tenant-mcp-connect", {
      body: { provider: "zapier", expected_tenant_id: activeTenantId, action: "oauth_begin" },
    });
    const url = (data as { authorize_url?: string })?.authorize_url;
    if (error || !url) {
      setStarting(false);
      setStartError("Zapier could not be reached to start the connection. Try again in a moment.");
      return;
    }
    // A full navigation, not a popup: consent belongs in the address bar where the
    // person can see whose sign-in page they are on.
    window.location.assign(url);
  }, [activeTenantId]);

  if (m.loading) return <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Checking this workspace…</p>;

  if (m.error) {
    return <div className="ig-state" role="alert">
      <TriangleAlert aria-hidden />
      <span>The connection could not be read, so nothing is being claimed either way.</span>
      <button type="button" className="ig-btn" onClick={() => void m.reload()}>Try again</button>
    </div>;
  }

  return <>
    {m.configured && <dl className="ig-facts">
      <div><dt>State</dt><dd>{mcpStateWords(m.status)}</dd></div>
      {/* The address is deliberately not shown here. For Zapier it is always the same
          endpoint, so it tells an owner nothing they need — and any label for it either
          reads as a claim that the connection is live ("Connected to …") or is a
          technical detail this card exists to keep off the screen. The state row above
          is the one honest answer, and it is the probe's, not the grant's. */}
      <div><dt>Access</dt><dd>{m.authKind === "url"
        ? "The address you saved. Stored encrypted and never shown again."
        : "Granted by you on Zapier. No key is stored here."}</dd></div>
    </dl>}

    {!m.configured && <p className="ig-lede">
      Paste the MCP server address from your Zapier account. Zapier gives each account its own address,
      and that address is what authorises the connection, so it is stored encrypted and is never shown
      again after you save it.
    </p>}

    {m.canWrite && <div className="ig-form">
      <label className="ig-field">
        <span>Server address</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          placeholder="https://mcp.zapier.com/api/mcp/s/…"
          disabled={m.saving}
        />
        <small>From Zapier, under your MCP server. It has to be on mcp.zapier.com.</small>
      </label>
      <label className="ig-field">
        <span>Name <em>optional</em></span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What you call this account"
          disabled={m.saving}
        />
      </label>
      <div className="ig-actions">
        <button type="button" className="ig-btn" data-primary
          disabled={m.saving || serverUrl.trim() === ""}
          onClick={() => void save()}>
          <Plug aria-hidden size={14} />
          {m.saving ? "Connecting…" : m.configured ? "Replace the address" : "Connect Zapier"}
        </button>
      </div>
    </div>}

    {/* Approving the connection and approving what Paige may RUN are separate acts, and
        a workspace that has done only the first should know the second is still owed. */}
    {m.configured && <p className="ig-note">
      Connecting lets Paige see what is available. She runs nothing until you approve the specific
      actions you want her to be able to take.
    </p>}

    {/* Only once the connection is PROVEN. Offering an approval list against a connection
        that does not work would show a list that cannot be loaded, or worse, record
        approvals for a provider we have never successfully reached. */}
    {m.configured && m.status === "connected" && m.canWrite && <CapabilityApproval provider="zapier" />}

    {(startError || m.writeError) && <p className="ig-error" role="alert">
      <TriangleAlert aria-hidden size={14} />{startError ?? m.writeError}
    </p>}

    {!m.canWrite
      ? <p className="ig-note">Only a workspace admin can change this connection. You can see its state here.</p>
      : <div className="ig-actions">
          {/* The grant path is kept rather than removed: a workspace already connected that
              way keeps working, and an account whose Zapier offers sign-in can still use it.
              It is no longer the primary act, because it is not the shape Zapier hands most
              people. */}
          <button type="button" className="ig-btn" disabled={starting || m.saving} onClick={() => void begin()}>
            <KeyRound aria-hidden size={14} />
            {starting ? "Opening Zapier…" : "Use Zapier sign-in instead"}
          </button>
          {m.configured && <button type="button" className="ig-btn" disabled={m.saving}
            onClick={() => void m.verify().then(onChanged)}>
            <RefreshCw aria-hidden size={14} />{m.saving ? "Checking…" : "Check it again"}
          </button>}
          {m.configured && (confirmingDisconnect ? <span className="ig-confirm">
            <button type="button" className="ig-btn" data-danger disabled={m.saving}
              onClick={() => { setConfirmingDisconnect(false); void m.disconnect().then(onChanged); }}>
              Disconnect it
            </button>
            <button type="button" className="ig-btn" onClick={() => setConfirmingDisconnect(false)}>Keep it</button>
          </span> : <button type="button" className="ig-btn" disabled={m.saving} onClick={() => setConfirmingDisconnect(true)}>
            <Link2Off aria-hidden size={14} />Disconnect
          </button>)}
        </div>}
  </>;
}

/* ── n8n's tool bridge: the same provider, a second connection ─────────────
   An n8n workspace can expose an MCP endpoint as well as its REST API, and the
   two are independent: one can work while the other does not. They live in the
   same drawer because they belong to the same provider, and in separate
   sections because connecting one says nothing about the other. */

const N8N_OAUTH_UNAVAILABLE = "OAuth setup is temporarily unavailable while the secure connection path is being completed.";

function n8nApiSummary(value: SafeConnectionStatus | null, loading: boolean, error: boolean) {
  if (loading) return { account: "Checking…", tone: "neutral" };
  if (error || !value || typeof value.configured !== "boolean") return { account: "Status unavailable", tone: "neutral" };
  return value.configured ? { account: "Needs attention", tone: "warn" } : { account: "Not connected", tone: "neutral" };
}
function n8nMcpSummary(value: SafeConnectionStatus | null, loading: boolean, error: boolean) {
  if (loading) return { account: "Checking…", tone: "neutral" };
  if (error) return { account: "Status unavailable", tone: "neutral" };
  if (!value || value.configured === false) return { account: "Not connected", tone: "neutral" };
  if (value.configured !== true || typeof value.enabled !== "boolean") return { account: "Status unavailable", tone: "neutral" };
  if (value.status === "connected" && value.enabled === true) return { account: "Connected", tone: "ok" };
  return { account: "OAuth setup unavailable", tone: "warn" };
}
function N8nStateLabel({ value }: { value: { account: string; tone: string } }) {
  return <span className="ig-card-state" data-tone={value.tone}><i aria-hidden />{value.account}</span>;
}
function N8nMcpSection({ m, onChanged }: { m: ReturnType<typeof useMcpConnection>; onChanged: () => void }) {
  const [access, setAccess] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const disconnect = async () => { const ok = await m.disconnect(); if (alive.current && ok) { setConfirmingDisconnect(false); onChanged(); } };
  const connected = m.configured && m.enabled && m.status === "connected";
  const count = (value: number | null) => value === null ? "Unavailable" : value;
  return <>
    <p className="ig-lede">Let Paige use the n8n tools and workflows you explicitly authorize.</p>
    {m.loading ? <p className="ig-state" role="status">Checking Paige tools access…</p> : m.error ? <div className="ig-state" role="alert"><span>Paige tools access could not be read. Connection and approved-tool counts are unavailable.</span><button type="button" className="ig-btn" onClick={() => void m.reload()}>Try again</button></div> : <>
      <dl className="ig-facts">
        <div><dt>Paige tools</dt><dd>{n8nMcpSummary(m, false, false).account}</dd></div>
        <div><dt>Connection method</dt><dd>{!m.configured ? "Not configured" : m.authKind === "oauth" ? "Stored OAuth connection — current authorization unverified" : ["bearer", "header", "url"].includes(m.authKind ?? "") ? "Saved static MCP credential — not OAuth" : "Connection method unavailable"}</dd></div>
        <div><dt>Approved tools</dt><dd>{count(m.approvedToolCount)}</dd></div>
        <div><dt>Tools found</dt><dd>{count(m.toolCount)}</dd></div>
        {m.lastProbedAt && <div><dt>Last recorded check</dt><dd>{safeCheckDate(m.lastProbedAt)}</dd></div>}
      </dl>
      {m.configured && m.status === "error" && <p className="ig-error" role="alert">The saved MCP connection is not working. Tools access is unavailable; its credential may have been refused or the provider may be unavailable.</p>}
      {m.configured && m.status !== "connected" && m.status !== "error" && <p className="ig-note">The saved MCP configuration has not been verified as working.</p>}
      {connected && <p className="ig-note">This connection passed its recorded MCP check. A connection alone does not authorize every tool. {["bearer", "header", "url"].includes(m.authKind ?? "") && "It uses a static credential, not OAuth."}</p>}
      {m.writeError && <p className="ig-error" role="alert">{m.writeError}</p>}
      <div className="ig-actions"><button type="button" className="ig-btn" disabled={m.saving} onClick={() => void m.reload()}>Refresh status</button>{connected && <button type="button" className="ig-btn" onClick={() => setAccess(!access)} aria-expanded={access}>Manage access</button>}{m.configured && m.canWrite && <button type="button" className="ig-btn" disabled={m.saving} onClick={() => setConfirmingDisconnect(true)}>{connected ? "Disconnect Paige tools" : "Remove saved MCP connection"}</button>}</div>
      {access && connected && <div className="ig-facts ig-n8n-access"><p>Saved approval summary — read-only</p><p>Approved tools: {count(m.approvedToolCount)}</p><p>Pinned approvals: {count(m.pinnedCount)}</p><p>Approved workflow count: unavailable</p><p>No permissions are changed and no workflow will run here.</p></div>}
      {!m.canWrite && <p className="ig-note">Only a workspace admin can change this connection. You can see its state here.</p>}
      {confirmingDisconnect && <div className="ig-confirm-close" role="alertdialog" aria-label="Confirm MCP removal"><p>Remove this saved MCP connection? The API connection will stay unchanged.</p><div className="ig-actions"><button type="button" className="ig-btn" data-danger autoFocus disabled={m.saving} onClick={() => void disconnect()}>Confirm removal</button><button type="button" className="ig-btn" onClick={() => setConfirmingDisconnect(false)}>Keep connection</button></div></div>}
    </>}
    <p className="ig-note">{N8N_OAUTH_UNAVAILABLE}</p>
  </>;
}

/**
 * A saved connection and a proven one are different states and are never shown as the
 * same word. `pending_verification` means it was stored but the check has not finished;
 * `error` means the check ran and failed. Rendering either as "Connected" would be the
 * exact false green this whole path exists to prevent.
 */
function mcpStateWords(status: string | null): string {
  if (status === "connected") return "Connected";
  if (status === "error") return "Saved, not working";
  if (status === "pending_verification") return "Saved, not checked yet";
  return "Set up";
}

/**
 * The credential lives only here, only while it is being typed, and is cleared on every
 * submit — success or failure alike. It is never lifted into the hook, never stored,
 * never logged, and never echoed into an error message.
 */
/**
 * The key lives only here, only while it is being typed, and is cleared on
 * every submit — success or failure alike. It is never lifted into the hook,
 * never written to storage, never logged, and never echoed back into an error
 * message. On a failed save the field is empty on purpose: re-entering it is a
 * smaller cost than holding a secret in memory for a retry that may not come.
 */
function N8nForm({
  a, existing, onDone, onDirtyChange, onCommit,
}: {
  a: ReturnType<typeof useN8nConnection>;
  existing: boolean;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onCommit: (run: () => Promise<boolean>) => Promise<boolean>;
}) {
  const [baseUrl, setBaseUrl] = useState(a.baseUrl ?? "");
  const [label, setLabel] = useState(a.label ?? "");
  const [apiKey, setApiKey] = useState("");

  // The seam coalesces an empty `_label` to the stored one, so a name that
  // already exists cannot be removed here. Rather than accept the edit and
  // silently restore the old name on reload, an emptied name is not treated as
  // a change at all, and the field says so.
  const nameLocked = Boolean(a.label) && label.trim() === "";
  const dirty = apiKey.length > 0 || baseUrl !== (a.baseUrl ?? "") || (!nameLocked && label !== (a.label ?? ""));
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const valid = baseUrl.trim().length > 0 && apiKey.length > 0;

  return <form
    className="ig-form"
    onSubmit={async (event) => {
      event.preventDefault();
      if (!valid || a.saving) return;
      const submitted = apiKey;
      setApiKey("");
      const ok = await onCommit(() => a.connect({ baseUrl, apiKey: submitted, label }));
      if (ok) onDone();
    }}
  >
    <label className="ig-field">
      <span>Instance address</span>
      <input
        autoFocus type="url" inputMode="url" autoComplete="off" spellCheck={false}
        placeholder="https://your-instance.app.n8n.cloud"
        value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} disabled={a.saving}
      />
      <small>Has to start with https://</small>
    </label>
    <label className="ig-field">
      <span>API key</span>
      <input
        type="password" autoComplete="off" spellCheck={false}
        placeholder={existing ? "Enter the key again to reconnect" : "Paste your n8n API key"}
        value={apiKey} onChange={(event) => setApiKey(event.target.value)} disabled={a.saving}
      />
      <small>{existing ? "The stored key is never shown, so a change needs it again." : "Stored encrypted. It is never displayed after this."}</small>
    </label>
    <label className="ig-field">
      <span>Name <em>optional</em></span>
      <input
        type="text" autoComplete="off" placeholder="What you call this instance"
        value={label} onChange={(event) => setLabel(event.target.value)} disabled={a.saving}
      />
      {nameLocked && <small>A name can be changed here but not removed, so this keeps “{a.label}”.</small>}
    </label>
    <div className="ig-actions">
      <button type="submit" className="ig-btn" data-primary disabled={!valid || a.saving}>
        {a.saving ? "Saving…" : "Save API connection"}
      </button>
      <button type="button" className="ig-btn" onClick={onDone} disabled={a.saving}>Cancel</button>
    </div>
  </form>;
}

/* ── The contextual panel ─────────────────────────────────────────────────── */

type N8nTab = "api" | "mcp";
function N8nDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const a = useN8nConnection();
  const m = useMcpConnection("n8n");
  const [tab, setTab] = useState<N8nTab>("api");
  const [dirty, setDirty] = useState(false);
  const [savingClose, setSavingClose] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<"close" | N8nTab | null>(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const discard = useRef<HTMLButtonElement>(null);
  const requestLeave = useCallback((target: "close" | N8nTab) => {
    if (target === tab) return;
    if (a.saving || m.saving) { if (target === "close") setSavingClose(true); return; }
    if (dirty) { setDiscardTarget(target); return; }
    if (target === "close") onClose(); else setTab(target);
  }, [a.saving, m.saving, dirty, onClose, tab]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => { if (discardTarget) discard.current?.focus(); }, [discardTarget]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const root = panel.current;
      if (!root) return;
      if (event.key === "Escape") {
        event.preventDefault();
        const confirmation = root.querySelector('[role="alertdialog"]');
        if (confirmation) { const buttons = confirmation.querySelectorAll<HTMLButtonElement>("button"); buttons[buttons.length - 1]?.click(); }
        else requestLeave("close");
        return;
      }
      if (event.key !== "Tab") return;
      const focusRoot = root.querySelector<HTMLElement>('[role="alertdialog"]') ?? root;
      const items = Array.from(focusRoot.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex="0"]')).filter(item => !item.hasAttribute("disabled") && item.tabIndex !== -1 && item.offsetParent !== null);
      if (!items.length) return;
      if (!focusRoot.contains(document.activeElement)) { event.preventDefault(); items[0].focus(); }
      else if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestLeave]);
  const tabKeys = (event: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "api" : event.key === "End" ? "mcp" : tab === "api" ? "mcp" : "api";
    requestLeave(next);
    if (!dirty) panel.current?.querySelector<HTMLButtonElement>(`#ig-n8n-tab-${next}`)?.focus();
  };
  return <div className="ig-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) requestLeave("close"); }}>
    <aside className="ig-panel ig-n8n-panel" ref={panel} role="dialog" aria-modal="true" aria-labelledby="ig-panel-title">
      <header><span className="ss-provider-mark" data-provider-mark="n8n" aria-hidden>n8n</span><div><h2 id="ig-panel-title">n8n</h2><span>API visibility and Paige tools</span></div><button ref={close} className="ig-close" type="button" aria-label="Close n8n" onClick={() => requestLeave("close")}><X aria-hidden size={16} /></button></header>
      <div className="ig-n8n-overview"><div className="ig-n8n-summary" aria-label="Independent n8n connection states"><div><span>API connection</span><N8nStateLabel value={n8nApiSummary(a, a.loading, a.error)} /></div><div><span>Paige tools (MCP)</span><N8nStateLabel value={n8nMcpSummary(m, m.loading, m.error)} /></div></div>
        <div className="ss-segment ig-n8n-tabs" role="tablist" aria-label="n8n connections" onKeyDown={tabKeys}>{(["api", "mcp"] as const).map(value => <button key={value} type="button" id={`ig-n8n-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`ig-n8n-panel-${value}`} tabIndex={tab === value ? 0 : -1} disabled={a.saving || m.saving} onClick={() => requestLeave(value)}>{value === "api" ? "API connection" : "Paige tools (MCP)"}</button>)}</div>
      </div>
      <div className="ig-panel-body">
        {savingClose && <div className="ig-confirm-close" role="alertdialog" aria-label="Saving is in progress"><p>Saving is still in progress. Closing will not cancel it.</p><div className="ig-actions"><button type="button" autoFocus className="ig-btn" onClick={onClose}>Close while saving</button><button type="button" className="ig-btn" onClick={() => setSavingClose(false)}>Keep open</button></div></div>}
        {discardTarget && <div className="ig-confirm-close" role="alertdialog" aria-label="Discard unsaved API details"><p>You have unsaved API details. Discard them {discardTarget === "close" ? "and close" : "and change tabs"}?</p><div className="ig-actions"><button ref={discard} type="button" className="ig-btn" data-danger onClick={() => { const next = discardTarget; setDirty(false); setDiscardTarget(null); setFormEpoch(value => value + 1); if (next === "close") onClose(); else { setTab(next); panel.current?.querySelector<HTMLButtonElement>(`#ig-n8n-tab-${next}`)?.focus(); } }}>Discard changes</button><button type="button" className="ig-btn" onClick={() => { setDiscardTarget(null); panel.current?.querySelector<HTMLInputElement>("input")?.focus(); }}>Keep editing</button></div></div>}
        {tab === "api" ? <section id="ig-n8n-panel-api" role="tabpanel" aria-labelledby="ig-n8n-tab-api"><N8nPanelBody key={formEpoch} a={a} onDirtyChange={setDirty} onChanged={onChanged} /></section> : <section id="ig-n8n-panel-mcp" role="tabpanel" aria-labelledby="ig-n8n-tab-mcp"><N8nMcpSection m={m} onChanged={onChanged} /></section>}
      </div>
      <footer><span>API visibility and Paige tools authorization are separate.</span></footer>
    </aside>
  </div>;
}
function ProviderPanel(props: { row: ProviderRow; onClose: () => void; onChanged: () => void }) {
  return props.row.id === "n8n" ? <N8nDrawer onClose={props.onClose} onChanged={props.onChanged} /> : <LegacyProviderPanel {...props} />;
}

function LegacyProviderPanel({ row, onClose, onChanged }: { row: ProviderRow; onClose: () => void; onChanged: () => void }) {
  // A drawer can hold more than one connection, so unsaved input is tracked per
  // section. Closing is guarded if EITHER has something unsaved — a single shared
  // flag would let one section clear the other's guard and silently discard input.
  const [apiDirty, setApiDirty] = useState(false);
  const [mcpDirty, setMcpDirty] = useState(false);
  const dirty = apiDirty || mcpDirty;
  const [confirmingClose, setConfirmingClose] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const requestClose = useCallback(() => {
    if (dirty) { setConfirmingClose(true); return; }
    onClose();
  }, [dirty, onClose]);

  // Captured on mount and restored on unmount: without it every close path
  // drops focus to the document body and a keyboard user has to walk the page
  // again to get back to where they were.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { requestClose(); return; }
      if (event.key !== "Tab") return;
      // This dialog declares aria-modal, so focus has to stay inside it.
      // Without this, Tab walks out into the page behind while assistive
      // technology has been told that page is inert.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!panel.contains(active)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return <div className="ig-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
    <aside className="ig-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="ig-panel-title">
      <header>
        <span className="ss-provider-mark" data-provider-mark={row.id} aria-hidden>{providerMark(row.id)}</span>
        <div><h2 id="ig-panel-title">{row.name}</h2><span>{row.kind}</span></div>
        <button ref={closeRef} type="button" className="ig-close" onClick={requestClose} aria-label={`Close ${row.name}`}><X aria-hidden size={16} /></button>
      </header>

      <div className="ig-panel-body">
        {confirmingClose && <div className="ig-confirm-close" role="alertdialog" aria-label="Discard changes">
          <p>You have unsaved details here. Close anyway?</p>
          <div className="ig-actions">
            <button type="button" className="ig-btn" data-danger onClick={onClose}>Discard them</button>
            <button type="button" className="ig-btn" onClick={() => setConfirmingClose(false)}>Keep editing</button>
          </div>
        </div>}

        {row.id === "mcp"
          ? <ZapierPanelBody onChanged={onChanged} />
          : <><p className="ig-lede">{row.note}</p>
              <p className="ig-note">Setting this up is not offered here yet, rather than offered and quietly not working.</p></>}
      </div>

      <footer><span>No credentials or provider payloads are shown here.</span></footer>
    </aside>
  </div>;
}

/* ── Routing (owned locally; the shared hook reads two levels) ─────────────── */

type IntegrationsLeaf = "catalogue" | "automations";

function useIntegrationsLeaf(): [IntegrationsLeaf, (next: IntegrationsLeaf) => void] {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const match = pathname.match(/^(\/solo\/[^/]+\/settings\/integrations)(?:\/([^/]+))?/);
  const leaf: IntegrationsLeaf = match?.[2] === "automations" ? "automations" : "catalogue";
  // Built from the canonical prefix, never by stripping a known trailing leaf.
  // On an unknown leaf (`…/integrations/something-retired`) the latter left the
  // retired segment in place, so the Automations tab navigated to
  // `…/something-retired/automations` — still read as the catalogue, leaving the
  // tab unreachable rather than merely falling back.
  const base = match?.[1] ?? pathname;
  const setLeaf = useCallback((next: IntegrationsLeaf) => {
    navigate(next === "catalogue" ? `${base}${search}` : `${base}/automations${search}`);
  }, [base, navigate, search]);
  return [leaf, setLeaf];
}

export function SoloIntegrationsView() {
  const { activeTenantId, activeUserId, loading: tenantLoading } = useTenantContext();
  const scopeKey = `${activeUserId ?? ""}:${activeTenantId ?? ""}`;
  const [leaf, setLeaf] = useIntegrationsLeaf();
  const status = useIntegrationStatus();
  const [category, setCategory] = useState<CatalogueCategory>("all");
  const [open, setOpen] = useState<{ row: ProviderRow; scope: string } | null>(null);
  useEffect(() => { setOpen(null); }, [scopeKey, tenantLoading]);
  const rows = PROVIDERS.filter(row => category === "all" || row.filter === category);
  const tabs: ReadonlyArray<{ id: IntegrationsLeaf; label: string; Icon: typeof Workflow }> = [
    { id: "catalogue", label: "Integrations", Icon: Plug }, { id: "automations", label: "Automations", Icon: Zap },
  ];
  return <div className="ss-integrations">
    <div className="ss-subtabs" role="tablist" aria-label="Integrations sections">{tabs.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" className="ss-subtab" aria-selected={leaf === id} onClick={() => setLeaf(id)}><Icon aria-hidden size={14} />{label}</button>)}</div>
    {leaf === "automations" ? <SoloAutomationsView /> : <>
      <div className="ig-bar" role="group" aria-label="Filter integrations">{CATALOGUE_FILTERS.map(filter => <button key={filter.id} type="button" aria-pressed={category === filter.id} onClick={() => setCategory(filter.id)}>{filter.label}</button>)}</div>
      {status.loading ? <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Resolving this account…</p> : <>
        {status.error && <div className="ig-state" role="alert"><TriangleAlert aria-hidden /><span>Some integration status could not be read. Each connection below reports only its own available state.</span><button type="button" className="ig-btn" onClick={() => void status.retry()}>Try again</button></div>}
        <ul className="ig-grid">{rows.map(row => {
          const live = statusPresentation(row.id === "mcp" ? status.mcp.zapier ?? null : null);
          return <li key={row.id}><button type="button" className="ig-card" data-provider={row.id} data-owner="integrations" onClick={() => setOpen({ row, scope: scopeKey })} aria-haspopup="dialog">
            <span className="ss-provider-mark" data-provider-mark={row.id} aria-hidden>{providerMark(row.id)}</span><span className="ig-card-title"><strong>{row.name}</strong><small>{row.kind}</small></span>
            {row.id === "n8n" ? <><span className="ig-n8n-tile-state"><span>API connection</span><N8nStateLabel value={n8nApiSummary(status.n8n, false, status.apiError)} /></span><span className="ig-n8n-tile-state"><span>Paige tools (MCP)</span><N8nStateLabel value={n8nMcpSummary(status.mcp.n8n ?? null, false, status.mcpError)} /></span></> : <span className="ig-card-state" data-tone={row.id === "mcp" && status.mcpError ? "neutral" : row.connectable ? live.tone : "neutral"}><i aria-hidden />{row.id === "mcp" && status.mcpError ? "Status unavailable" : row.connectable ? live.account : "Not available"}</span>}
          </button></li>;
        })}</ul>
      </>}
    </>}
    {open && !tenantLoading && open.scope === scopeKey && <ProviderPanel key={`${scopeKey}:${open.row.id}`} row={open.row} onClose={() => setOpen(null)} onChanged={status.retry} />}
  </div>;
}
