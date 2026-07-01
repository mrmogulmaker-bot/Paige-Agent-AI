import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function GoogleCalendarCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState<string>("Finishing Google Calendar connection...");

  useEffect(() => {
    const code = params.get("code");
    const stateParam = params.get("state");
    const error = params.get("error");
    if (error) {
      setState("error");
      setMessage(`Google returned an error: ${error}`);
      return;
    }
    if (!code || !stateParam) {
      setState("error");
      setMessage("Missing code or state parameter.");
      return;
    }
    (async () => {
      const { data, error } = await supabase.functions.invoke("google-calendar-oauth-callback", {
        body: { code, state: stateParam, origin: window.location.origin },
      });
      if (error || (data as any)?.error) {
        setState("error");
        setMessage((data as any)?.error ?? error?.message ?? "Failed to complete connection.");
        return;
      }
      setState("ok");
      setMessage(`Connected${(data as any)?.google_email ? ` as ${(data as any).google_email}` : ""}. Redirecting...`);
      toast.success("Google Calendar connected");
      setTimeout(() => navigate("/admin/calendar", { replace: true }), 1200);
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
          {state === "working" && <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
          {state === "ok" && <CheckCircle2 className="h-8 w-8 text-emerald-600" />}
          {state === "error" && <XCircle className="h-8 w-8 text-destructive" />}
          <p className="text-sm">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
