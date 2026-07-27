// Comms C-2s-C — the branded email UNSUBSCRIBE landing page (compliance loop).
//
// §18 ONE HOME: this is the platform's single unsubscribe surface. Rather than
// scaffold a redundant second page for the tenant one-click/footer link, the ONE
// `Unsubscribe` component now serves BOTH flows and is reachable from two route
// bindings (see src/App.tsx):
//   • Legacy global flow    — /unsubscribe?token=<t>  → handle-email-unsubscribe
//                             (the pre-existing email_unsubscribe_tokens path, UNCHANGED — §37:
//                              a live producer/consumer that must keep working byte-for-byte).
//   • Tenant comms flow     — /u/:token  OR  /unsubscribe?ct=<t>  → comms-email-unsubscribe
//                             (the C-2s-C tenant-scoped path: files a tenant paige_suppressions
//                              row, channel=email, reason=unsubscribe_link).
// The two flows share this component and differ only in which edge function they call
// and where the opaque token comes from — so there is exactly ONE unsubscribe surface.
//
// §13 HONESTY: a confirmed state is shown ONLY after the handler really recorded the
// suppression (a real invoke success); a failed/expired token shows the honest error, never
// a fake "you're unsubscribed". §2 coaching-generic: zero finance/credit vocabulary.
// §11: token-driven, theme-aware tokens only, no backend/table names in copy, no gold —
// opting OUT is not an act/approve/on moment, so the confirm button stays neutral.
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { MailCheck, MailX, ShieldOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PaigeMark } from "@/components/brand/PaigeMark";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

const Unsubscribe = () => {
  // /u/:token carries the tenant token in the path; /unsubscribe carries either the
  // legacy ?token= or the tenant ?ct= in the query. The tenant (comms) token wins when present.
  const params = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();

  const tenantToken = params.token ?? searchParams.get("ct");
  const legacyToken = searchParams.get("token");
  const isTenantFlow = Boolean(tenantToken);
  const token = tenantToken ?? legacyToken;
  const fn = isTenantFlow ? "comms-email-unsubscribe" : "handle-email-unsubscribe";

  const [status, setStatus] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);

  // Validate the token up front so an expired/invalid link (or an already-unsubscribed
  // recipient) sees the truthful state before clicking anything (§13).
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    const validate = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/${fn}?token=${encodeURIComponent(token)}`,
          { headers: { apikey: anonKey } },
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.valid === false && data.reason === "already_unsubscribed") setStatus("already");
        else if (data.valid) setStatus("valid");
        else setStatus("invalid");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    };
    void validate();
    return () => {
      cancelled = true;
    };
  }, [token, fn]);

  const handleUnsubscribe = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke(fn, { body: { token } });
      if (error) throw error;
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setSubmitting(false);
    }
  }, [token, fn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <PaigeMark className="mx-auto mb-5 h-11 w-11" />

        {status === "loading" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Email preferences</h1>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Checking your link…
            </p>
          </>
        )}

        {status === "valid" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Unsubscribe from these emails?
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Confirm below and you won't receive any more of these emails. You can always ask to be
              added back later.
            </p>
            <Button
              className="mt-6 w-full"
              disabled={submitting}
              onClick={() => void handleUnsubscribe()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  Unsubscribing…
                </>
              ) : (
                <>
                  <MailX className="mr-2 h-4 w-4" aria-hidden />
                  Confirm unsubscribe
                </>
              )}
            </Button>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
              <MailCheck className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">You've been unsubscribed</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You won't receive these emails anymore. It's safe to close this page.
            </p>
          </>
        )}

        {status === "already" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldOff className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">You're already unsubscribed</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              There's nothing more to do here — you won't receive these emails. It's safe to close this page.
            </p>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">This link isn't valid</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This unsubscribe link is invalid or has expired. If you'd still like to opt out, use the
              unsubscribe link at the bottom of a more recent email.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We couldn't process that just now. Please try again in a moment.
            </p>
            <Button
              variant="outline"
              className="mt-6 w-full"
              disabled={submitting}
              onClick={() => void handleUnsubscribe()}
            >
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Unsubscribe;
