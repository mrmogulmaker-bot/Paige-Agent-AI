import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { UserSearch } from "lucide-react";

type Row = {
  id: string;
  subject_type: string;
  subject_key: string;
  succeeded: boolean;
  error: string | null;
  payload: unknown;
  created_at: string;
};

export default function LeadsEnrichment() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("paige_enrichment_log")
        .select("id, subject_type, subject_key, succeeded, error, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data ?? []) as Row[]);
    })();
  }, []);

  const filtered = rows.filter((r) => !q || r.subject_key.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <UserSearch className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Lead Enrichment</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Last 200 Apollo enrichment attempts. Failures are kept for diagnosis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Search email or domain..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No enrichments.</p>}
            {filtered.map((r) => (
              <details key={r.id} className="rounded-md border p-3 text-sm">
                <summary className="flex items-center justify-between cursor-pointer">
                  <div className="space-y-1 min-w-0">
                    <div className="font-medium truncate">{r.subject_key}</div>
                    <div className="text-xs text-muted-foreground capitalize">{r.subject_type} · {new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <Badge variant={r.succeeded ? "default" : "destructive"}>{r.succeeded ? "ok" : "failed"}</Badge>
                </summary>
                {r.error && <div className="mt-2 text-xs text-destructive">{r.error}</div>}
                <pre className="mt-2 rounded-md bg-muted/40 p-2 text-xs overflow-x-auto max-h-64">{JSON.stringify(r.payload, null, 2)}</pre>
              </details>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
