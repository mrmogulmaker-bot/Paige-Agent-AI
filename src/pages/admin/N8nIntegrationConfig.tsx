import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Workflow, Loader2, Plug, RefreshCw, Unplug } from "lucide-react";

// Option 2 (owner ruling, §55): the n8n MCP endpoint is the PRIMARY (and only visible)
// connect path. The API-key REST connect path is HIDDEN here but its code is retained
// (behind this flag) so the owner can re-add it later. Paige RETAINS the full n8n
// management/build lifecycle via REST UNDER THE HOOD — the paige-n8n edge function, the
// tenant_n8n_connections RPCs, and the 12 n8n_* tools are all untouched; only this
// operator-facing connect form is MCP-first.
const REST_CONNECT_ENABLED = false;

// Safe status shape returned by get_tenant_mcp_connection(_vendor='n8n') — never the token.
type McpConnStatus = {
  configured: boolean;
  vendor?: string;
  label?: string | null;
  server_url_host?: string | null;
  auth_token_last4?: string | null;
  transport?: "http" | "sse" | "stdio";
  enabled?: boolean;
  tools_cache?: Array<{ name: string; description?: string }> | null;
  status?: "unconfigured" | "connected" | "error";
  last_error?: string | null;
  last_probed_at?: string | null;
};

// n8n's MCP Server Trigger exposes a Streamable-HTTP endpoint and (legacy) an SSE one at
// `…/sse`. Derive the transport from the URL shape so the operator only ever pastes the
// one URL (§36 — never make a non-technical user pick a transport they don't understand).
function deriveTransport(url: string): "http" | "sse" {
  return /\/sse(\/?$|\?)/i.test(url.trim()) ? "sse" : "http";
}

