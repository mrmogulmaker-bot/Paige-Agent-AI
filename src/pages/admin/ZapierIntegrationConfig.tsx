import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type Conn = {
  id: string;
  label: string;
  server_url: string;
  transport: string;
  auth_token_ref: string | null;
  enabled: boolean;
  tools_cache: unknown;
  last_probed_at: string | null;
};

export default function ZapierIntegrationConfig() {
  const [conns, setConns] = useState<Conn[]>([]);
  const [label, setLabel] = useState("Zapier");
  const [url, setUrl] = useState("");
  const [ref, setRef] = useState("ZAPIER_MCP_TOKEN");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("paige_mcp_connections")
      .select("id,label,server_url,transport,auth_token_ref,enabled,tools_cache,last_probed_at")
      .order("created_at", { ascending: true });
    setConns((data ?? []) as Conn[]);
  }

  useEffect(() => { void load(); }, []);

  async function add() {
    if (!label || !url) return;
    setBusy(true);
    const { error } = await supabase.from("paige_mcp_connections").insert({
      label, server_url: url, auth_token_ref: ref, transport: "http", enabled: true,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setLabel(""); setUrl("");
    await load();
  }

  async function toggle(id: string, enabled: boolean) {
    await supabase.from("paige_mcp_connections").update({ enabled }).eq("id", id);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("paige_mcp_connections").delete().eq("id", id);
    await load();
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Zapier MCP</h1>
        <p className="text-sm text-muted-foreground">Paige connects to Zapier's MCP server to access thousands of apps without native integrations.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Add MCP server</CardTitle>
          <CardDescription>Token stored as a secret in Edge Functions; we only record the reference name.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Label</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Server URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.zapier.com/mcp/..." /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Token secret name</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <div className="md:col-span-2"><Button onClick={add} disabled={busy || !url}><Plus className="size-4 mr-1" />Add</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {conns.map((c) => (
          <Card key={c.id}><CardContent className="pt-6 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium">{c.label} {c.enabled ? <Badge className="ml-2">Enabled</Badge> : <Badge variant="secondary" className="ml-2">Disabled</Badge>}</div>
              <div className="text-xs text-muted-foreground break-all">{c.server_url}</div>
              <div className="text-xs text-muted-foreground">Secret: <code>{c.auth_token_ref ?? "—"}</code></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c.id, v)} />
              <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>Remove</Button>
            </div>
          </CardContent></Card>
        ))}
        {conns.length === 0 && <p className="text-sm text-muted-foreground">No MCP connections yet.</p>}
      </div>
    </div>
  );
}
