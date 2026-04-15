import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "valid" | "already" | "invalid" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }
    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(`${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${token}`, {
          headers: { apikey: anonKey },
        });
        const data = await res.json();
        if (data.valid === false && data.reason === "already_unsubscribed") setStatus("already");
        else if (data.valid) setStatus("valid");
        else setStatus("invalid");
      } catch { setStatus("invalid"); }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    try {
      const { error } = await supabase.functions.invoke("handle-email-unsubscribe", {
        body: { token },
      });
      if (error) throw error;
      setStatus("success");
    } catch { setStatus("error"); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Email Preferences</h1>
        {status === "loading" && <p className="text-muted-foreground">Validating...</p>}
        {status === "valid" && (
          <div className="space-y-4">
            <p className="text-muted-foreground">Click below to unsubscribe from future emails.</p>
            <button onClick={handleUnsubscribe} className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition">
              Confirm Unsubscribe
            </button>
          </div>
        )}
        {status === "already" && <p className="text-muted-foreground">You're already unsubscribed.</p>}
        {status === "invalid" && <p className="text-destructive">Invalid or expired link.</p>}
        {status === "success" && <p className="text-green-600 font-medium">You've been unsubscribed successfully.</p>}
        {status === "error" && <p className="text-destructive">Something went wrong. Please try again.</p>}
      </div>
    </div>
  );
};

export default Unsubscribe;
