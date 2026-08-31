import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Link2Off, Plug, RefreshCw, TriangleAlert, Workflow, X, Zap } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SoloAutomationsView } from "./settings-automations";
import { useN8nConnection } from "./data/useN8nConnection";
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
    return { truth: "UNAVAILABLE" as SettingsTruth, account: "Not connected", tone: "neutral" };
  }
  if (value.enabled === false) return { truth: "PARTIAL" as SettingsTruth, account: "Turned off", tone: "warn" };
  if (value.status === "error") return { truth: "PARTIAL" as SettingsTruth, account: "Needs attention", tone: "bad" };
  if (value.status === "connected") return { truth: "LIVE" as SettingsTruth, account: "Connected", tone: "ok" };
  return { truth: "PARTIAL" as SettingsTruth, account: "Status not reported", tone: "neutral" };
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
  { id: "mcp", name: "MCP bridge", kind: "External tool bridge", filter: "developer", connectable: false,
    note: "The bridge reports its own status, but there is no tenant-safe way to set it up from here yet. Its credential path is deliberately not reachable from a browser." },
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

function providerMark(id: ProviderIdentity, zapier: boolean) {
  if (id === "n8n") return "n8n";
  if (id === "mcp") return zapier ? "zap" : "MCP";
  return id.slice(0, 2).toUpperCase();
}

/* ── n8n: the one provider with a real connection flow ────────────────────── */

function N8nPanelBody({ onDirtyChange, onChanged }: { onDirtyChange: (dirty: boolean) => void; onChanged: () => void }) {
  // Mounted only for the provider that owns this seam, so opening any other
  // card issues no n8n read at all.
  const a = useN8nConnection();
  const [editing, setEditing] = useState(false);
  // The card grid reads its own catalogue snapshot. Without this, connecting
  // here and closing the panel would leave the card still saying "Not
  // connected" until the whole view reloaded.
  const commit = useCallback(async (run: () => Promise<boolean>) => {
    const ok = await run();
    if (ok) onChanged();
    return ok;
  }, [onChanged]);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  if (a.loading) return <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Checking this workspace…</p>;

  if (a.error) {
    return <div className="ig-state" role="alert">
      <TriangleAlert aria-hidden />
      <span>The connection could not be read, so nothing is being claimed either way — not connected, and not disconnected.</span>
      <button type="button" className="ig-btn" onClick={() => void a.reload()}>Try again</button>
    </div>;
  }

  const showForm = editing || !a.configured;

  return <>
    {a.configured && !editing && <dl className="ig-facts">
      <div><dt>State</dt><dd>{a.status === "error" ? "Needs attention" : a.status === "connected" ? "Connected" : "Set up"}</dd></div>
      {a.label && <div><dt>Name</dt><dd>{a.label}</dd></div>}
      {a.baseUrl && <div><dt>Address</dt><dd className="ig-mono">{a.baseUrl}</dd></div>}
      <div><dt>API key</dt><dd className="ig-mono">{a.last4 ? `••••••••${a.last4}` : "Stored"}</dd></div>
      {typeof a.workflowCount === "number" && <div><dt>Workflows seen</dt><dd>{a.workflowCount}</dd></div>}
    </dl>}

    {!a.configured && !editing && <p className="ig-lede">
      Connect your own n8n instance so Paige can see what lives there. You provide the address and an
      API key; the key is stored encrypted and is never shown again, not even to you.
    </p>}

    {a.writeError && <p className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} />{a.writeError}</p>}

    {!a.canWrite && <p className="ig-note">Only a workspace admin can change this connection. You can see its state here.</p>}

    {showForm && a.canWrite
      ? <N8nForm
          a={a}
          existing={a.configured}
          onDirtyChange={onDirtyChange}
          onCommit={commit}
          onDone={() => { setEditing(false); onDirtyChange(false); }}
        />
      : a.canWrite && <div className="ig-actions">
          <button type="button" className="ig-btn" data-primary onClick={() => setEditing(true)} disabled={a.saving}>
            <KeyRound aria-hidden size={14} />{a.status === "error" ? "Reconnect" : "Manage"}
          </button>
          {confirmingDisconnect ? <span className="ig-confirm">
            <button type="button" className="ig-btn" data-danger disabled={a.saving}
              onClick={() => { setConfirmingDisconnect(false); void commit(() => a.disconnect()); }}>
              Disconnect it
            </button>
            <button type="button" className="ig-btn" onClick={() => setConfirmingDisconnect(false)}>Keep it</button>
          </span> : <button type="button" className="ig-btn" disabled={a.saving} onClick={() => setConfirmingDisconnect(true)}>
            <Link2Off aria-hidden size={14} />Disconnect
          </button>}
        </div>}
  </>;
}

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
        type="url" inputMode="url" autoComplete="off" spellCheck={false}
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
        {a.saving ? "Saving…" : existing ? "Save changes" : "Connect n8n"}
      </button>
      {existing && <button type="button" className="ig-btn" onClick={onDone} disabled={a.saving}>Cancel</button>}
    </div>
  </form>;
}

