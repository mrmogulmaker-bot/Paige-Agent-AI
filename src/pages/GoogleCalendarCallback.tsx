import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function safeReturnOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed =
      (url.protocol === "http:" && host === "localhost") ||
      (url.protocol === "https:" && (
        host === "paigeagent.ai" ||
        host === "www.paigeagent.ai" ||
        host === "app.paigeagent.ai" ||
        host === "portal.mogulmakeracademy.com" ||
        host.endsWith(".vercel.app") ||
        host.endsWith(".lovable.app")
      ));
    return allowed ? url.origin : null;
  } catch {
    return null;
  }
}

// Staff land back on the admin calendar; a client lands on their own
// Connected Accounts settings. Kept in one place so both connect lanes
// (this page + the Zoom edge callback) share the same contract.
const STAFF_ROLES = new Set(["admin", "coach", "super_admin"]);

export default function GoogleCalendarCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { roles } = useUserRoles();
  const { isPlatformStaff } = useTenantContext();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState<string>("Finishing Google Calendar connection...");

  // The redirect fires on a timer after the code exchange resolves, so read the
  // freshest role signal via a ref rather than closing over a stale value.
  const isStaff = roles.some((r) => STAFF_ROLES.has(r)) || isPlatformStaff;
  const isStaffRef = useRef(isStaff);
  useEffect(() => { isStaffRef.current = isStaff; }, [isStaff]);

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
      const returnOrigin = safeReturnOrigin((data as any)?.return_origin);
      setTimeout(() => {
        const dest = isStaffRef.current ? "/admin/calendar" : "/app/settings?tab=accounts";
        if (returnOrigin && returnOrigin !== window.location.origin) {
          window.location.replace(`${returnOrigin}${dest}`);
          return;
        }
        navigate(dest, { replace: true });
      }, 1200);
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 flex flex-col items-center gap-3 text-center">
          {state === "working" && <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
          {state === "ok" && <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />}
          {state === "error" && <XCircle className="h-8 w-8 text-destructive" />}
          <p className="text-sm">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
