import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CalendarClock } from "lucide-react";

const EVENT_TYPES = ["vip_intro", "dfy_discovery", "coffee_hour", "workshop", "other"] as const;

export default function CalIntegrationConfig() {
  const [defaultId, setDefaultId] = useState("");
  const [mapJson, setMapJson] = useState("{}");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("paige_config").select("cal_default_event_type_id, cal_event_type_map").eq("id", 1).maybeSingle();
      setDefaultId(data?.cal_default_event_type_id ?? "");
      setMapJson(JSON.stringify(data?.cal_event_type_map ?? {}, null, 2));
    })();
  }, []);

  const save = async () => {
    let parsed: Record<string, string>;
    try { parsed = JSON.parse(mapJson || "{}"); } catch { toast.error("Invalid JSON"); return; }
    setSaving(true);
    const { error } = await supabase.from("paige_config").update({
      cal_default_event_type_id: defaultId || null,
      cal_event_type_map: parsed,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/handle-cal-webhook`;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Cal.com</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook setup</CardTitle>
          <CardDescription>
            Point your Cal.com webhook to the URL below. Subscribe to BOOKING_CREATED, BOOKING_CANCELLED,
            BOOKING_RESCHEDULED. Configure the shared secret as <code>CAL_WEBHOOK_SECRET</code> in project secrets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event type mapping</CardTitle>
          <CardDescription>
            Map Cal.com <code>eventTypeId</code> → our event_type. Used when a booking arrives via webhook.
            Allowed values: {EVENT_TYPES.join(", ")}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Default event type ID (fallback)</Label>
            <Input value={defaultId} onChange={(e) => setDefaultId(e.target.value)} placeholder="e.g. 12345" />
          </div>
          <div className="space-y-1">
            <Label>Event type map (JSON)</Label>
            <Textarea rows={8} value={mapJson} onChange={(e) => setMapJson(e.target.value)} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">{`Example: { "12345": "vip_intro", "67890": "dfy_discovery" }`}</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            <Button asChild variant="outline"><Link to="/admin/bookings">View bookings</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
