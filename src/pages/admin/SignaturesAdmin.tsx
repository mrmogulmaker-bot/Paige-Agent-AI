import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { FileSignature, ExternalLink } from "lucide-react";

type Envelope = {
  id: string;
  envelope_id: string;
  envelope_type: string;
  status: string;
  sent_at: string;
  signed_at: string | null;
  completed_pdf_url: string | null;
  contact_id: string | null;
};

const STATUSES = ["all", "sent", "delivered", "completed", "declined", "voided"];

export default function SignaturesAdmin() {
  const [rows, setRows] = useState<Envelope[]>([]);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      let query = supabase
        .from("paige_signature_envelopes")
        .select("id, envelope_id, envelope_type, status, sent_at, signed_at, completed_pdf_url, contact_id")
        .order("sent_at", { ascending: false })
        .limit(200);
      if (status !== "all") query = query.eq("status", status as any);
      const { data } = await query;
      setRows((data ?? []) as Envelope[]);
    })();
  }, [status]);

  const filtered = useMemo(
    () => rows.filter((r) => !q || r.envelope_id.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  );

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileSignature className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Signatures</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All envelopes</CardTitle>
          <CardDescription>Search and filter signature envelopes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Search envelope ID..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No envelopes match.</p>}
            {filtered.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="space-y-1 min-w-0">
                  <div className="font-mono text-xs text-muted-foreground truncate">{r.envelope_id}</div>
                  <div className="capitalize">{r.envelope_type.replace(/_/g, " ")} · sent {new Date(r.sent_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
                  {r.completed_pdf_url && (
                    <Button asChild size="sm" variant="outline" className="gap-1">
                      <a href={r.completed_pdf_url} target="_blank" rel="noreferrer">PDF <ExternalLink className="size-3" /></a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
