import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * /welcome — post-payment wait page (B-Platform, pay-before-workspace).
 *
 * This is the Stripe success_url target for onboarding checkouts
 * (/welcome?checkout=success). The webhook provisions the tenant + subscription
 * ASYNCHRONOUSLY, so the returning client can (and often will) arrive before that
 * write lands. Rather than dump them into a half-built dashboard, we hold on a calm
 * "Setting up your workspace…" state and POLL until the tenant/subscription exists,
 * then forward to /admin.
 *
 * §13 honesty: we never claim the workspace is ready before the poll confirms a
 * real provisioned row. On timeout we say so plainly and offer a manual continue.
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

export default function Welcome() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [timedOut, setTimedOut] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    // A tenant/subscription exists once the webhook has provisioned it. We prove it
    // two ways (either is sufficient): the §10 subscription RPC returns a row, OR
    // the user now owns/belongs to a tenant. Any positive signal → forward.
    const hasWorkspace = async (): Promise<boolean> => {
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const userId = sessionRes.session?.user?.id;
        if (!userId) return false;

        const [subRes, ownedRes, memberRes] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new RPC not yet in generated types
          supabase.rpc("get_tenant_platform_subscription" as any),
          supabase.from("tenants").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
          supabase.from("tenant_members").select("tenant_id").eq("user_id", userId).limit(1).maybeSingle(),
        ]);

        const subRow = (subRes.data as unknown[] | unknown | null) ?? null;
        const hasSub = Array.isArray(subRow) ? subRow.length > 0 : Boolean(subRow);
        const hasTenant = Boolean(ownedRes.data?.id || memberRes.data?.tenant_id);
        return hasSub || hasTenant;
      } catch {
        return false;
      }
    };

    const poll = async () => {
      if (cancelled || settledRef.current) return;

      if (await hasWorkspace()) {
        if (cancelled) return;
        settledRef.current = true;
        navigate("/admin", { replace: true });
        return;
      }

      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        if (!cancelled) setTimedOut(true);
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-background"
      style={{
        background:
          "radial-gradient(120% 90% at 70% 15%, hsl(var(--primary)/0.14) 0%, hsl(var(--background)) 55%)",
      }}
    >
      <div className="w-full max-w-md space-y-8">
        <motion.div
          className="mx-auto flex h-20 w-20 items-center justify-center"
          animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <PaigeMark className="h-16 w-16" animated={!reduce} />
        </motion.div>

        {!timedOut ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-bold text-foreground">Setting up your workspace…</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Payment confirmed. Paige is standing up your practice — your team, your portal, and your
              workspace. This usually takes just a few seconds.
            </p>
            <div className="flex items-center justify-center gap-1.5 pt-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]"
                  animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
                  transition={
                    reduce ? undefined : { duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }
                  }
                />
              ))}
            </div>
            <p className="sr-only" role="status" aria-live="polite">
              Setting up your workspace. Please wait.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-foreground">Almost there</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This is taking a little longer than usual. Your payment is safely on file. Try your
              dashboard — if your workspace isn't ready yet, refresh in a moment, and reach out any time
              and we'll finish setting it up for you.
            </p>
            <Button variant="gold" className="w-full" onClick={() => navigate("/admin", { replace: true })}>
              Go to dashboard
            </Button>
            <Button asChild variant="outline" className="w-full">
              <a href="mailto:support@paigeagent.ai?subject=Finishing%20my%20workspace%20setup">
                Contact support
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
