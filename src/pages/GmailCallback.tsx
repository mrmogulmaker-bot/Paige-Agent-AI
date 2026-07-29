// Gmail OAuth callback (#141b) — mirrors GoogleCalendarCallback. Reads ?code&state,
// invokes gmail-oauth-callback to exchange the code + provision the tenant's Gmail
// connector, then lands back on the Email integration surface. Honest states (§13):
// a Google error, a missing param, or a callback error each show a real message —
// never a silent success.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

// Human-readable messages for the honest error codes the callback returns (§36 — a
// non-technical coach should never see a raw code).
const ERROR_COPY: Record<string, string> = {
  gmail_oauth_not_configured: "Gmail connect isn't switched on yet — we're finishing the Google sign-in setup. Try again shortly.",
  gmail_already_connected_elsewhere: "This Gmail address is already connected to another workspace. Use a different address, or disconnect it there first.",
  token_exchange_failed: "Google didn't return a lasting connection. Please try connecting again and approve offline access.",
  no_tenant_for_user: "We couldn't match your account to a workspace. Contact support so we can finish the connection.",
  state_expired: "That sign-in link timed out. Please start the Gmail connect again.",
  state_user_mismatch: "That sign-in didn't match your account. Please start the Gmail connect again.",
  gmail_email_unavailable: "Google didn't share your email address. Please try again and grant the email permission.",
};

export default function GmailCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState<string>("Finishing your Gmail connection...");

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
    void (async () => {
      const { data, error: invokeErr } = await supabase.functions.invoke("gmail-oauth-callback", {
        body: { code, state: stateParam, origin: window.location.origin },
      });
      const errCode = (data as { error?: string } | null)?.error;
      if (invokeErr || errCode) {
        setState("error");
        setMessage(
          (errCode && ERROR_COPY[errCode]) ||
          errCode ||
          invokeErr?.message ||
          "Failed to complete the Gmail connection.",
        );
        return;
      }
      const addr = (data as { gmail_address?: string } | null)?.gmail_address;
      setState("ok");
      setMessage(`Connected${addr ? ` as ${addr}` : ""}. Redirecting...`);
      toast.success("Gmail connected");
      const returnOrigin = safeReturnOrigin((data as { return_origin?: string } | null)?.return_origin);
      const dest = "/admin/integrations/email";
      setTimeout(() => {
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
