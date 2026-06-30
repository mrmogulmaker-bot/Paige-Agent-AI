import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getEffectiveUserId } from "@/lib/scopedUser";

export function useFinancialKPIs() {
  return useQuery({
    queryKey: ["financial-kpis"],
    queryFn: async () => {
      const __uid = await getEffectiveUserId();
      if (!__uid) throw new Error("Not authenticated");
      const user = { id: __uid } as { id: string };

      const { data, error } = await supabase
        .from("financial_kpis")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}