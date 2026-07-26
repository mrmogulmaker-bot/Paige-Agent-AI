// Setup › Billing (B-Platform) — the Finance home, now the real "subscribe to a
// Paige plan" surface (§18: EXTENDS the 1c-xi placeholder home; no new page/route).
// A trial tenant sees the self-serve plans and subscribes in one click (§19/§36);
// a subscribed tenant sees their current plan. Everything is real: plans come from
// platform_subscription_plans, the current subscription from the §10 RPC, and the
// Subscribe act hands off to Stripe via the platform-subscription-checkout edge fn.
// NO fake data (§13), NO funding/credit vocab in what we render (§2), §11 lean plain
// header (no hero), gold spent ONLY on the Subscribe act.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard, Check, CheckCircle2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageHeader, SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BillingPeriod = "monthly" | "annual";

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  included_seats: number;
  included_contacts: number | null;
  is_active: boolean;
}

/** The current-subscription row from get_tenant_platform_subscription (0 or 1 row).
 * Shape is read permissively — we resolve name/price from the loaded plan by
 * plan_slug/plan_id, so this surface is resilient to the exact RPC projection. */
interface CurrentSub {
  plan_id?: string | null;
  plan_slug?: string | null;
  status?: string | null;
  billing_period?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
}

/** Whole dollars when even, cents otherwise; grouped thousands. */
function formatUsd(cents: number): string {
  const d = cents / 100;
  return `$${d.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(d) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function SetupBilling() {
  const [params] = useSearchParams();
  const checkoutState = params.get("subscribe"); // "success" | "cancelled" | null

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSub, setCurrentSub] = useState<CurrentSub | null>(null);
  // Gate the Subscribe act on the SAME authority the edge fn enforces
  // (is_tenant_admin_as for the active tenant), resolved via the §36/§9 seam — NOT
  // the global user_roles 'admin' flag, which a tenant OWNER may not carry.
  const [canManage, setCanManage] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [redirectingSlug, setRedirectingSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [plansRes, subRes, adminRes] = await Promise.all([
        supabase
          .from("platform_subscription_plans")
          .select("id,slug,name,description,monthly_price_cents,annual_price_cents,included_seats,included_contacts,is_active")
          .eq("is_active", true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new RPCs not yet in generated types (#234); repo-wide pattern
        supabase.rpc("get_tenant_platform_subscription" as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- new RPC not yet in generated types (#234)
        supabase.rpc("is_current_user_tenant_admin" as any),
      ]);

      if (plansRes.error) throw plansRes.error;
      // A failing admin check is not fatal — fail closed (read-only), never open.
      setCanManage(adminRes.data === true);

      // Paid plans lead; enterprise/custom (monthly === 0) sorts last (§ price asc,
      // treating 0 as "quote" → Infinity so it never jumps to the front).
      const sorted = [...((plansRes.data ?? []) as Plan[])].sort((a, b) => {
        const av = a.monthly_price_cents > 0 ? a.monthly_price_cents : Number.POSITIVE_INFINITY;
        const bv = b.monthly_price_cents > 0 ? b.monthly_price_cents : Number.POSITIVE_INFINITY;
        return av - bv;
      });
      setPlans(sorted);

      // RPC failing is not fatal — the plan grid still renders. We just can't show
      // a "current plan" card, so we treat it as no-subscription and note it.
      const subRow = (subRes.data as CurrentSub[] | CurrentSub | null) ?? null;
      const row = Array.isArray(subRow) ? (subRow[0] ?? null) : subRow;
      setCurrentSub(row ?? null);
      if (row?.billing_period === "annual") setPeriod("annual");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load your billing details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentPlan = useMemo(() => {
    if (!currentSub) return null;
    return (
      plans.find((p) => (currentSub.plan_slug && p.slug === currentSub.plan_slug) || (currentSub.plan_id && p.id === currentSub.plan_id)) ??
      null
    );
  }, [currentSub, plans]);

  const hasActiveSub = Boolean(
    currentSub && (currentSub.status ? currentSub.status !== "canceled" && currentSub.status !== "cancelled" : true),
  );

  const subscribe = useCallback(
    async (planSlug: string) => {
      if (!canManage) return;
      setRedirectingSlug(planSlug);
      try {
        const { data, error } = await supabase.functions.invoke("platform-subscription-checkout", {
          body: { plan_slug: planSlug, billing_period: period },
        });

        // supabase-js surfaces a non-2xx as a FunctionsHttpError whose JSON body lives
        // on error.context (a Response), NOT on `data` — so the edge fn's structured
        // { error, detail } must be read from there, or the friendly branch never fires.
        if (error) {
          let code: string | undefined;
          let detail: string | undefined;
          try {
            const b = await (error as { context?: Response }).context?.json?.();
            code = (b as Record<string, unknown> | undefined)?.error as string | undefined;
            detail = (b as Record<string, unknown> | undefined)?.detail as string | undefined;
          } catch {
            /* body wasn't JSON — fall back to the generic message below */
          }
          if (code === "already_subscribed") {
            toast.error("You already have an active plan.");
            void load();
            return;
          }
          throw new Error(detail || code || error.message || "Couldn't start checkout. Please try again.");
        }

        const url = (data as { url?: string } | null)?.url;
        if (!url) throw new Error("Checkout didn't return a link. Please try again.");
        window.location.href = url;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't start checkout. Please try again.");
        setRedirectingSlug(null);
      }
    },
    [canManage, period, load],
  );

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={CreditCard}
        eyebrow="Finance"
        title="Billing"
        description="Your Paige plan and payment details — pick the plan that fits your practice."
      />

      {/* Post-checkout note (§11: inline, not a hero). */}
      {checkoutState === "success" && (
        <div className="flex items-start gap-3 rounded-[var(--radius)] border border-[hsl(var(--success)/0.4)] bg-[hsl(var(--success)/0.08)] px-4 py-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">You're subscribed — welcome to Paige.</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Your plan is active. It can take a moment to reflect below.</p>
          </div>
        </div>
      )}
      {checkoutState === "cancelled" && (
        <div className="rounded-[var(--radius)] border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">Checkout cancelled. No charge was made — pick a plan whenever you're ready.</p>
        </div>
      )}

      {loading ? (
        <BillingSkeleton />
      ) : loadError ? (
        <SectionCard>
          <EmptyState
            icon={CreditCard}
            tone="muted"
            title="We couldn't load your billing"
            description="Something went wrong reaching your plan details. Try again, or reach out to support if it keeps happening."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="outline" onClick={() => void load()}>Try again</Button>
                <Button asChild variant="ghost">
                  <Link to="/admin/support">Contact support</Link>
                </Button>
              </div>
            }
          />
        </SectionCard>
      ) : hasActiveSub ? (
        <CurrentPlanCard sub={currentSub!} plan={currentPlan} />
      ) : (
        <PlanChooser
          plans={plans}
          period={period}
          onPeriodChange={setPeriod}
          canSubscribe={canManage}
          redirectingSlug={redirectingSlug}
          onSubscribe={subscribe}
        />
      )}
    </PageShell>
  );
}

/* ------------------------------------------------------------------ */
/* State A — current subscription                                      */
/* ------------------------------------------------------------------ */
function CurrentPlanCard({ sub, plan }: { sub: CurrentSub; plan: Plan | null }) {
  const status = (sub.status ?? "active").toLowerCase();
  const isPastDue = status === "past_due" || status === "unpaid";
  const period: BillingPeriod = sub.billing_period === "annual" ? "annual" : "monthly";
  const priceCents = plan
    ? period === "annual"
      ? plan.annual_price_cents ?? plan.monthly_price_cents * 12
      : plan.monthly_price_cents
    : null;
  const periodEnd = formatDate(sub.current_period_end);

  return (
    <SectionCard
      title={plan?.name ?? "Your Paige plan"}
      description={plan?.description ?? undefined}
      icon={CreditCard}
      actions={
        isPastDue ? (
          <StatePill state="warning">Past due</StatePill>
        ) : (
          <StatePill state="on">{status === "trialing" ? "Trialing" : "Active"}</StatePill>
        )
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {priceCents != null && (
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-3xl font-semibold tabular-nums text-foreground">{formatUsd(priceCents)}</span>
              <span className="text-sm text-muted-foreground">/{period === "annual" ? "yr" : "mo"}</span>
            </div>
          )}
          {plan && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{plan.included_seats}</span> seats included
            </p>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {isPastDue ? (
            <span className="text-[hsl(var(--warning))]">Payment needs attention — update it to keep Paige running.</span>
          ) : sub.cancel_at_period_end ? (
            <span>Cancels at period end{periodEnd ? ` — ${periodEnd}` : ""}</span>
          ) : periodEnd ? (
            <span>Renews {periodEnd}</span>
          ) : null}
        </div>
      </div>

      <p className="mt-5 border-t border-border/60 pt-4 text-sm text-muted-foreground">
        Need to change or cancel your plan?{" "}
        <Link
          to="/admin/support"
          className="rounded font-medium text-[hsl(var(--primary))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          Contact support
        </Link>{" "}
        and we'll take care of it.
      </p>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* State B — no subscription: choose a plan                            */
/* ------------------------------------------------------------------ */
function PlanChooser({
  plans,
  period,
  onPeriodChange,
  canSubscribe,
  redirectingSlug,
  onSubscribe,
}: {
  plans: Plan[];
  period: BillingPeriod;
  onPeriodChange: (p: BillingPeriod) => void;
  canSubscribe: boolean;
  redirectingSlug: string | null;
  onSubscribe: (slug: string) => void;
}) {
  const selfServe = plans.filter((p) => p.monthly_price_cents > 0);
  const custom = plans.filter((p) => p.monthly_price_cents === 0);

  if (plans.length === 0) {
    return (
      <SectionCard>
        <EmptyState
          icon={CreditCard}
          tone="brand"
          title="No plans available yet"
          description="Plans aren't published right now. Reach out and we'll get you set up."
          action={
            <Button asChild variant="outline">
              <Link to="/admin/support">Contact support</Link>
            </Button>
          }
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {canSubscribe
            ? "Choose your plan — subscribe in one click."
            : "Ask your workspace admin to subscribe to a plan."}
        </p>
        <Tabs value={period} onValueChange={(v) => onPeriodChange(v as BillingPeriod)}>
          <TabsList>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="annual">Annual</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {selfServe.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            period={period}
            canSubscribe={canSubscribe}
            redirecting={redirectingSlug === plan.slug}
            anyRedirecting={redirectingSlug != null}
            onSubscribe={onSubscribe}
          />
        ))}
        {custom.map((plan) => (
          <ContactSalesCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  period,
  canSubscribe,
  redirecting,
  anyRedirecting,
  onSubscribe,
}: {
  plan: Plan;
  period: BillingPeriod;
  canSubscribe: boolean;
  redirecting: boolean;
  anyRedirecting: boolean;
  onSubscribe: (slug: string) => void;
}) {
  const annual = period === "annual";
  const annualCents = plan.annual_price_cents ?? plan.monthly_price_cents * 12;
  const priceCents = annual ? annualCents : plan.monthly_price_cents;
  const savingsCents = Math.max(0, plan.monthly_price_cents * 12 - annualCents);

  return (
    <div className="flex flex-col rounded-[var(--radius)] border border-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-base font-semibold leading-tight text-foreground">{plan.name}</h3>
        {annual && savingsCents > 0 && (
          <span className="shrink-0 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Save <span className="tabular-nums">{formatUsd(savingsCents)}</span>
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-semibold tabular-nums text-foreground">{formatUsd(priceCents)}</span>
        <span className="text-sm text-muted-foreground">/{annual ? "yr" : "mo"}</span>
      </div>
      {annual && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="tabular-nums">{formatUsd(Math.round(annualCents / 12))}</span>/mo billed annually
        </p>
      )}

      {plan.description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>}

      <ul className="mt-4 space-y-2 text-sm text-foreground">
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
          <span>
            <span className="tabular-nums">{plan.included_seats}</span> {plan.included_seats === 1 ? "seat" : "seats"} included
          </span>
        </li>
        {plan.included_contacts != null && plan.included_contacts > 0 && (
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden />
            <span>
              <span className="tabular-nums">{plan.included_contacts.toLocaleString("en-US")}</span> contacts included
            </span>
          </li>
        )}
      </ul>

      <div className="mt-auto pt-5">
        {canSubscribe ? (
          <Button
            variant="gold"
            className="w-full"
            disabled={anyRedirecting}
            onClick={() => onSubscribe(plan.slug)}
            aria-label={`Subscribe to ${plan.name}`}
          >
            {redirecting ? "Redirecting…" : "Subscribe"}
          </Button>
        ) : (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
            Ask your workspace admin to subscribe.
          </p>
        )}
      </div>
    </div>
  );
}

function ContactSalesCard({ plan }: { plan: Plan }) {
  return (
    <div className="flex flex-col rounded-[var(--radius)] border border-border bg-card p-5 shadow-card">
      <h3 className="font-display text-base font-semibold leading-tight text-foreground">{plan.name}</h3>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-semibold text-foreground">Custom</span>
      </div>
      {plan.description && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>}
      <div className="mt-auto pt-5">
        <Button asChild variant="outline" className="w-full">
          <Link to="/admin/support">Contact sales</Link>
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */
function BillingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-card">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-4 h-8 w-32" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-6 h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
