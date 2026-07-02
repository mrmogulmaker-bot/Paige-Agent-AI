import { useState } from "react";
import { Sparkles, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Ship #3.5 — Customer-Scoped Paige (coach/admin view).
// Loads read-only, consent-gated context for one contact and asks grounded Paige.

interface Props {
  contactId: string;
}

export function ContactPaigePanel({ contactId }: Props) {
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [surfaces, setSurfaces] = useState<string[]>([]);
  const [consentBlock, setConsentBlock] = useState<string | null>(null);
  const [loadId, setLoadId] = useState<string | null>(null);

  async function ask() {
    const q = prompt.trim();
    if (!q) return;
    setRunning(true);
    setAnswer(null);
    setConsentBlock(null);
    setSurfaces([]);
    try {
      const { data, error } = await supabase.functions.invoke("paige-context-router", {
        body: { contact_id: contactId, user_prompt: q, scopes: ["contact"] },
      });
      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === "CONSENT_NOT_GRANTED") {
          setConsentBlock(data.message ?? "Customer has not consented to sharing context.");
        } else {
          toast.error(data?.message ?? data?.error ?? "Paige could not answer.");
        }
        return;
      }
      setAnswer(data.answer ?? "");
      setSurfaces(data.surfaces_used ?? []);
      setLoadId(data.load_id ?? null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Ask Paige about this contact
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Grounded answers only — Paige reads consented, RLS-scoped fields from this contact.
            Credit monitoring + building, never credit repair (Doctrine §194).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="e.g. Summarize where this client stands on funding readiness."
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

          {consentBlock && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" />
              <div>
                <div className="font-medium">Consent required</div>
                <div className="text-muted-foreground">{consentBlock}</div>
              </div>
            </div>
          )}

          {answer && (
            <div className="space-y-2">
              <div className="rounded-md border bg-muted/30 p-3 whitespace-pre-wrap text-sm">
                {answer}
              </div>
              {surfaces.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center text-xs text-muted-foreground">
                  <ShieldCheck className="h-3 w-3" />
                  <span>Sources:</span>
                  {surfaces.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                  ))}
                  {loadId && <span className="ml-auto opacity-60">load: {loadId.slice(0, 8)}</span>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ContactPaigePanel;
