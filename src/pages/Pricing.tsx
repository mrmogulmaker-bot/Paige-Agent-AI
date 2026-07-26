import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Sparkles, Building2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Footer } from "@/components/landing/Footer";
import { PageHead } from "@/components/seo/PageHead";
import { supabase } from "@/integrations/supabase/client";

/**
 * /pricing — Tier-1 platform subscription (Tenant → Paige). This is the public
 * "run your practice on Paige" storefront; a prospect picks a plan here, signs up,
 * and lands straight in Stripe Checkout (pay-before-workspace, B-Platform).
 *
 * Plans are read LIVE from platform_subscription_plans (the single source of truth,
 * shared with Setup › Billing) and reconciled to a static fallback that matches the
 * DB exactly, so the page renders instantly and stays correct if the fetch is slow.
 *
 * §2 coaching-generic — zero funding/credit vocab. §3 mogul-founder voice ("Paige
 * runs it", never "AI-powered"/"seamless"). §11 tokens, tabular-nums prices, gold
 * spent ONLY on the Subscribe act. Enterprise is the one non-self-serve exception
 * (Contact Sales), never a $0 subscribe.
 */

type BillingPeriod = "monthly" | "annual";

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

/** Static presentation layer per plan slug: tagline, feature bullets, "popular"
 *  flag. The price/seats/contacts render from the DB row, so this never drifts on
 *  numbers — it only carries the marketing copy the DB doesn't store. */
const PLAN_COPY: Record<
  string,
  { tagline: string; popular?: boolean; features: string[] }
> = {
  practice: {
    tagline: "For solo coaches and small teams launching a Paige-run practice.",
    features: [
      "Full CRM + client pipeline",
      "Paige runs your follow-ups & intake",
      "Branded client portal",
      "Payments via your own processor",
      "Core automations & workflows",
    ],
  },
  academy: {
    tagline: "For coaching academies and agencies running Paige as their operating system.",
    popular: true,
    features: [
      "Everything in Practice, plus:",
      "White-label domain + branding",
      "Sub-agent factory (Paige Skills)",
      "Marketplace tools + workflow fabric",
      "Multi-team roles & permissions",
      "Priority support",
    ],
  },
  enterprise: {
    tagline: "For multi-brand portfolios with bespoke infrastructure needs.",
    features: [
      "Everything in Academy, plus:",
      "Dedicated infrastructure",
      "SOC 2 / custom DPA",
      "White-glove migration",
      "SLA-backed uptime",
      "Named executive sponsor",
    ],
  },
};

/** DB-matching fallback (verified against platform_subscription_plans). Used until
 *  the live fetch resolves and if it fails — same numbers, so no visible drift. */
const FALLBACK_PLANS: DbPlan[] = [
  {
    slug: "practice",
    name: "Practice",
    description: "For solo coaches and small teams launching on Paige.",
    monthly_price_cents: 14900,
    annual_price_cents: 149000,
    included_seats: 3,
    included_contacts: 250,
    is_active: true,
  },
  {
    slug: "academy",
    name: "Academy",
    description: "For coaching academies and agencies running Paige as their operating system.",
    monthly_price_cents: 39700,
    annual_price_cents: 397000,
    included_seats: 10,
    included_contacts: 2000,
    is_active: true,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Multi-brand portfolios, dedicated infrastructure, SOC 2 / custom DPA.",
    monthly_price_cents: 0,
    annual_price_cents: 0,
    included_seats: 0,
    included_contacts: 0,
    is_active: true,
  },
];

