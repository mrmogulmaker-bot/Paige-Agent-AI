import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function PlaidIntegrationConfig() {
  const [activated, setActivated] = useState(false);
  const [env, setEnv] = useState("sandbox");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("paige_config").select("plaid_activated, plaid_env").eq("id", 1).maybeSingle();
      setActivated(!!data?.plaid_activated);
      setEnv(data?.plaid_env ?? "sandbox");
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    const { error } = await (supabase as any).from("paige_config").update({ plaid_activated: activated, plaid_env: env }).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success("Saved");
  };

  if (!loaded) return null;
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Plaid Configuration</h1>
      <Card>
        <CardHeader><CardTitle>Activation</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={activated} onCheckedChange={setActivated} />
            <Label>Plaid activated</Label>
          </div>
          <div>
            <Label>Environment</Label>
            <Select value={env} onValueChange={setEnv}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save}>Save</Button>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Add these in Project Settings → Secrets when Antonio signs up: <code>PLAID_CLIENT_ID</code>, <code>PLAID_SECRET</code>.</p>
            <p>Webhook URL: <code>/functions/v1/handle-paige-plaid-webhook</code>.</p>
            <p>All scaffolding (tables, functions, UI) returns <code>activated:false</code> until the toggle above is on and secrets are present.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
