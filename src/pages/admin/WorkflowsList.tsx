import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Workflow } from "lucide-react";

const categoryLabel: Record<string, string> = {
  campaign: "Campaigns",
  customer_support: "Customer Support",
  admin: "Admin",
  analytics: "Analytics",
};

export default function WorkflowsList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paige_workflow_registry")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("label");
      setRows(data ?? []);
      setLoading(false);
    })();
  }, []);

  const grouped = rows.reduce<Record<string, any[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Workflow className="w-6 h-6" /> Workflows
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Command center for n8n automations Paige can trigger on demand.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/workflows/runs">Recent runs</Link>
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No workflows registered yet. Add them in the database
            (<code className="text-xs">paige_workflow_registry</code>) once the seed CSV arrives.
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="text-base">{categoryLabel[cat] ?? cat}</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((w) => (
              <Link
                key={w.id}
                to={`/admin/workflows/${w.key}`}
                className="block p-4 rounded-md border hover:border-accent hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{w.label}</div>
                  {w.requires_approval && (
                    <Badge variant="outline" className="text-[9px]">approval</Badge>
                  )}
                </div>
                {w.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{w.description}</p>
                )}
                <div className="mt-3 flex items-center gap-1 text-xs text-accent">
                  <Play className="w-3 h-3" /> Run
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
