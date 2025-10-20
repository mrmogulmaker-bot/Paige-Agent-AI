import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Shield, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ComplianceDisclosureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  disclosureType: 'credit_report_access' | 'croa_rights_notice' | 'data_sharing_consent' | 'offer_display_disclaimer' | 'adverse_action_routing';
  onConsent: (granted: boolean, consentId?: string) => void;
}

export function ComplianceDisclosureDialog({
  isOpen,
  onClose,
  disclosureType,
  onConsent
}: ComplianceDisclosureDialogProps) {
  const [disclosure, setDisclosure] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDisclosure();
      setAgreed(false);
    }
  }, [isOpen, disclosureType]);

  const loadDisclosure = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('disclosure_templates')
        .select('*')
        .eq('disclosure_type', disclosureType)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      setDisclosure(data);
    } catch (error) {
      console.error('Error loading disclosure:', error);
      toast({
        title: "Error",
        description: "Failed to load disclosure. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (granted: boolean) => {
    if (!disclosure) return;

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error('Not authenticated');
      }

      const consentTypeMap: Record<string, string> = {
        'credit_report_access': 'credit_report_access',
        'croa_rights_notice': 'croa_rights',
        'data_sharing_consent': 'data_sharing',
        'offer_display_disclaimer': 'offer_display',
        'adverse_action_routing': 'adverse_action'
      };

      const response = await supabase.functions.invoke('log-consent', {
        body: {
          consentType: consentTypeMap[disclosureType],
          disclosureVersion: disclosure.version,
          granted,
          metadata: {
            disclosure_id: disclosure.id,
            disclosure_title: disclosure.title
          }
        }
      });

      if (response.error) throw response.error;

      onConsent(granted, response.data?.consentId);
      
      if (granted) {
        toast({
          title: "Consent Recorded",
          description: "Your consent has been securely logged."
        });
      }
      
      onClose();
    } catch (error) {
      console.error('Error logging consent:', error);
      toast({
        title: "Error",
        description: "Failed to record consent. Please try again.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-5 w-5 text-primary" />
            <DialogTitle>
              {loading ? "Loading..." : disclosure?.title || "Disclosure"}
            </DialogTitle>
          </div>
          <DialogDescription>
            Please read this important disclosure carefully before continuing.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : disclosure ? (
          <div className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This is a legally binding disclosure required by federal consumer finance regulations.
              </AlertDescription>
            </Alert>

            <div className="prose prose-sm max-w-none bg-muted p-4 rounded-lg border">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {disclosure.content}
              </p>
            </div>

            <div className="flex items-start space-x-3 py-4 border-t">
              <Checkbox
                id="agree"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked as boolean)}
                disabled={submitting}
              />
              <label
                htmlFor="agree"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                I have read and understand this disclosure, and I consent to the terms described above.
              </label>
            </div>
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load disclosure. Please try again or contact support.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={submitting || loading}
          >
            Decline
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            disabled={!agreed || submitting || loading}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording...
              </>
            ) : (
              "Accept & Continue"
            )}
          </Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground text-center pt-2 border-t">
          Your consent will be securely logged with timestamp, IP address, and session ID for compliance purposes.
          <br />
          Disclosure Version: {disclosure?.version} | Effective: {disclosure?.effective_date ? new Date(disclosure.effective_date).toLocaleDateString() : 'N/A'}
        </p>
      </DialogContent>
    </Dialog>
  );
}
