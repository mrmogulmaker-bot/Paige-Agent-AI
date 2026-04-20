import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DemographicQuestionsStep,
  EMPTY_ANSWERS,
  saveDemographicAnswers,
  type DemographicAnswers,
} from "@/components/onboarding/DemographicQuestionsStep";
import { toast } from "sonner";

const dismissKeyFor = (userId: string) => `unlock_programs_banner_dismissed_${userId}`;

interface Props {
  userId: string;
}

export function UnlockProgramsBanner({ userId }: Props) {
  const [show, setShow] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [answers, setAnswers] = useState<DemographicAnswers>(EMPTY_ANSWERS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    if (typeof window !== "undefined" && localStorage.getItem(dismissKeyFor(userId)) === "true") return;

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select(
          "gender_identity, ethnicity, is_veteran, is_service_disabled_veteran, is_us_citizen",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;
      const empty =
        !data ||
        ((data as any).gender_identity == null &&
          (!(data as any).ethnicity || ((data as any).ethnicity as string[]).length === 0) &&
          (data as any).is_veteran == null &&
          (data as any).is_service_disabled_veteran == null &&
          (data as any).is_us_citizen == null);

      if (empty) setShow(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch {}
    setShow(false);
  };

  const submit = async () => {
    setSaving(true);
    try {
      await saveDemographicAnswers(supabase, userId, answers);
      toast.success("Profile updated — Paige will surface targeted programs in your next chat");
      try { localStorage.setItem(DISMISS_KEY, "true"); } catch {}
      setDialogOpen(false);
      setShow(false);
    } catch {
      toast.error("Couldn't save your answers");
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <>
      <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent">
        <CardContent className="py-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-gold flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">Unlock Programs Built For You</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Some of the most powerful funding programs in the country — 8(a), WOSB, VetCert, CDFI lenders — are designed for specific business owners. Sharing a bit about yourself helps Paige surface what you qualify for. Takes ~60 seconds.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-gradient-gold">
              Get Started
            </Button>
            <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Unlock Programs Built For You</DialogTitle>
          </DialogHeader>
          <DemographicQuestionsStep answers={answers} onChange={setAnswers} onSkipAll={() => { dismiss(); setDialogOpen(false); }} />
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-gradient-gold">
              {saving ? "Saving…" : "Save & Unlock Programs"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
