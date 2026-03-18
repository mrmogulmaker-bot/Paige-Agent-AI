import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCreditFactors() {
  const queryClient = useQueryClient();

  const { data: factors, isLoading } = useQuery({
    queryKey: ["credit-factors"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data, error } = await supabase
        .from("credit_factor_scores")
        .select("*")
        .eq("user_id", session.user.id)
        .order("calculated_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      return (data as any)?.[0] || null;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["credit-factors-history"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];

      const { data, error } = await supabase
        .from("credit_factor_scores")
        .select("*")
        .eq("user_id", session.user.id)
        .order("calculated_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const recalculate = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("calculate-credit-factors", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-factors"] });
      queryClient.invalidateQueries({ queryKey: ["credit-factors-history"] });
    },
  });

  return { factors, history, isLoading, recalculate };
}
