import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VerificationStatus {
  isVerified: boolean;
  experian: boolean;
  equifax: boolean;
  transunion: boolean;
  expiresAt?: string;
  kbaCompleted: boolean;
}

export function useCreditVerification() {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>({
    isVerified: false,
    experian: false,
    equifax: false,
    transunion: false,
    kbaCompleted: false,
  });
  const [loading, setLoading] = useState(true);

  const fetchVerificationStatus = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("credit_report_verifications")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching verification:", error);
        setLoading(false);
        return;
      }

      if (data) {
        const isVerified = data.experian_verified && data.equifax_verified && data.transunion_verified;
        setVerificationStatus({
          isVerified,
          experian: data.experian_verified || false,
          equifax: data.equifax_verified || false,
          transunion: data.transunion_verified || false,
          expiresAt: data.experian_expires_at || undefined,
          kbaCompleted: data.kba_completed || false,
        });
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVerificationStatus();
  }, []);

  return {
    verificationStatus,
    loading,
    refetch: fetchVerificationStatus,
  };
}