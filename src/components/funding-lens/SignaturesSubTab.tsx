import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileSignature, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";

type Envelope = {
  id: string;
  envelope_id: string;
  envelope_type: string;
  status: string;
  sent_at: string;
  signed_at: string | null;
  completed_pdf_url: string | null;
};

export function SignaturesSubTab({
  contactId, mode = "admin",
}: { contactId: string; mode?: "admin" | "client" }) {
  const [rows, setRows] = useState<Envelope[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("paige_signature_envelopes")
        .select("id, envelope_id, envelope_type, status, sent_at, signed_at, completed_pdf_url")
        .eq("contact_id", contactId)
        .order("sent_at", { ascending: false })
        .limit(50);
      if (!cancel) {
        setRows((data || []) as Envelope[]);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [contactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading signatures…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <FileSignature className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {mode === "client"
            ? "You have no agreements waiting on a signature right now."
            : "No envelopes have been sent to this contact yet."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm bg-card">
          <div className="space-y-1 min-w-0 pr-4">
            <div className="font-medium capitalize">{r.envelope_type.replace(/_/g, " ")}</div>
            <div className="text-xs text-muted-foreground">
              Sent {format(new Date(r.sent_at), "MMM d, yyyy")}
              {r.signed_at && ` · Signed ${format(new Date(r.signed_at), "MMM d, yyyy")}`}
            </div>
            {mode === "admin" && (
              <div className="font-mono text-[10px] text-muted-foreground truncate">{r.envelope_id}</div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={r.status === "completed" ? "default" : "secondary"} className="capitalize">
              {r.status}
            </Badge>
            {r.completed_pdf_url && (
              <Button asChild size="sm" variant="outline" className="gap-1">
                <a href={r.completed_pdf_url} target="_blank" rel="noreferrer">
                  PDF <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
