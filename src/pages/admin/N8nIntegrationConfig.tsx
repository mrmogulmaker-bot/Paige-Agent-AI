import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";

type Connection = {
  id: string;
  label: string;
  base_url: string;
  api_key_last4: string | null;
  api_key_ref: string | null;
  is_default: boolean;
  last_sync_at: string | null;
};

export default function N8nIntegrationConfig() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newBase, setNewBase] = useState("https://mrmogulmaker.app.n8n.cloud");
  const [newRef, setNewRef] = useState("N8N_API_KEY");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("paige_n8n_connections")
      .select("id, label, api_key_last4, api_key_ref, is_default, last_sync_at")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setConnections((data ?? []).map((d: any) => ({ ...d, base_url: "" })) as Connection[]);
  }

  useEffect(() => { void load(); }, []);

  async function createConnection() {
    if (!newLabel || !newBase) return;
    setBusy(true);
    const { data, error } = await supabase.from("paige_n8n_connections").insert({
      label: newLabel,
      api_key_ref: newRef,
      is_default: connections.length === 0,
    } as any).select("id").single();
    if (!error && data?.id) {
      await supabase.rpc("platform_set_n8n_base_url" as any, { _id: data.id, _url: newBase });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewLabel("");
    await load();
    toast.success("Connection added. Set the secret with the same name in Edge Functions.");
  }


  async function setDefault(id: string) {
    setBusy(true);
    await supabase.from("paige_n8n_connections").update({ is_default: false }).neq("id", id);
    const { error } = await supabase.from("paige_n8n_connections").update({ is_default: true }).eq("id", id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("paige_n8n_connections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  }

  async function syncWorkflows(id: string) {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("n8n-list-workflows", { body: { connection_id: id } });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Synced ${data?.upserted ?? 0} of ${data?.total ?? 0} workflows`);
    await load();
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">n8n Connections</h1>
        <p className="text-sm text-muted-foreground">Manage n8n instances that power Paige's workflow registry and Command Center.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add connection</CardTitle>
          <CardDescription>API keys live in Edge Function secrets. We store only a reference name and last 4.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Label</Label><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Production" /></div>
          <div className="space-y-1.5"><Label>Base URL</Label><Input value={newBase} onChange={(e) => setNewBase(e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>Secret name (Edge Functions env)</Label><Input value={newRef} onChange={(e) => setNewRef(e.target.value)} /></div>
          <div className="md:col-span-2"><Button onClick={createConnection} disabled={busy || !newLabel}><Plus className="size-4 mr-1" />Add</Button></div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {connections.map((c) => (
          <Card key={c.id}>
            <CardContent className="pt-6 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium">{c.label} {c.is_default && <Badge variant="default" className="ml-2">Default</Badge>}</div>
                <div className="text-xs text-muted-foreground">{c.base_url}</div>
                <div className="text-xs text-muted-foreground">Secret: <code>{c.api_key_ref ?? "—"}</code></div>
                {c.last_sync_at && <div className="text-xs text-muted-foreground">Last sync: {new Date(c.last_sync_at).toLocaleString()}</div>}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2"><Switch checked={c.is_default} onCheckedChange={() => setDefault(c.id)} disabled={busy} /><Label className="text-xs">Default</Label></div>
                <Button size="sm" variant="outline" onClick={() => syncWorkflows(c.id)} disabled={busy}><RefreshCw className="size-3 mr-1" />Sync</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(c.id)}>Remove</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {connections.length === 0 && <p className="text-sm text-muted-foreground">No connections yet.</p>}
      </div>
    </div>
  );
}
