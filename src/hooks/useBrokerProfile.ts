// useBrokerProfile — load the current user's broker_profiles row + role flags.
// Used by BrokerWorkspace to gate access and read referral_code / business_name.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BrokerProfile {
  id: string;
  user_id: string;
  business_name: string;
  broker_type: string;
  referral_code: string | null;
  broker_client_discount_code: string | null;
  status: string;
  monthly_fee: number;
  client_count: number;
  current_client_count: number;
  approved_at: string | null;
  bio: string | null;
  website: string | null;
  license_number: string | null;
}

export function useBrokerProfile() {
  const [profile, setProfile] = useState<BrokerProfile | null>(null);
  const [isBroker, setIsBroker] = useState(false);
  const [hasBrokerAccess, setHasBrokerAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProfile(null);
        setIsBroker(false);
        setHasBrokerAccess(false);
        return;
      }
      const [{ data: broker }, { data: roles }, { data: profileRow }] = await Promise.all([
        supabase
          .from("broker_profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("has_broker_access")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      const roleList = (roles || []).map((r: any) => r.role);
      const grantedAccess = !!(profileRow as any)?.has_broker_access;
      setHasBrokerAccess(grantedAccess);
      // A user can use the broker workspace if they're a broker by role,
      // already have a broker profile row, OR have been granted broker access
      // (admin/coach with a broker_profiles row).
      setIsBroker(
        roleList.includes("broker") ||
        !!broker?.id ||
        (grantedAccess && !!broker?.id)
      );
      setProfile((broker as BrokerProfile) ?? null);
    } catch (err: any) {
      setError(err?.message || "Failed to load broker profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  return { profile, isBroker, hasBrokerAccess, loading, error, reload };
}
