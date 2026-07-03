import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";

interface Run {
  id: string;
  status: string;
  composite_score: number | null;
  summary: Record<string, number>;
  mismatches: Array<{ source: string; fields: string[] }>;
  created_at: string;
}

interface VerifyRow {
  id: string;
  source: string;
  source_kind: string;
  status: string;
  confidence: number | null;
  source_url: string | null;
  error: string | null;
}

export function BusinessVerificationCard({ businessId }: { businessId: string }) {
  const { toast } = useToast();
  const [run, setRun] = useState<Run | null>(null);
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data: latest } = await supabase
      .from("business_verification_runs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRun((latest as unknown as Run) ?? null);
    if (latest) {
      const { data: r } = await supabase
        .from("business_verifications")
        .select("*")
        .eq("run_id", (latest as { id: string }).id);
      setRows((r ?? []) as VerifyRow[]);
    }
  };

  useEffect(() => { load(); }, [businessId]);

  const runNow = async () => {
    setRunning(true);
    try {
      // Guard: confirm the business row still exists before invoking the verifier.
      // Prevents a stale local list from producing a 404 blank-screen surface.
      const { data: exists } = await supabase
        .from("businesses")
        .select("id")
        .eq("id", businessId)
        .maybeSingle();
      if (!exists) {
        toast({
          title: "Business not found",
          description: "This business record is no longer available. Refresh the contact.",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke("business-verifier", {
        body: { business_id: businessId, triggered_by: "admin" },
      });
      if (error) {
        let message = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const parsed = await error.context.response.json();
            message = parsed?.error || parsed?.message || message;
          } catch { /* keep default */ }
        }
        toast({ title: "Verification failed", description: message, variant: "destructive" });
        return;
      }
      const result = data as { ok?: boolean; error?: string; message?: string; composite_score?: number } | null;
      if (result?.ok === false) {
        toast({
          title: result.error === "BUSINESS_NOT_FOUND" ? "Business not found" : "Verification unavailable",
          description: result.message || "Business verification could not complete. Please retry.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Verification complete", description: `Score: ${result?.composite_score ?? "—"}` });
      load();
    } catch (e: any) {
      toast({ title: "Verification failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const ageMs = run?.created_at ? Date.now() - new Date(run.created_at).getTime() : null;
  const ageDays = ageMs !== null ? Math.floor(ageMs / 86400000) : null;
  const isStale = ageDays !== null && ageDays > 30;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-500" /> Business Verification</CardTitle>
        <Button
          size="sm"
          variant={isStale || !run ? "default" : "outline"}
          onClick={runNow}
          disabled={running}
          className="gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${running ? "animate-spin" : ""}`} />
          {isStale ? "Verify Now" : run ? "Re-verify" : "Verify Now"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!run ? (
          <p className="text-sm text-muted-foreground">No verification yet. Click Verify Now to scrape SoS, OpenCorporates, SEC, and other public sources.</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold">{run.composite_score ?? "—"}<span className="text-base text-muted-foreground">/100</span></div>
              <Badge variant={run.status === "succeeded" ? "default" : run.status === "partial" ? "secondary" : "destructive"}>{run.status}</Badge>
              <span className="text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString()}</span>
              {isStale && (
                <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-400">
                  Stale · {ageDays}d
                </Badge>
              )}
            </div>
            {isStale && (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs text-amber-800 dark:text-amber-300">
                Last verification is {ageDays} days old. Re-run for fresh registry + public-record data.
              </div>
            )}
            {run.mismatches?.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-2 text-sm">
                <div className="flex items-center gap-2 font-medium text-amber-700"><AlertTriangle className="h-4 w-4" /> Mismatches detected</div>
                <ul className="mt-1 text-xs">{run.mismatches.map((m, i) => <li key={i}>{m.source}: {m.fields.join(", ")}</li>)}</ul>
              </div>
            )}
            <div className="space-y-1">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{r.source}</span>
                    <Badge variant="outline" className="text-[10px]">{r.source_kind}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={r.status === "match" ? "default" : r.status === "unavailable" ? "secondary" : r.status === "error" ? "destructive" : "outline"}>{r.status}</Badge>
                    {r.confidence !== null && <span>{r.confidence}%</span>}
                    {r.source_url && <a href={r.source_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
