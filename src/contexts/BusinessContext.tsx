import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Multi-business support: BusinessContext
 *
 * Tracks the user's full list of business entities and the currently
 * "active" business that downstream panels (fundability, business credit,
 * QuickBooks, funding readiness) should render data for.
 *
 * The active business id is persisted in localStorage so navigation
 * across tabs keeps the selection.
 */

export interface BusinessSummary {
  id: string;
  legal_name: string;
  dba: string | null;
  entity_type: string | null;
  entity_role: string | null;
  business_type: string | null;
  parent_business_id: string | null;
  organizational_level: number | null;
  display_order: number | null;
  is_primary: boolean;
  is_active: boolean;
  ein: string | null;
  state_of_formation: string | null;
  formation_date: string | null;
  website: string | null;
  estimated_annual_revenue: number | null;
}

export interface BusinessLimit {
  max_businesses: number;
  additional_businesses_count: number;
  effective_limit: number;
  current_count: number;
  at_limit: boolean;
}

interface BusinessContextValue {
  businesses: BusinessSummary[];
  activeBusinessId: string | null;
  activeBusiness: BusinessSummary | null;
  setActiveBusinessId: (id: string | null) => void;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
  limit: BusinessLimit | null;
}

const STORAGE_KEY = "paige.activeBusinessId";

const BusinessContext = createContext<BusinessContextValue | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setUserId(session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const businessesQuery = useQuery({
    queryKey: ["user-businesses", userId],
    enabled: !!userId,
    queryFn: async (): Promise<BusinessSummary[]> => {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id, legal_name, dba, entity_type, entity_role, business_type, parent_business_id, organizational_level, display_order, is_primary, is_active, ein, state_of_formation, formation_date, website, estimated_annual_revenue"
        )
        .eq("owner_user_id", userId!)
        .order("is_primary", { ascending: false })
        .order("organizational_level", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BusinessSummary[];
    },
  });

  const limitQuery = useQuery({
    queryKey: ["user-business-limit", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_business_limits")
        .select("max_businesses, additional_businesses_count")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const businesses = useMemo(() => businessesQuery.data ?? [], [businessesQuery.data]);

  // Pick the right active business: stored selection (if still valid),
  // otherwise primary, otherwise first.
  useEffect(() => {
    if (!businesses.length) {
      if (activeBusinessId !== null) setActiveBusinessIdState(null);
      return;
    }
    const stillValid = activeBusinessId && businesses.some((b) => b.id === activeBusinessId);
    if (stillValid) return;
    const primary = businesses.find((b) => b.is_primary && b.is_active) ?? businesses[0];
    setActiveBusinessIdState(primary.id);
  }, [businesses, activeBusinessId]);

  const setActiveBusinessId = useCallback((id: string | null) => {
    setActiveBusinessIdState(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeBusinessId) ?? null,
    [businesses, activeBusinessId]
  );

  const limit: BusinessLimit | null = useMemo(() => {
    if (!limitQuery.data) {
      // Conservative default — single business until the row arrives.
      const effective = 1;
      return {
        max_businesses: 1,
        additional_businesses_count: 0,
        effective_limit: effective,
        current_count: businesses.length,
        at_limit: businesses.length >= effective,
      };
    }
    const max = limitQuery.data.max_businesses ?? 1;
    const add = limitQuery.data.additional_businesses_count ?? 0;
    const effective = max + add;
    return {
      max_businesses: max,
      additional_businesses_count: add,
      effective_limit: effective,
      current_count: businesses.length,
      at_limit: businesses.length >= effective,
    };
  }, [limitQuery.data, businesses.length]);

  const refetch = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["user-businesses", userId] }),
      qc.invalidateQueries({ queryKey: ["user-business-limit", userId] }),
    ]);
  }, [qc, userId]);

  const value: BusinessContextValue = {
    businesses,
    activeBusinessId,
    activeBusiness,
    setActiveBusinessId,
    isLoading: businessesQuery.isLoading || limitQuery.isLoading,
    refetch,
    limit,
  };

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider — return empty
    // state instead of throwing so we don't crash legacy pages.
    return {
      businesses: [],
      activeBusinessId: null,
      activeBusiness: null,
      setActiveBusinessId: () => undefined,
      isLoading: false,
      refetch: async () => undefined,
      limit: null,
    };
  }
  return ctx;
}

export const ENTITY_ROLE_LABELS: Record<string, string> = {
  holdco: "HoldCo",
  opco: "OpCo",
  asset_co: "Asset Co",
  management_co: "Management Co",
  real_estate_co: "Real Estate Co",
  media_co: "Media Co",
  other: "Other",
};

export function entityRoleLabel(role: string | null | undefined): string {
  if (!role) return "Entity";
  return ENTITY_ROLE_LABELS[role] ?? role;
}
