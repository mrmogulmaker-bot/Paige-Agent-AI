import { useState, useEffect, useCallback } from "react";
import { usePlaidLink as usePlaidLinkSDK } from "react-plaid-link";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export function usePlaidLink(onSuccess?: () => void) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createLinkToken = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("plaid-create-link-token", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw response.error;
      }

      setLinkToken(response.data.link_token);
    } catch (error) {
      console.error("Error creating link token:", error);
      toast({
        title: "Connection Error",
        description: "Failed to initialize bank connection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const onSuccessCallback = useCallback(
    async (public_token: string, metadata: any) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          throw new Error("Not authenticated");
        }

        const response = await supabase.functions.invoke("plaid-exchange-token", {
          body: { public_token, metadata },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (response.error) {
          throw response.error;
        }

        toast({
          title: "Success!",
          description: response.data.message || "Bank account connected successfully",
        });

        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        console.error("Error exchanging token:", error);
        toast({
          title: "Connection Error",
          description: "Failed to connect bank account. Please try again.",
          variant: "destructive",
        });
      }
    },
    [onSuccess]
  );

  const config = {
    token: linkToken,
    onSuccess: onSuccessCallback,
  };

  const { open, ready } = usePlaidLinkSDK(config);

  useEffect(() => {
    if (!linkToken) {
      createLinkToken();
    }
  }, [linkToken, createLinkToken]);

  return {
    open,
    ready: ready && !loading,
    loading,
  };
}
