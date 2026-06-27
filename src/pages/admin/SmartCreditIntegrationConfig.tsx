import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

export default function SmartCreditIntegrationConfig() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("paige_config").select("smartcredit_enabled").eq("id", 1).maybeSingle();
      setEnabled(!!data?.smartcredit_enabled);
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    const { error } = await (supabase as any).from("paige_config").update({ smartcredit_enabled: enabled }).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  if (!loaded) return null;
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">SmartCredit Configuration</h1>
      <Card className="border-amber-300 bg-amber-50/40">
        <CardContent className="flex gap-3 pt-6">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium">Funding eligibility lens only</div>
            <p className="text-muted-foreground">
              SmartCredit data is restricted to assessing business funding readiness for the business owner.
              Paige will <strong>not</strong> generate dispute letters, run FCRA workflows, or perform any
              CROA-classified consumer credit repair work. The edge function hard-rejects dispute/repair fields.
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Enable integration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label>SmartCredit pulls enabled</Label>
          </div>
          <Button onClick={save}>Save</Button>
          <p className="text-xs text-muted-foreground">
            Add <code>SMARTCREDIT_API_KEY</code> and <code>SMARTCREDIT_WEBHOOK_SECRET</code> in Project Settings → Secrets.
            Webhook URL: <code>/functions/v1/handle-smartcredit-alert-webhook</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
