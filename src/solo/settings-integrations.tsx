import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, Link2Off, Plug, RefreshCw, TriangleAlert, Workflow, X, Zap } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SoloAutomationsView } from "./settings-automations";
import { useN8nConnection } from "./data/useN8nConnection";
import { useMcpConnection, type McpDraft } from "./data/useMcpConnection";
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
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<IntegrationReadState>({ tenantId: null, loading: true, error: false, n8n: null, mcp: {} });

  const load = useCallback(async () => {
    const token = gate.current.begin();
    setState({ tenantId: null, loading: true, error: false, n8n: null, mcp: {} });
    if (!activeTenantId) {
      setState({ tenantId: null, loading: false, error: false, n8n: null, mcp: {} });
      return;
    }
    const [n8nResult, mcpResult] = await Promise.all([
      supabase.rpc("get_tenant_n8n_connection"),
      // Provider-scoped safe getter, newer than the generated client types. It
      // returns status per provider only; its secret-bearing counterpart is
      // service-role and is never callable from this browser surface.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("get_tenant_mcp_connections"),
    ]);
    if (!gate.current.isCurrent(token)) return;
    const failed = Boolean(n8nResult.error || mcpResult.error);
    setState({
      tenantId: activeTenantId,
      loading: false,
      error: failed,
      n8n: failed ? null : sanitizeSafeConnectionStatus(n8nResult.data),
      mcp: failed ? {} : sanitizeMcpByProvider(mcpResult.data),
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
  // Connectable through an authorization grant rather than a pasted credential, so the
  // panel offers consent instead of a form. The card's label is CD's to set; this row
  // only changes whether the connection can be made.
  // The Zapier slot. It can only ever hold Zapier: the setter writes that provider and
  // that endpoint, and the registry's CHECK refuses a Zapier row that is not OAuth. So
  // the card is named for what it is rather than for the protocol underneath it.
  { id: "mcp", name: "Zapier", kind: "Apps and actions", filter: "developer", connectable: true,
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

/* ── What Paige may actually run ───────────────────────────────────────────
   A connection is reachability. This is authority, and it is a separate act on
   purpose: a workspace that connected a provider has not thereby agreed that
   Paige may do everything on it. Nothing is approved until somebody says so
   here, and until then every call is refused. */

function CapabilityApproval({ provider }: { provider: "n8n" | "zapier" }) {
  const caps = useMcpCapabilities(provider);
  const [chosen, setChosen] = useState<string[] | null>(null);

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
  const m = useMcpConnection("zapier");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const begin = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    const { data, error } = await supabase.functions.invoke("tenant-mcp-connect", {
      body: { provider: "zapier", action: "oauth_begin" },
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
  }, []);

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
      <div><dt>Access</dt><dd>Granted by you on Zapier. No key is stored here.</dd></div>
    </dl>}

    {!m.configured && <p className="ig-lede">
      Connect Zapier by approving it on Zapier's own sign-in page. Nothing is pasted here and no key is
      kept: the access can be withdrawn from either side at any time.
    </p>}

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
          <button type="button" className="ig-btn" data-primary disabled={starting || m.saving} onClick={() => void begin()}>
            <KeyRound aria-hidden size={14} />
            {starting ? "Opening Zapier…" : m.configured ? "Reconnect" : "Connect Zapier"}
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

function N8nMcpSection({ onDirtyChange, onChanged }: { onDirtyChange: (dirty: boolean) => void; onChanged: () => void }) {
  const m = useMcpConnection("n8n");
  const [editing, setEditing] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const commit = useCallback(async (run: () => Promise<boolean>) => {
    const ok = await run();
    // The catalogue card reads its own snapshot, so it is refreshed whether or not
    // the probe succeeded: a stored-but-failing connection is a real state change.
    onChanged();
    return ok;
  }, [onChanged]);

  if (m.loading) return <p className="ig-state" role="status"><RefreshCw className="ig-spin" aria-hidden />Checking the tool bridge…</p>;

  if (m.error) {
    return <div className="ig-state" role="alert">
      <TriangleAlert aria-hidden />
      <span>The tool bridge could not be read, so nothing is being claimed either way.</span>
      <button type="button" className="ig-btn" onClick={() => void m.reload()}>Try again</button>
    </div>;
  }

  const showForm = editing || !m.configured;

  return <>
    {m.configured && !editing && <dl className="ig-facts">
      <div><dt>State</dt><dd>{mcpStateWords(m.status)}</dd></div>
      {m.label && <div><dt>Name</dt><dd>{m.label}</dd></div>}
      {m.serverUrlHost && <div><dt>Server</dt><dd className="ig-mono">{m.serverUrlHost}</dd></div>}
      <div><dt>Credential</dt><dd className="ig-mono">{m.last4 ? `••••••••${m.last4}` : "Stored"}</dd></div>
      {m.transport && <div><dt>Transport</dt><dd>{m.transport === "sse" ? "Server-sent events" : "HTTP"}</dd></div>}
    </dl>}

    {!m.configured && !editing && <p className="ig-lede">
      If your n8n instance publishes its own tools, connect that here so Paige can see what it offers.
      You provide the address and a credential; the credential is stored encrypted and is never shown again.
    </p>}

    {m.writeError && <p className="ig-error" role="alert"><TriangleAlert aria-hidden size={14} />{m.writeError}</p>}

    {!m.canWrite && <p className="ig-note">Only a workspace admin can change this connection. You can see its state here.</p>}

    {showForm && m.canWrite
      ? <McpForm m={m} existing={m.configured} onDirtyChange={onDirtyChange} onCommit={commit}
          onDone={() => { setEditing(false); onDirtyChange(false); }} />
      : m.canWrite && <div className="ig-actions">
          <button type="button" className="ig-btn" data-primary onClick={() => setEditing(true)} disabled={m.saving}>
            <KeyRound aria-hidden size={14} />{m.status === "connected" ? "Manage" : "Reconnect"}
          </button>
          {/* Re-runs the probe against what is already stored. It never re-sends a
              credential, which is what makes it safe to offer on a failing connection. */}
          <button type="button" className="ig-btn" disabled={m.saving} onClick={() => void commit(() => m.verify())}>
            <RefreshCw aria-hidden size={14} />{m.saving ? "Checking…" : "Check it again"}
          </button>
          {confirmingDisconnect ? <span className="ig-confirm">
            <button type="button" className="ig-btn" data-danger disabled={m.saving}
              onClick={() => { setConfirmingDisconnect(false); void commit(() => m.disconnect()); }}>
              Disconnect it
            </button>
            <button type="button" className="ig-btn" onClick={() => setConfirmingDisconnect(false)}>Keep it</button>
          </span> : <button type="button" className="ig-btn" disabled={m.saving} onClick={() => setConfirmingDisconnect(true)}>
            <Link2Off aria-hidden size={14} />Disconnect
          </button>}
        </div>}

    {m.configured && m.status === "connected" && m.canWrite && <CapabilityApproval provider="n8n" />}
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
function McpForm({
  m, existing, onDone, onDirtyChange, onCommit,
}: {
  m: ReturnType<typeof useMcpConnection>;
  existing: boolean;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onCommit: (run: () => Promise<boolean>) => Promise<boolean>;
}) {
  const [serverUrl, setServerUrl] = useState("");
  const [credential, setCredential] = useState("");
  const [authKind, setAuthKind] = useState<McpDraft["authKind"]>((m.authKind === "header" ? "header" : "bearer"));
  const [headerName, setHeaderName] = useState("");
  const [transport, setTransport] = useState<McpDraft["transport"]>(m.transport === "sse" ? "sse" : "http");
  const [label, setLabel] = useState(m.label ?? "");

  // The stored address is never returned to a browser — only its host — so this field
  // starts empty even when reconnecting, and says why rather than looking like a bug.
  const dirty = credential.length > 0 || serverUrl.length > 0 || label !== (m.label ?? "");
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const needsHeaderName = authKind === "header";
  const valid = serverUrl.trim().length > 0 && credential.length > 0 && (!needsHeaderName || headerName.trim().length > 0);

  return <form
    className="ig-form"
    onSubmit={async (event) => {
      event.preventDefault();
      if (!valid || m.saving) return;
      const submitted = credential;
      setCredential("");
      const ok = await onCommit(() => m.connect({ serverUrl, credential: submitted, authKind, headerName, transport, label }));
      if (ok) onDone();
    }}
  >
    <label className="ig-field">
      <span>Tools address</span>
      <input
        type="url" inputMode="url" autoComplete="off" spellCheck={false}
        placeholder="https://your-instance.app.n8n.cloud/mcp/…"
        value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} disabled={m.saving}
      />
      <small>
        {existing && m.serverUrlHost
          ? `Currently ${m.serverUrlHost}. The full address is never shown back, because the rest of it is itself a secret — enter it again to change it.`
          : "Has to start with https://"}
      </small>
    </label>
    <label className="ig-field">
      <span>Credential</span>
      <input
        type="password" autoComplete="off" spellCheck={false}
        placeholder={existing ? "Enter the credential again to reconnect" : "Paste the credential n8n expects"}
        value={credential} onChange={(event) => setCredential(event.target.value)} disabled={m.saving}
      />
      <small>{existing ? "The stored credential is never shown, so a change needs it again." : "Stored encrypted. It is never displayed after this."}</small>
    </label>
    <label className="ig-field">
      <span>How it is sent</span>
      <select value={authKind} onChange={(event) => setAuthKind(event.target.value as McpDraft["authKind"])} disabled={m.saving}>
        <option value="bearer">As a Bearer token</option>
        <option value="header">In a header you name</option>
      </select>
    </label>
    {needsHeaderName && <label className="ig-field">
      <span>Header name</span>
      <input
        type="text" autoComplete="off" spellCheck={false} placeholder="X-N8N-Api-Key"
        value={headerName} onChange={(event) => setHeaderName(event.target.value)} disabled={m.saving}
      />
    </label>}
    <label className="ig-field">
      <span>Transport</span>
      <select value={transport} onChange={(event) => setTransport(event.target.value as McpDraft["transport"])} disabled={m.saving}>
        <option value="http">HTTP</option>
        <option value="sse">Server-sent events</option>
      </select>
    </label>
    <label className="ig-field">
      <span>Name <em>optional</em></span>
      <input
        type="text" autoComplete="off" placeholder="What you call this bridge"
        value={label} onChange={(event) => setLabel(event.target.value)} disabled={m.saving}
      />
    </label>
    <div className="ig-actions">
      <button type="submit" className="ig-btn" data-primary disabled={!valid || m.saving}>
        {m.saving ? "Connecting…" : existing ? "Save changes" : "Connect the bridge"}
      </button>
      {existing && <button type="button" className="ig-btn" onClick={onDone} disabled={m.saving}>Cancel</button>}
    </div>
  </form>;
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

function ProviderPanel({ row, onClose, onChanged }: { row: ProviderRow; onClose: () => void; onChanged: () => void }) {
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
          : row.connectable
          ? <>
              {/* Two connections, one provider. Each is independent: the REST API can
                  work while the tool bridge does not, and neither implies the other.
                  They are kept in separate sections so no state reads as shared, and
                  either section can report its own failure without the other looking
                  broken. Unsaved input in either one guards the same close. */}
              <section className="ig-section" aria-labelledby="ig-sec-api">
                <h3 id="ig-sec-api">Instance API</h3>
                <N8nPanelBody onDirtyChange={setApiDirty} onChanged={onChanged} />
              </section>
              <section className="ig-section" aria-labelledby="ig-sec-mcp">
                <h3 id="ig-sec-mcp">Direct tool access</h3>
                <N8nMcpSection onDirtyChange={setMcpDirty} onChanged={onChanged} />
              </section>
            </>
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
  const [category, setCategory] = useState<CatalogueCategory>("all");
  const [open, setOpen] = useState<ProviderRow | null>(null);

  // n8n's card reports its shipped API-key connection; the Zapier card reports the
  // tenant's Zapier connection. Both are provider-scoped reads.
  const liveStatus = (id: ProviderIdentity) => id === "n8n" ? status.n8n : id === "mcp" ? (status.mcp.zapier ?? null) : null;
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
              return <li key={row.id}>
                <button type="button" className="ig-card" data-provider={row.id} data-owner="integrations"
                  onClick={() => setOpen(row)} aria-haspopup="dialog">
                  <span className="ss-provider-mark" data-provider-mark={row.id} aria-hidden>{providerMark(row.id)}</span>
                  <span className="ig-card-title"><strong>{row.name}</strong><small>{row.kind}</small></span>
                  <span className="ig-card-state" data-tone={row.connectable || live.truth !== "UNAVAILABLE" ? live.tone : "neutral"}>
                    <i aria-hidden />{row.connectable ? live.account : "Not available"}
                  </span>
                </button>
              </li>;
            })}
          </ul>}
    </>}

    {open && <ProviderPanel row={open} onClose={() => setOpen(null)} onChanged={status.retry} />}
  </div>;
}

