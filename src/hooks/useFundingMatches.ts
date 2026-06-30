import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUserId } from "@/lib/scopedUser";

export function useFundingMatches() {
  const queryClient = useQueryClient();

  const { data: matches, isLoading } = useQuery({
    queryKey: ["funding-matches"],
    queryFn: async () => {
      const __uid = await getEffectiveUserId();
      if (!__uid) return null;
      const session = { user: { id: __uid } } as any;

      const { data, error } = await supabase
        .from("user_funding_matches")
        .select("*, lender_products(*)")
        .eq("user_id", session.user.id)
        .order("match_score", { ascending: false });

      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const runMatch = useMutation({
    mutationFn: async () => {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const session = { user: { id: __uid } } as any;

      const response = await supabase.functions.invoke("match-funding-products", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funding-matches"] });
    },
  });

  const eligible = matches?.filter((m: any) => m.match_status === "eligible") || [];
  const nearEligible = matches?.filter((m: any) => m.match_status === "near_eligible") || [];
  const totalEstimated = eligible.reduce((sum: number, m: any) => sum + (m.estimated_approval_amount || 0), 0);

  return { matches, eligible, nearEligible, totalEstimated, isLoading, runMatch };
}

export function useFundingProjections() {
  const queryClient = useQueryClient();

  const { data: projections, isLoading } = useQuery({
    queryKey: ["funding-projections"],
    queryFn: async () => {
      const __uid = await getEffectiveUserId();
      if (!__uid) return null;
      const session = { user: { id: __uid } } as any;

      const { data, error } = await supabase
        .from("funding_projections")
        .select("*")
        .eq("user_id", session.user.id)
        .order("calculated_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const createProjection = useMutation({
    mutationFn: async ({ scenario_name, scenario_params }: { scenario_name: string; scenario_params: any }) => {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const session = { user: { id: __uid } } as any;

      const response = await supabase.functions.invoke("generate-funding-projection", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { scenario_name, scenario_params },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["funding-projections"] });
    },
  });

  return { projections, isLoading, createProjection };
}
