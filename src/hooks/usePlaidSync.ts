import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function usePlaidSync() {
  const [syncing, setSyncing] = useState(false);

  const syncTransactions = async (accountId: string) => {
    try {
      setSyncing(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("plaid-sync-transactions", {
        body: { account_id: accountId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw response.error;
      }

      toast({
        title: "Sync Complete",
        description: `${response.data.transactions_added || 0} transactions synced`,
      });

      return response.data;
    } catch (error) {
      console.error("Error syncing transactions:", error);
      toast({
        title: "Sync Error",
        description: "Failed to sync transactions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return {
    syncTransactions,
    syncing,
  };
}