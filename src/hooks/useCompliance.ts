import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type DisclosureType = 
  | 'credit_report_access'
  | 'croa_rights_notice'
  | 'data_sharing_consent'
  | 'offer_display_disclaimer'
  | 'adverse_action_routing';

export function useCompliance() {
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [currentDisclosure, setCurrentDisclosure] = useState<DisclosureType | null>(null);
  const [consentCallback, setConsentCallback] = useState<((granted: boolean, consentId?: string) => void) | null>(null);

  const requestConsent = async (
    disclosureType: DisclosureType,
    onConsent: (granted: boolean, consentId?: string) => void
  ) => {
    // Check if user already has valid consent for this session
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to continue.",
        variant: "destructive"
      });
      return;
    }

    // For now, always show disclosure
    // In future, could check sessionStorage for recent consent
    setCurrentDisclosure(disclosureType);
    setConsentCallback(() => onConsent);
    setShowDisclosure(true);
  };

  const handleConsent = (granted: boolean, consentId?: string) => {
    if (consentCallback) {
      consentCallback(granted, consentId);
    }
    setShowDisclosure(false);
    setCurrentDisclosure(null);
    setConsentCallback(null);
  };

  const requestDataDeletion = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please log in to request data deletion.",
          variant: "destructive"
        });
        return;
      }

      const response = await supabase.functions.invoke('request-data-deletion');
      
      if (response.error) throw response.error;

      toast({
        title: "Data Deletion Requested",
        description: response.data?.message || "Your request has been submitted successfully.",
      });

      return response.data;
    } catch (error) {
      console.error('Error requesting data deletion:', error);
      toast({
        title: "Error",
        description: "Failed to submit deletion request. Please try again.",
        variant: "destructive"
      });
    }
  };

  return {
    showDisclosure,
    currentDisclosure,
    requestConsent,
    handleConsent,
    requestDataDeletion
  };
}