export default function N8nIntegrationConfig() {
  const [conn, setConn] = useState<McpConnStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "test" | "disconnect">(null);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");

  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-RPC-name cast; get_tenant_mcp_connection isn't in generated types; CI whole-file-lints changed files
    const { data, error } = await (supabase as any).rpc("get_tenant_mcp_connection", { _vendor: "n8n" });
    setLoading(false);
    if (error) { toast.error("Couldn't load your n8n MCP connection."); return; }
    setConn(data as McpConnStatus);
  }

  useEffect(() => { void load(); }, []);

  // Probe the endpoint (tools/list) so the operator sees it's live and how many tools it exposes.
  async function probe(): Promise<{ ok: boolean; count: number }> {
    const { data, error } = await supabase.functions.invoke("call-n8n-mcp", { body: { action: "list" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- edge-response cast; CI whole-file-lints changed files
    const d = data as any;
    if (error || d?.ok === false || d?.error) return { ok: false, count: 0 };
    return { ok: true, count: Array.isArray(d?.tools) ? d.tools.length : 0 };
  }

  async function connect() {
    if (!endpointUrl.trim() || !token.trim()) return;
    setBusy("connect");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-RPC-name cast; set_tenant_mcp_connection isn't in generated types; CI whole-file-lints changed files
    const { error: setErr } = await (supabase as any).rpc("set_tenant_mcp_connection", {
      _server_url: endpointUrl.trim(),
      _auth_token: token.trim(),
      _transport: deriveTransport(endpointUrl),
      _label: label.trim() || null,
      _vendor: "n8n",
    });
    if (setErr) {
      setBusy(null);
      // Surface the real reason the RPC raised (https required, admin required, token required).
      const raw = setErr.message || "";
      const friendly =
        /insecure|https/i.test(raw) ? "The MCP endpoint URL must start with https://" :
        /admin|forbidden|42501/i.test(raw) ? "You need admin access on this workspace to connect n8n." :
        /no_token|token/i.test(raw) ? "A Bearer token is required — copy it from your n8n MCP Server Trigger credential." :
        `Couldn't save the connection. ${raw}`.trim();
      toast.error(friendly);
      return;
    }
    // Immediately probe so the operator sees it's live.
    const { ok, count } = await probe();
    setBusy(null);
    setToken("");
    if (!ok) toast.error("Saved, but couldn't reach the n8n MCP endpoint — check the URL and Bearer token.");
    else toast.success(`Connected — ${count} n8n MCP tool${count === 1 ? "" : "s"} found.`);
    await load();
  }

  async function testConnection() {
    setBusy("test");
    const { ok, count } = await probe();
    setBusy(null);
    if (!ok) toast.error("Couldn't reach the n8n MCP endpoint. Re-check the URL and token.");
    else toast.success(`Connected — ${count} n8n MCP tool${count === 1 ? "" : "s"}.`);
    await load();
  }

  async function disconnect() {
    setBusy("disconnect");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-RPC-name cast; clear_tenant_mcp_connection isn't in generated types; CI whole-file-lints changed files
    const { error } = await (supabase as any).rpc("clear_tenant_mcp_connection", { _vendor: "n8n" });
    setBusy(null);
    if (error) { toast.error("Couldn't disconnect."); return; }
    toast.success("Disconnected n8n MCP.");
    setEndpointUrl(""); setToken(""); setLabel("");
    await load();
  }

  const connected = conn?.configured && conn?.status === "connected";
  const errored = conn?.configured && conn?.status === "error";
  const toolCount = Array.isArray(conn?.tools_cache) ? conn!.tools_cache!.length : null;

  return (
    <PageShell width="narrow">
      <PageHeader
        icon={Workflow}
        title="n8n"
        description="Connect your n8n MCP endpoint and Paige can run the tools you publish on it — on your behalf. Your token is encrypted and never leaves the server."
      />

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
      ) : conn?.configured ? (
        <SectionCard
          icon={Plug}
          title={conn.label || "n8n MCP endpoint"}
          description={conn.server_url_host || undefined}
          actions={
            connected ? <StatePill state="on">Connected</StatePill>
              : errored ? <StatePill state="error">Can't reach</StatePill>
              : <StatePill state="pending">Saved</StatePill>
          }
        >
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">Bearer token</dt>
                <dd className="font-medium text-foreground">•••• {conn.auth_token_last4 || "----"}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">Transport</dt>
                <dd className="font-medium uppercase text-foreground">{conn.transport || "http"}</dd>
              </div>
              {toolCount !== null && (
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Tools</dt>
                  <dd className="font-medium tabular-nums text-foreground">{toolCount}</dd>
                </div>
              )}
              {conn.last_probed_at && (
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd className="font-medium text-foreground">{new Date(conn.last_probed_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
            {errored && conn.last_error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{conn.last_error}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={testConnection} disabled={busy !== null}>
                {busy === "test" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}
                Test again
              </Button>
              <Button variant="ghost" onClick={disconnect} disabled={busy !== null} className="text-muted-foreground">
                {busy === "disconnect" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Unplug className="mr-1.5 h-4 w-4" />}
                Disconnect
              </Button>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionCard icon={Plug} title="Connect your n8n MCP endpoint" description="In n8n, add an MCP Server Trigger node, publish the tools you want Paige to run, then paste its endpoint URL and Bearer token here. Admin only.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="n8n-mcp-url">n8n MCP endpoint URL</Label>
              {/* name/type deliberately non-email so browsers never autofill a saved account email into this field (#377) */}
              <Input
                id="n8n-mcp-url"
                name="n8n-mcp-endpoint-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://your-instance.app.n8n.cloud/mcp/…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n8n-mcp-token">Bearer token</Label>
              <Input id="n8n-mcp-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="the token from your MCP Server Trigger credential" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n8n-mcp-label">Label <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="n8n-mcp-label" name="n8n-mcp-connection-label" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Production" />
            </div>
            <Button variant="gold" onClick={connect} disabled={busy !== null || !endpointUrl.trim() || !token.trim()}>
              {busy === "connect" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plug className="mr-1.5 h-4 w-4" />}
              Connect &amp; test
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Retained, re-addable REST (API-key) connect path — hidden per Option 2 (owner ruling).
          Rendered only if the owner flips REST_CONNECT_ENABLED. Paige keeps full REST n8n
          management under the hood regardless; this is only the operator-facing connect form. */}
      {REST_CONNECT_ENABLED && <RestN8nConnectForm />}
    </PageShell>
  );
}

// ── Retained REST (API-key) connect form (Option 2: hidden but re-addable) ──────────
// Self-contained so it holds its own state and never interferes with the MCP-first flow
// above. Wires to the untouched tenant_n8n_connections RPCs + paige-n8n edge function.
function RestN8nConnectForm() {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-RPC-name cast; retained REST path; CI whole-file-lints changed files
    const { error: setErr } = await (supabase as any).rpc("set_tenant_n8n_connection", {
      _base_url: baseUrl.trim(), _api_key: apiKey.trim(), _label: label.trim() || null,
    });
    if (setErr) { setBusy(false); toast.error("Couldn't save the n8n API connection."); return; }
    await supabase.functions.invoke("paige-n8n", { body: { action: "test" } });
    setBusy(false); setApiKey("");
    toast.success("Saved n8n API connection.");
  }

  return (
    <SectionCard icon={Plug} title="Connect n8n by API key" description="Paste your instance URL and an n8n API key (n8n → Settings → API). Admin only.">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="n8n-rest-url">Instance URL</Label>
          <Input
            id="n8n-rest-url"
            name="n8n-instance-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-instance.app.n8n.cloud"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n8n-rest-key">API key</Label>
          <Input id="n8n-rest-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="n8n_api_..." autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="n8n-rest-label">Label <span className="text-muted-foreground">(optional)</span></Label>
          <Input id="n8n-rest-label" name="n8n-connection-label" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Production" />
        </div>
        <Button variant="gold" onClick={connect} disabled={busy || !baseUrl.trim() || !apiKey.trim()}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plug className="mr-1.5 h-4 w-4" />}
          Connect &amp; test
        </Button>
      </div>
    </SectionCard>
  );
}
