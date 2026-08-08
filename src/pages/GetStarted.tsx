import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Clock, Sparkles, TicketX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, SectionCard, EmptyState } from "@/components/ui/page";
import { PaigeMark } from "@/components/brand/PaigeMark";

/**
 * /get-started?invite=<token> — the PUBLIC invite-consume page (B-Platform-v2).
 *
 * A super-admin generates an invite in /admin/platform/invites; the prospect lands
 * here. We validate the token via get_platform_invite (anon-callable, read-only —
 * consumption happens later, server-side, off the checkout webhook), and either:
 *   • valid   → a premium branded "you've been invited" card → Continue routes to
 *               /auth?mode=signup&plan=<slug>&invite=<token>. The trial length is
 *               derived server-side from the token, so no billing param is passed.
 *   • invalid → a crafted EmptyState with a route back to /pricing.
 *
 * §9 the invite is operator-issued; consumption provisions a tenant owned by the
 * invited user. §11 gold ONLY on the Continue act; rings indigo; token-only, no hex.
 * §3 mogul-founder voice. §13 never renders a hoped-for plan — only what the RPC
 * actually returned (get_platform_invite returns plan_slug + trial length + valid).
 */

type InviteInfo = {
  valid?: boolean;
  plan_slug?: string;
  trial_period_days?: number;
};

// get_platform_invite returns only the slug (leak-safe); map it to the launch name.
// Any future self-serve slug falls back to a capitalized slug, never a raw token.
const PLAN_NAME_BY_SLUG: Record<string, string> = {
  solo: "Solo",
  agency: "Agency",
};

export default function GetStarted() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const token = searchParams.get("invite")?.trim() || "";

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);

  useEffect(() => {
    let alive = true;
    // No token at all → nothing to validate; fall through to the invalid state.
    if (!token) {
      setLoading(false);
      setInvite(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        // Types aren't generated for this platform RPC yet — cast the untyped result
        // to a concrete nullable shape so strict-null tsc is satisfied without `any`.
        const { data, error } = (await supabase.rpc(
          "get_platform_invite" as never,
          { _token: token } as never,
        )) as { data: InviteInfo | InviteInfo[] | null; error: unknown };
        if (!alive) return;
        if (error) {
          setInvite(null);
        } else {
          // The RPC may return a single row or a one-row set — normalize both.
          const row = Array.isArray(data) ? (data[0] ?? null) : data;
          setInvite(row ?? null);
        }
      } catch {
        if (alive) setInvite(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  // An invite is usable only when the RPC returned a live, unconsumed row with a plan.
  const isValid = useMemo(() => {
    if (!invite) return false;
    if (invite.valid !== true) return false;
    return Boolean(invite.plan_slug);
  }, [invite]);

  const planName = invite?.plan_slug
    ? PLAN_NAME_BY_SLUG[invite.plan_slug] ??
      invite.plan_slug.charAt(0).toUpperCase() + invite.plan_slug.slice(1)
    : "Paige";
  const trialDays = invite?.trial_period_days ?? 0;

  const onContinue = () => {
    if (!isValid || !invite?.plan_slug) return;
    navigate(
      `/auth?mode=signup&plan=${encodeURIComponent(invite.plan_slug)}&invite=${encodeURIComponent(token)}`,
    );
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-12"
      style={{ background: "var(--gradient-hero)" }}
    >
      {/* Ambient brand wash — decorative, motion-safe, non-interactive. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, hsl(var(--gold)/0.20), transparent)" }}
        />
      </div>

      <PageShell width="narrow" className="relative">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <PaigeMark className="h-9 w-9" animated={!reduce} />
            <span className="font-display text-lg font-semibold text-white">Paige</span>
          </div>

          {loading ? (
            <SectionCard className="bg-card/95 backdrop-blur">
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-11 w-full max-w-xs" />
              </div>
            </SectionCard>
          ) : isValid ? (
            <SectionCard className="overflow-hidden bg-card/95 backdrop-blur">
              <div className="flex flex-col items-center gap-5 py-4 text-center">
                {/* §11: neutral resting border; gold is spent only on the Continue act below. */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--gold-dark))]">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Private invitation
                </span>

                <div className="space-y-2">
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground text-balance">
                    You&rsquo;re invited to Paige
                  </h1>
                  <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    Your workspace runs on the{" "}
                    <span className="font-semibold text-foreground">{planName}</span> plan.
                    {trialDays > 0
                      ? " Your first stretch is on the house — set it up now and Paige gets to work on day one."
                      : " Set it up now and Paige gets to work on day one."}
                  </p>
                </div>

                {trialDays > 0 && (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="font-medium text-foreground">{trialDays}-day free trial</span>
                    <span className="text-muted-foreground">included</span>
                  </div>
                )}

                <Button
                  variant="gold"
                  size="lg"
                  className="w-full max-w-xs"
                  onClick={onContinue}
                >
                  Claim your workspace
                  <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                </Button>

                <p className="text-xs text-muted-foreground">
                  Already have an account?{" "}
                  <Link
                    to="/auth"
                    className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </SectionCard>
          ) : (
            <SectionCard className="bg-card/95 backdrop-blur">
              <EmptyState
                icon={TicketX}
                tone="brand"
                title="This invite isn&rsquo;t active"
                description="This invitation has already been used, expired, or was revoked. Explore the plans and start your workspace directly."
                action={
                  <Button asChild variant="default">
                    <Link to="/pricing">
                      See plans
                      <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                }
              />
            </SectionCard>
          )}
        </motion.div>
      </PageShell>
    </div>
  );
}
