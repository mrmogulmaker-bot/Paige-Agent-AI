import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserSearch } from "lucide-react";

export default function ApolloIntegrationConfig() {
  const [autoEnrich, setAutoEnrich] = useState(true);
  const [email, setEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("paige_config").select("apollo_auto_enrich").eq("id", 1).maybeSingle();
      setAutoEnrich(data?.apollo_auto_enrich ?? true);
    })();
  }, []);

  const toggleAuto = async (v: boolean) => {
    setAutoEnrich(v);
    const { error } = await supabase.from("paige_config").update({ apollo_auto_enrich: v }).eq("id", 1);
    if (error) toast.error(error.message);
    else toast.success(v ? "Auto-enrich enabled" : "Auto-enrich disabled");
  };

  const enrichPerson = async () => {
    if (!email) return;
    setRunning(true); setResult(null);
    const { data, error } = await supabase.functions.invoke("apollo-enrich-person", { body: { email } });
    setRunning(false);
    if (error) toast.error(error.message);
    setResult(data ?? error);
  };
  const enrichCompany = async () => {
    if (!domain) return;
    setRunning(true); setResult(null);
    const { data, error } = await supabase.functions.invoke("apollo-enrich-company", { body: { domain } });
    setRunning(false);
    if (error) toast.error(error.message);
    setResult(data ?? error);
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <UserSearch className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Apollo Enrichment</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Auto-enrich new contacts</CardTitle>
          <CardDescription>
            When on, every new contact triggers a background Apollo person enrichment. Consumes Apollo credits per insert.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch checked={autoEnrich} onCheckedChange={toggleAuto} id="auto" />
          <Label htmlFor="auto">Auto-enrich on contact insert</Label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual lookup</CardTitle>
          <CardDescription>Test enrichment by email (person) or domain (company).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Person email</Label>
            <div className="flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="founder@example.com" />
              <Button onClick={enrichPerson} disabled={running}>Enrich</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Company domain</Label>
            <div className="flex gap-2">
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" />
              <Button onClick={enrichCompany} disabled={running}>Enrich</Button>
            </div>
          </div>
          {result != null && (
            <pre className="md:col-span-2 mt-2 rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
          )}
          <div className="md:col-span-2">
            <Button asChild variant="outline"><Link to="/admin/leads/enrichment">View enrichment history</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
