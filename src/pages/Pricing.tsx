import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Sparkles, Building2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Footer } from "@/components/landing/Footer";
import { PageHead } from "@/components/seo/PageHead";
import { supabase } from "@/integrations/supabase/client";
import { onboardingPathWithPlan } from "@/lib/auth/signupPlanIntent";
import { resolveLandingRoute } from "@/lib/auth/resolveLandingRoute";
import {
  keepPublicSoloPlan,
  soloBetaDisplayIntent,
  soloBetaSignupPath,
} from "@/lib/auth/soloBetaAcquisition";

interface DbPlan {
  slug: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  included_seats: number;
  included_contacts: number | null;
  is_active: boolean;
}

const APPROVED_SOLO_PLAN: DbPlan = {
  slug: "solo",
  name: "Paige Solo",
  description: "For the founder running a client-service business.",
  monthly_price_cents: 7450,
  annual_price_cents: null,
  included_seats: 1,
  included_contacts: null,
  is_active: true,
};

const FEATURES = [
  "One governed Paige workspace",
  "Client pipeline, follow-ups, and onboarding",
  "Server-verified workspace access",
  "A focused first-run setup path",
];

export default function Pricing() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(APPROVED_SOLO_PLAN);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("platform_subscription_plans")
      .select("slug,name,description,monthly_price_cents,annual_price_cents,included_seats,included_contacts,is_active")
      .eq("slug", "solo")
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const [candidate] = keepPublicSoloPlan([data as DbPlan]);
        if (candidate?.monthly_price_cents === 7450) setPlan({ ...candidate, annual_price_cents: null });
      });
    return () => { cancelled = true; };
  }, []);

  const continueToSolo = useCallback(async () => {
    setContinuing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) {
        navigate(soloBetaSignupPath());
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("active_tenant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!profile?.active_tenant_id) {
        navigate(onboardingPathWithPlan(soloBetaDisplayIntent()));
        return;
      }

      navigate(await resolveLandingRoute(user.id), { replace: true });
    } catch {
      toast.error("We couldn't confirm your account. Please try again.");
      setContinuing(false);
    }
  }, [navigate]);

  return (
    <>
      <PageHead
        title="Paige Solo beta — 30 days, then $74.50/month"
        description="Start Paige Solo with a 30-day trial, then $74.50/month unless you cancel before your first paid renewal."
        path="/pricing"
      />
      <div className="min-h-screen bg-background">
        <main className="px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <Badge className="mb-4 border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="mr-1.5 h-3 w-3" /> Paige Solo Beta
            </Badge>
            <h1 className="text-4xl font-bold text-foreground lg:text-5xl">Paige Solo is ready for your business.</h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
              Paige Solo is the beta currently available. We are building the broader platform deliberately; other account types are not yet open for enrollment.
            </p>
          </div>

          <Card className="mx-auto mt-10 max-w-md border-border bg-card p-7 shadow-glow">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Monthly membership</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">{plan.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tabular-nums">$74.50</span>
              <span className="text-sm text-muted-foreground">/month</span>
            </div>
            <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">Start your 30-day trial. Then $74.50/month unless you cancel before your first paid renewal.</p>
            <p className="mt-1 text-xs text-muted-foreground">Payment details are collected in Checkout. Access begins only after server-side subscription and membership verification.</p>

            <div className="my-6 border-y border-border py-5">
              <ul className="space-y-2.5">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{feature}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2.5 text-sm">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>One Solo workspace</span>
                </li>
                {plan.included_contacts ? (
                  <li className="flex items-start gap-2.5 text-sm">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{plan.included_contacts.toLocaleString("en-US")} contacts included</span>
                  </li>
                ) : null}
              </ul>
            </div>

            <Button variant="gold" size="lg" className="w-full font-bold" disabled={continuing} onClick={continueToSolo}>
              {continuing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking your account…</> : "Start your 30-day trial"}
            </Button>
          </Card>

          <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            This is a Paige Solo platform subscription. You bill your clients through your own payment processor; Paige does not handle your client revenue. Service provided by <strong>Paige Agent AI Inc.</strong>
          </p>
        </main>
        <Footer />
      </div>
    </>
  );
}
