// useBrokerContext — single source of truth for the active broker workspace.
// Resolves whether the current user is a broker themselves (broker_profiles)
// OR a team member (broker_team_members.auth_user_id), and exposes the parent
// broker's id + business + permissions. Mounted at the workspace root and read
// via context provider so child components don't refetch.

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BrokerPermissions {
  can_add_clients: boolean;
  can_remove_clients: boolean;
  can_run_sessions: boolean;
  can_share_summaries: boolean;
  can_manage_team: boolean;
  can_view_commissions: boolean;
}

const ALL_TRUE: BrokerPermissions = {
  can_add_clients: true,
  can_remove_clients: true,
  can_run_sessions: true,
  can_share_summaries: true,
  can_manage_team: true,
  can_view_commissions: true,
};

const ALL_FALSE: BrokerPermissions = {
  can_add_clients: false,
  can_remove_clients: false,
  can_run_sessions: false,
  can_share_summaries: false,
  can_manage_team: false,
  can_view_commissions: false,
};

export interface ParentBrokerProfile {
  id: string;
  business_name: string;
  firm_description: string | null;
  referral_code: string | null;
  broker_client_discount_code: string | null;
}

export interface BrokerContextValue {
  loading: boolean;
  activeBrokerId: string | null;
  isTeamMember: boolean;
  teamMemberRole: "lead_broker" | "advisor" | "assistant" | null;
  teamMemberId: string | null;
  teamMemberName: string | null;
  permissions: BrokerPermissions;
  parentBrokerProfile: ParentBrokerProfile | null;
  reload: () => Promise<void>;
}

const defaultValue: BrokerContextValue = {
  loading: true,
  activeBrokerId: null,
  isTeamMember: false,
  teamMemberRole: null,
  teamMemberId: null,
  teamMemberName: null,
  permissions: ALL_FALSE,
  parentBrokerProfile: null,
  reload: async () => {},
};

const BrokerContext = createContext<BrokerContextValue>(defaultValue);

export const BrokerContextProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<BrokerContextValue>(defaultValue);

  const load = async () => {
    setState((s) => ({ ...s, loading: true }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState({ ...defaultValue, loading: false, reload: load });
      return;
    }

    // Try broker_profiles first (broker themselves).
    const { data: ownProfile } = await supabase
      .from("broker_profiles")
      .select("id, business_name, firm_description, referral_code, broker_client_discount_code")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownProfile?.id) {
      setState({
        loading: false,
        activeBrokerId: ownProfile.id,
        isTeamMember: false,
        teamMemberRole: null,
        teamMemberId: null,
        teamMemberName: null,
        permissions: ALL_TRUE,
        parentBrokerProfile: ownProfile as ParentBrokerProfile,
        reload: load,
      });
      return;
    }

    // Otherwise check team membership.
    const { data: teamRows } = await supabase.rpc("get_broker_team_member", {
      _auth_user_id: user.id,
    });
    const tm = (teamRows && (teamRows as any[])[0]) || null;
    if (tm) {
      const { data: parent } = await supabase
        .from("broker_profiles")
        .select("id, business_name, firm_description, referral_code, broker_client_discount_code")
        .eq("id", tm.broker_id)
        .maybeSingle();

      const perms = (tm.permissions as Partial<BrokerPermissions>) || {};
      setState({
        loading: false,
        activeBrokerId: tm.broker_id,
        isTeamMember: true,
        teamMemberRole: tm.role as any,
        teamMemberId: tm.id,
        teamMemberName: `${tm.first_name || ""} ${tm.last_name || ""}`.trim() || tm.email,
        permissions: { ...ALL_FALSE, ...perms },
        parentBrokerProfile: (parent as ParentBrokerProfile) ?? null,
        reload: load,
      });
      return;
    }

    setState({ ...defaultValue, loading: false, reload: load });
  };

  useEffect(() => {
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, _s) => {
      load();
    });
    return () => subscription.unsubscribe();
  }, []);

  return <BrokerContext.Provider value={state}>{children}</BrokerContext.Provider>;
};

export const useBrokerContext = () => useContext(BrokerContext);
