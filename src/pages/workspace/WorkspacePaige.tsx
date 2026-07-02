import { useEffect, useState } from "react";
import { Sparkles, Loader2, ShieldCheck, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Ship #3.5 — Self-service Customer-Scoped Paige for end users.
// Mounted at /workspace/paige. Only ever loads the caller's own record.

export default function WorkspacePaige() {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [consent, setConsent] = useState<boolean>(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [activity, setActivity] = useState<{ count: number; last_at: string | null } | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);

  useEffect(() => { void loadState(); }, []);

  async function loadState() {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { data: client } = await supabase
      .from("clients")
      .select("id,paige_shared_context_consent")
      .eq("linked_user_id", u.user.id)
      .maybeSingle();
    if (client) {
      setContactId(client.id);
      setConsent(!!client.paige_shared_context_consent);
    }
    const { data: act } = await supabase.rpc("customer_paige_activity_summary", { p_days: 7 });
    const a = act as { ok?: boolean; count?: number; last_at?: string | null } | null;
    if (a?.ok) setActivity({ count: a.count ?? 0, last_at: a.last_at ?? null });
  }

  async function toggleConsent(next: boolean) {
    if (!contactId) return;
    setConsentSaving(true);
    const { error } = await supabase
      .from("clients")
      .update({
        paige_shared_context_consent: next,
        paige_shared_context_consent_updated_at: new Date().toISOString(),
      })
      .eq("id", contactId);
    setConsentSaving(false);
    if (error) { toast.error(error.message); return; }
    setConsent(next);
    toast.success(next ? "Coach access enabled" : "Coach access disabled");
  }

  async function ask() {
    const q = prompt.trim();
    if (!q) return;
    setRunning(true);
    setAnswer(null);
    setSurfaces([]);
    try {
      const { data, error } = await supabase.functions.invoke("paige-context-router", {
        body: { self: true, user_prompt: q },
      });
      if (error) throw error;
      if (!data?.ok) { toast.error(data?.message ?? data?.error ?? "Paige could not answer."); return; }
      setAnswer(data.answer ?? "");
      setSurfaces(data.surfaces_used ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      toast.error(msg);
    } finally { setRunning(false); }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Your Paige
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ask about your credit journey, funding readiness, or next steps. Paige answers only from your own data.
            Credit monitoring + building — never credit repair.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="e.g. What should I focus on this week to improve my funding readiness?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            disabled={running}
          />
          <div className="flex justify-end">
            <Button onClick={ask} disabled={running || !prompt.trim()}>
              {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Ask Paige
            </Button>
          </div>
          {answer && (
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap text-sm">{answer}</div>
              {surfaces.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center text-xs text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Sources:</span>
                  {surfaces.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Privacy &amp; coach access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium">Allow my coach to ask Paige about my data</div>
              <div className="text-xs text-muted-foreground">
                Off by default. When enabled, your coach can request grounded summaries from your record. Every request is logged below.
              </div>
            </div>
            <Switch checked={consent} onCheckedChange={toggleConsent} disabled={consentSaving || !contactId} />
          </div>
          <div className="rounded-md border p-3 flex items-center gap-3 text-sm">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              Your coach chatted with Paige about you{" "}
              <span className="font-medium">{activity?.count ?? 0}</span> time{(activity?.count ?? 0) === 1 ? "" : "s"} this week.
            </div>
            {activity?.last_at && (
              <span className="text-xs text-muted-foreground">
                last: {new Date(activity.last_at).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
