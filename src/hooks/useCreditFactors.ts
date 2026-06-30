import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads credit factor scores for the given user. When called without an
 * explicit `userId`, falls back to the signed-in user — preserving the
 * original behavior. When staff are viewing-as-client, `AppShell` passes the
 * impersonated user's id so the dashboard renders that client's data.
 */
export function useCreditFactors(userId?: string) {
  const queryClient = useQueryClient();

  const resolveUserId = async (): Promise<string | null> => {
    if (userId) return userId;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user.id ?? null;
  };

  const { data: factors, isLoading } = useQuery({
    queryKey: ["credit-factors", userId ?? "self"],
    queryFn: async () => {
      const uid = await resolveUserId();
      if (!uid) return null;
      const { data, error } = await supabase
        .from("credit_factor_scores")
        .select("*")
        .eq("user_id", uid)
        .order("calculated_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data as any)?.[0] || null;
    },
  });

  const { data: history } = useQuery({
    queryKey: ["credit-factors-history", userId ?? "self"],
    queryFn: async () => {
      const uid = await resolveUserId();
      if (!uid) return [];
      const { data, error } = await supabase
        .from("credit_factor_scores")
        .select("*")
        .eq("user_id", uid)
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
