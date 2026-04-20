import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const CONSENT_VERSION = "v1.0";

const CONSENT_TEXT = `I authorize PaigeAgent and its credit data partner (iSoftpull) to obtain my consumer credit report from one or more of the major consumer credit reporting agencies (Experian, TransUnion, Equifax) for the purpose of credit monitoring, education, and coaching within this platform.

I understand:
• This is a soft inquiry and will NOT affect my credit score.
• My report will be used only for the services I have requested.
• I may withdraw this authorization at any time by contacting support.
• This authorization complies with the Fair Credit Reporting Act (FCRA, 15 U.S.C. §1681b).`;

export function SoftPullAuthorizationCard() {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAuthorize = async () => {
    if (!acknowledged) {
      toast.error("Please acknowledge the consent statement.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("isoftpull-soft-pull", {
        body: {
          consent_text_version: CONSENT_VERSION,
          consent_acknowledged_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      const msg =
        (data as any)?.message ||
        "Authorization recorded. Your soft pull will process shortly.";
      toast.success(msg);
      setOpen(false);
      setAcknowledged(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authorization failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="border-primary/30 bg-gradient-to-br from-card to-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/15 text-primary flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Soft Pull Your Consumer Credit
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/40 text-[10px] gap-1">
                    <Sparkles className="w-3 h-3" /> Powered by iSoftpull
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Authorize a soft inquiry — no impact to your score — so Paige can pull your latest 3-bureau consumer report directly.
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Authorize Soft Pull
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-3 text-[11px] text-muted-foreground">
          FCRA §604 compliant · Soft inquiry · Your data is encrypted and never sold.
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Authorize Soft Credit Pull</DialogTitle>
            <DialogDescription>
              Read and accept the FCRA consent statement below to proceed.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/50 border border-border rounded-md p-3 max-h-64 overflow-y-auto text-xs whitespace-pre-line text-foreground">
            {CONSENT_TEXT}
          </div>

          <div className="flex items-start gap-2 pt-1">
            <Checkbox
              id="soft-pull-consent"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <label htmlFor="soft-pull-consent" className="text-xs text-foreground leading-snug cursor-pointer">
              I have read, understood, and authorize PaigeAgent and iSoftpull to obtain my consumer credit report as described above. ({CONSENT_VERSION})
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleAuthorize}
              disabled={!acknowledged || submitting}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Authorize & Pull Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
