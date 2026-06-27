import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function GhlIntegrationConfig() {
  const [locationId, setLocationId] = useState("");
  const [pitRef, setPitRef] = useState("GHL_PIT");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("paige_config").select("ghl_location_id, ghl_pit_ref").eq("id", 1).maybeSingle();
      if (data) {
        setLocationId(data.ghl_location_id ?? "");
        setPitRef(data.ghl_pit_ref ?? "GHL_PIT");
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("paige_config").upsert({
      id: 1,
      ghl_location_id: locationId,
      ghl_pit_ref: pitRef,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("GHL config saved");
  }

  async function testRead() {
    const { data, error } = await supabase.functions.invoke("ghl-get-contacts", { body: { limit: 1 } });
    if (error) return toast.error(error.message);
    toast.success(`OK — pulled ${data?.contacts?.length ?? 0} contact(s)`);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">GoHighLevel Pipe</h1>
        <p className="text-sm text-muted-foreground">Private Integration Token (PIT) and Location ID. The token itself lives as a secret in Edge Functions under the name set below.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Configuration</CardTitle><CardDescription>Used by ghl-get-contacts, ghl-send-email and ghl-send-sms.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label>Location ID</Label><Input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="Y8F9ygRHQSJ3zJbkQXuW" /></div>
          <div className="space-y-1.5"><Label>PIT secret name</Label><Input value={pitRef} onChange={(e) => setPitRef(e.target.value)} /></div>
          <div className="flex gap-2"><Button onClick={save} disabled={busy}>Save</Button><Button variant="outline" onClick={testRead}>Test read</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