/* ── The contextual panel ─────────────────────────────────────────────────── */

function ProviderPanel({ row, zapier, onClose, onChanged }: { row: ProviderRow; zapier: boolean; onClose: () => void; onChanged: () => void }) {
  const [dirty, setDirty] = useState(false);
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
        <span className="ss-provider-mark" data-provider-mark={row.id} aria-hidden>{providerMark(row.id, zapier)}</span>
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

        {row.connectable
          ? <N8nPanelBody onDirtyChange={setDirty} onChanged={onChanged} />
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
  const [leaf, setLeaf] = useIntegrationsLeaf();
  const status = useIntegrationStatus();
  const zapier = isZapierMcpHost(status.mcp?.server_url_host);
  const [category, setCategory] = useState<CatalogueCategory>("all");
  const [open, setOpen] = useState<ProviderRow | null>(null);

  const liveStatus = (id: ProviderIdentity) => id === "n8n" ? status.n8n : id === "mcp" ? status.mcp : null;
  const rows = PROVIDERS.filter((row) => category === "all" || row.filter === category);

  const tabs: ReadonlyArray<{ id: IntegrationsLeaf; label: string; Icon: typeof Workflow }> = [
    { id: "catalogue", label: "Integrations", Icon: Plug },
    { id: "automations", label: "Automations", Icon: Zap },
  ];

  return <div className="ss-integrations">
    <div className="ss-subtabs" role="tablist" aria-label="Integrations sections">
      {tabs.map(({ id, label, Icon }) => (
        <button key={id} type="button" role="tab" className="ss-subtab" aria-selected={leaf === id}
          onClick={() => setLeaf(id)}>
          <Icon aria-hidden size={14} />{label}
        </button>
      ))}
    </div>

    {leaf === "automations" ? <SoloAutomationsView /> : <>
      <div className="ig-bar" role="group" aria-label="Filter integrations">
        {CATALOGUE_FILTERS.map((filter) => (
          <button key={filter.id} type="button" aria-pressed={category === filter.id} onClick={() => setCategory(filter.id)}>
            {filter.label}
          </button>
        ))}
      </div>

      {status.loading ? <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Resolving this account…</p>
        : status.error ? <div className="ig-state" role="alert">
            <TriangleAlert aria-hidden />
            <span>Integration status could not be read. No connection state is being claimed for this account.</span>
            <button type="button" className="ig-btn" onClick={status.retry}>Try again</button>
          </div>
        : <ul className="ig-grid">
            {rows.map((row) => {
              const live = statusPresentation(liveStatus(row.id));
              const name = row.id === "mcp" && zapier ? "Zapier MCP" : row.name;
              return <li key={row.id}>
                <button type="button" className="ig-card" data-provider={row.id} data-owner="integrations"
                  onClick={() => setOpen(row)} aria-haspopup="dialog">
                  <span className="ss-provider-mark" data-provider-mark={row.id} aria-hidden>{providerMark(row.id, zapier)}</span>
                  <span className="ig-card-title"><strong>{name}</strong><small>{row.kind}</small></span>
                  <span className="ig-card-state" data-tone={row.connectable || live.truth !== "UNAVAILABLE" ? live.tone : "neutral"}>
                    <i aria-hidden />{row.connectable ? live.account : "Not available"}
                  </span>
                </button>
              </li>;
            })}
          </ul>}
    </>}

    {open && <ProviderPanel row={open} zapier={zapier} onClose={() => setOpen(null)} onChanged={status.retry} />}
  </div>;
}

