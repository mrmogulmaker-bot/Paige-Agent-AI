import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function NavIntegrationConfig() {
  const [partnerId, setPartnerId] = useState("");
  const [delta, setDelta] = useState(20);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("paige_config").select("nav_partner_id, nav_threshold_delta").eq("id", 1).maybeSingle();
      setPartnerId(data?.nav_partner_id ?? "");
      setDelta(data?.nav_threshold_delta ?? 20);
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    const { error } = await (supabase as any).from("paige_config").update({ nav_partner_id: partnerId, nav_threshold_delta: delta }).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  if (!loaded) return null;
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Nav.com Configuration</h1>
      <Card>
        <CardHeader><CardTitle>Partner credentials</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Partner ID</Label>
            <Input value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="nav_partner_…" />
          </div>
          <div>
            <Label>Score-change alert threshold (points)</Label>
            <Input type="number" value={delta} onChange={(e) => setDelta(parseInt(e.target.value || "0", 10))} />
            <p className="text-xs text-muted-foreground mt-1">
              When any score moves by this amount, Paige fires <code>business_credit_score_changed</code> to Paige Agent AI.
            </p>
          </div>
          <Button onClick={save}>Save</Button>
          <p className="text-xs text-muted-foreground">
            Add <code>NAV_API_KEY</code> and <code>NAV_PARTNER_ID</code> in Project Settings → Secrets to enable live pulls.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
