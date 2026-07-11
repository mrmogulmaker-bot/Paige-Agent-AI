import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Workflow, Loader2, Plug, RefreshCw, Unplug } from "lucide-react";

type ConnStatus = {
  configured: boolean;
  label?: string | null;
  base_url?: string | null;
  api_key_last4?: string | null;
  status?: "unconfigured" | "connected" | "error";
  last_error?: string | null;
  last_sync_at?: string | null;
  workflow_count?: number;
};

export default function N8nIntegrationConfig() {
  const [conn, setConn] = useState<ConnStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "connect" | "test" | "disconnect">(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_tenant_n8n_connection");
    setLoading(false);
    if (error) { toast.error("Couldn't load your n8n connection."); return; }
    setConn(data as ConnStatus);
  }

  useEffect(() => { void load(); }, []);

  async function connect() {
    if (!baseUrl.trim() || !apiKey.trim()) return;
    setBusy("connect");
    const { error: setErr } = await (supabase as any).rpc("set_tenant_n8n_connection", {
      _base_url: baseUrl.trim(),
      _api_key: apiKey.trim(),
      _label: label.trim() || null,
    });
    if (setErr) {
      setBusy(null);
      // Surface the real reason instead of assuming it's a permissions problem —
      // the RPC raises specific messages (https required, admin required, etc.).
      const raw = setErr.message || "";
      const friendly =
        /https/i.test(raw) ? "Instance URL must start with https://" :
        /admin|forbidden|42501/i.test(raw) ? "You need admin access on this workspace to connect n8n." :
        /api key|no_key/i.test(raw) ? "An API key is required." :
        `Couldn't save the connection. ${raw}`.trim();
      toast.error(friendly);
      return;
    }
    // Immediately test the connection so the operator sees it's live.
    const { data: test, error: testErr } = await supabase.functions.invoke("paige-n8n", { body: { action: "test" } });
    setBusy(null);
    setApiKey("");
    if (testErr || (test as any)?.error) {
      toast.error("Saved, but couldn't reach n8n — check the URL and key.");
    } else {
      toast.success(`Connected — ${(test as any)?.workflow_count ?? 0} workflows found.`);
    }
    await load();
  }

  async function testConnection() {
    setBusy("test");
    const { data, error } = await supabase.functions.invoke("paige-n8n", { body: { action: "test" } });
    setBusy(null);
    if (error || (data as any)?.error) { toast.error("Couldn't reach n8n. Re-check the URL and key."); }
    else { toast.success(`Connected — ${(data as any)?.workflow_count ?? 0} workflows.`); }
    await load();
  }

  async function disconnect() {
    setBusy("disconnect");
    const { error } = await (supabase as any).rpc("clear_tenant_n8n_connection");
    setBusy(null);
    if (error) { toast.error("Couldn't disconnect."); return; }
    toast.success("Disconnected n8n.");
    setBaseUrl(""); setApiKey(""); setLabel("");
    await load();
  }

  const connected = conn?.configured && conn?.status === "connected";
  const errored = conn?.configured && conn?.status === "error";

  return (
    <PageShell width="prose">
      <PageHeader
        icon={Workflow}
        title="n8n"
        description="Connect your n8n account so Paige can run — and build — automations across all your tools on your behalf. Your key is encrypted and never leaves the server."
      />

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
      ) : conn?.configured ? (
        <SectionCard
          icon={Plug}
          title={conn.label || "n8n connection"}
          description={conn.base_url || undefined}
          actions={
            connected ? <StatePill state="on">Connected</StatePill>
              : errored ? <StatePill state="error">Can't reach</StatePill>
              : <StatePill state="pending">Saved</StatePill>
          }
        >
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">API key</dt>
                <dd className="font-medium text-foreground">•••• {conn.api_key_last4 || "----"}</dd>
              </div>
              <div className="flex justify-between sm:block">
                <dt className="text-muted-foreground">Workflows</dt>
                <dd className="font-medium text-foreground">{conn.workflow_count ?? 0}</dd>
              </div>
              {conn.last_sync_at && (
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Last checked</dt>
                  <dd className="font-medium text-foreground">{new Date(conn.last_sync_at).toLocaleString()}</dd>
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
        <SectionCard icon={Plug} title="Connect your n8n" description="Paste your instance URL and an n8n API key (n8n → Settings → API). Admin only.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="n8n-url">Instance URL</Label>
              <Input id="n8n-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-instance.app.n8n.cloud" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n8n-key">API key</Label>
              <Input id="n8n-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="n8n_api_..." autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n8n-label">Label <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="n8n-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Production" />
            </div>
            <Button variant="gold" onClick={connect} disabled={busy !== null || !baseUrl.trim() || !apiKey.trim()}>
              {busy === "connect" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plug className="mr-1.5 h-4 w-4" />}
              Connect &amp; test
            </Button>
          </div>
        </SectionCard>
      )}
    </PageShell>
  );
}