/** Whole dollars when even, cents otherwise; grouped thousands. */
function formatUsd(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(d) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Paid plans first (by monthly price); custom/$0 (enterprise) sorts last. */
function sortPlans(plans: DbPlan[]): DbPlan[] {
  return [...plans].sort((a, b) => {
    const av = a.monthly_price_cents > 0 ? a.monthly_price_cents : Number.POSITIVE_INFINITY;
    const bv = b.monthly_price_cents > 0 ? b.monthly_price_cents : Number.POSITIVE_INFINITY;
    return av - bv;
  });
}

export default function Pricing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<DbPlan[]>(FALLBACK_PLANS);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [subscribingSlug, setSubscribingSlug] = useState<string | null>(null);

  // Read the live plans; keep the DB-matching fallback if the fetch fails so the
  // page never shows a blank or a wrong price (§13 — no fabricated numbers).
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("platform_subscription_plans")
      .select("slug,name,description,monthly_price_cents,annual_price_cents,included_seats,included_contacts,is_active")
      .eq("is_active", true)
      .then(({ data, error }) => {
        if (cancelled || error || !data || data.length === 0) return;
        setPlans(sortPlans(data as DbPlan[]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedPlans = useMemo(() => sortPlans(plans), [plans]);

  const handleSubscribe = useCallback(
    async (slug: string) => {
      setSubscribingSlug(slug);
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const signedIn = Boolean(sessionRes.session?.user);

        // Not signed in → carry the plan intent into signup; Auth.tsx auto-launches
        // checkout for this plan the moment the session is established.
        if (!signedIn) {
          navigate(`/auth?mode=signup&plan=${slug}&billing=${period}`);
          return;
        }

        // Signed in → straight to Stripe Checkout for their active tenant.
        const { data, error } = await supabase.functions.invoke("platform-subscription-checkout", {
          body: { plan_slug: slug, billing_period: period, success_path: "/welcome?checkout=success" },
        });

        if (error) {
          // supabase-js surfaces a non-2xx as FunctionsHttpError whose JSON body
          // lives on error.context (a Response), not on `data`.
          let code: string | undefined;
          let detail: string | undefined;
          try {
            const b = await (error as { context?: Response }).context?.json?.();
            code = (b as Record<string, unknown> | undefined)?.error as string | undefined;
            detail = (b as Record<string, unknown> | undefined)?.detail as string | undefined;
          } catch {
            /* body wasn't JSON — fall through to the generic message */
          }
          if (code === "already_subscribed" || code === "already_provisioned") {
            navigate("/admin");
            return;
          }
          throw new Error(detail || code || error.message || "Couldn't start checkout. Please try again.");
        }

        const url = (data as { url?: string } | null)?.url;
        if (!url) throw new Error("Checkout didn't return a link. Please try again.");
        window.location.href = url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't start checkout. Please try again.");
        setSubscribingSlug(null);
      }
    },
    [navigate, period],
  );

  return (
    <>
      <PageHead
        title="Pricing — Paige Agent AI"
        description="Run your practice on Paige. Transparent platform pricing for coaches, consultants, agencies, and academies — Practice, Academy, and Enterprise."
        path="/pricing"
      />
      <div className="min-h-screen bg-background">
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                <Sparkles className="w-3 h-3 mr-1.5" />
                Platform subscription
              </Badge>
              <h1 className="text-4xl lg:text-5xl font-bold mb-4">
                Run your practice on{" "}
                <span className="text-accent font-extrabold">Paige.</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                One price to give your business a team that never clocks out. Bring your own clients,
                your own offers, your own pricing — Paige runs the operations behind them.
              </p>
            </div>

            {/* Monthly / Annual toggle */}
            <div className="flex justify-center mb-12">
              <Tabs value={period} onValueChange={(v) => setPeriod(v as BillingPeriod)}>
                <TabsList>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="annual">Annual · save 2 months</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
              {orderedPlans.map((plan) => (
                <PlanCard
                  key={plan.slug}
                  plan={plan}
                  period={period}
                  subscribing={subscribingSlug === plan.slug}
                  anySubscribing={subscribingSlug !== null}
                  onSubscribe={handleSubscribe}
                />
              ))}
            </div>

            <p className="text-center text-xs text-muted-foreground max-w-3xl mx-auto leading-relaxed mt-12">
              Every plan is a Paige platform subscription. You bill your own clients through your own
              payment processor — Paige never touches your client revenue. Service provided by{" "}
              <strong>PaigeAgent AI LLC</strong>.
            </p>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}

function PlanCard({
  plan,
  period,
  subscribing,
  anySubscribing,
  onSubscribe,
}: {
  plan: DbPlan;
  period: BillingPeriod;
  subscribing: boolean;
  anySubscribing: boolean;
  onSubscribe: (slug: string) => void;
}) {
  const copy = PLAN_COPY[plan.slug] ?? { tagline: plan.description ?? "", features: [] };
  const isCustom = plan.monthly_price_cents === 0;
  const annual = period === "annual";
  const annualCents = plan.annual_price_cents ?? plan.monthly_price_cents * 12;
  const priceCents = annual ? annualCents : plan.monthly_price_cents;
  const perMonthCents = annual ? Math.round(annualCents / 12) : plan.monthly_price_cents;

  return (
    <Card
      className={`p-7 bg-card relative flex flex-col transition-all duration-300 hover:shadow-glow hover:-translate-y-1 ${
        copy.popular ? "border-2 border-primary shadow-glow-lg lg:scale-[1.03]" : "border-border"
      }`}
    >
      {copy.popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0 font-bold px-4">
          MOST POPULAR
        </Badge>
      )}
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1 text-foreground">{plan.name}</h2>
        <p className="text-xs text-muted-foreground mb-4 min-h-[2.5rem]">{copy.tagline}</p>
        {isCustom ? (
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-extrabold">Custom</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tabular-nums">{formatUsd(priceCents)}</span>
              <span className="text-muted-foreground text-sm">/{annual ? "yr" : "mo"}</span>
            </div>
            {annual && (
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{formatUsd(perMonthCents)}</span>/mo billed annually
              </p>
            )}
          </>
        )}
      </div>

      {!isCustom && (
        <div className="mb-6 pb-6 border-b border-border">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">Included</p>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2">
              <Building2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
              <span>
                <span className="tabular-nums">{plan.included_seats}</span>{" "}
                {plan.included_seats === 1 ? "team seat" : "team seats"} included
              </span>
            </li>
            {plan.included_contacts != null && plan.included_contacts > 0 && (
              <li className="flex items-start gap-2">
                <Users className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                <span>
                  <span className="tabular-nums">{plan.included_contacts.toLocaleString("en-US")}</span>{" "}
                  contacts included
                </span>
              </li>
            )}
          </ul>
        </div>
      )}

      <ul className="space-y-2.5 mb-7 flex-grow">
        {copy.features.map((f, i) => (
          <li
            key={i}
            className={`flex items-start gap-2.5 ${f.endsWith("plus:") ? "font-semibold text-foreground" : ""}`}
          >
            {f.endsWith("plus:") ? (
              <span className="w-4 h-0.5 mt-2.5 bg-gold flex-shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
            )}
            <span className="text-sm leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      {isCustom ? (
        <Button
          size="lg"
          variant="outline"
          className="w-full font-bold"
          onClick={() => {
            window.location.href = "mailto:sales@paigeagent.ai?subject=Enterprise%20Inquiry";
          }}
        >
          Contact Sales
        </Button>
      ) : (
        <Button
          size="lg"
          variant="gold"
          className="w-full font-bold"
          disabled={anySubscribing}
          onClick={() => onSubscribe(plan.slug)}
          aria-label={`Subscribe to ${plan.name}`}
        >
          {subscribing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redirecting…
            </>
          ) : (
            "Get started"
          )}
        </Button>
      )}
    </Card>
  );
}
