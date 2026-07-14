import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

type Row = {
  id: string;
  contact_id: string;
  business_name: string | null;
  ein: string | null;
  scores: Record<string, number> | null;
  last_pulled_at: string | null;
};

export default function BusinessCreditAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("paige_business_credit_profiles")
      .select("id, contact_id, business_name, ein, scores, last_pulled_at")
      .order("last_pulled_at", { ascending: false, nullsFirst: true });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const pullNow = async (contact_id: string) => {
    toast.info("Triggering Nav pull…");
    const { data, error } = await supabase.functions.invoke("nav-pull-profile", { body: { contact_id } });
    if (error) return toast.error(error.message);
    if ((data as any)?.activated === false) toast.warning((data as any).message);
    else toast.success("Profile refreshed");
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6" />
        <h1 className="text-2xl font-semibold">Business Credit Monitoring</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Nav.com business credit profiles for monitored MMA contacts. Threshold-based alerts
        push to Paige Agent AI via <code>business_credit_score_changed</code>.
      </p>
      <Card>
        <CardHeader><CardTitle>Monitored businesses</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No profiles yet. Pull from a contact detail page or call <code>nav-pull-profile</code>.</div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{r.business_name ?? "(unnamed)"}</div>
                    <div className="text-xs text-muted-foreground">
                      EIN {r.ein ?? "—"} · last pulled {r.last_pulled_at ? new Date(r.last_pulled_at).toLocaleString() : "never"}
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {Object.entries(r.scores ?? {}).map(([k, v]) => (
                        <Badge key={k} variant="secondary">{k}: {v}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => pullNow(r.contact_id)}>Pull now</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
