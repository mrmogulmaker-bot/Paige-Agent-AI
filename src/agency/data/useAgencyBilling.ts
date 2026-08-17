/**
 * useAgencyBilling — the Agency Billing adapter (Slice C, adapter 6). DISPLAY-ONLY.
 *
 * Mirrors the Solo `src/solo/data` pattern (§18: composes EXISTING seams — the same
 * platform-plan + tenant-service tables ContactBillingPanel/SetupBilling read). It
 * reshapes the caller's OWN billing posture into typed, read-only shapes.
 *
 * §51 SCOPE SPINE (session-derived ONLY — never a client-supplied tenant_id):
 *   • L1 plan — platform_subscription_plans matched to activeTenant.plan_offer.
 *     Platform-catalog read; the caller's plan is derived from their OWN tenant
 *     summary, never a passed id. REAL.
 *   • L2 tenant service subs — tenant_service_subscriptions ⋈ tenant_products ⋈
 *     tenant_prices, ALL RLS own-book (current_user_tenant_id()). REAL in BOTH modes;
 *     in agency-aggregate mode this is the AGENCY's OWN book, NOT a cross-book read.
 *
 * §38 MONEY BOUNDARY (HARD): this adapter is DISPLAY-ONLY — it exposes NO mutation,
 * NO checkout, NO payout, NO price write. Every action a billing screen would offer
 * is inert this slice.
 *
 * §13 HONEST PREVIEW: invoice states have no ledger table exposed here, and a
 * cross-book Revenue roll-up across sub-accounts has NO parentage-gated backend
 * (reading it off the RLS own-book tables would be the #86 leak). Both are surfaced
 * as explicit Preview flags, never fabricated.
 */
import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { isAgencyAggregate, type AgencyShellCtx } from "./useAgencyRoster";

/** The caller's L1 platform plan (read-only). REAL where matched, else null. */
export interface AgencyPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  annualPriceCents: number | null;
  includedSeats: number;
  includedContacts: number | null;
}

/** One L2 tenant service subscription, joined to its product + price. REAL, own-book. */
export interface AgencyServiceSub {
  id: string;
  status: string;
  billingPeriod: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  productName: string | null;
  productType: string | null;
  /** Price unit amount (minor units) — DISPLAY only, never a charge (§38). REAL | null */
  priceUnitAmount: number | null;
  priceCurrency: string | null;
  priceInterval: string | null;
}

/** §13/§38 — reads with no exposed backend: honest Preview, never fabricated. */
export interface AgencyBillingPreview {
  /** Invoice states — no invoice ledger read this slice; keep Preview. */
  invoiceStates: true;
  /** Cross-book Revenue roll-up — no parentage RPC (#86 leak surface); keep Preview. */
  crossBookRevenue: true;
}

export interface AgencyBillingData {
  mode: "agency" | "own";
  /** L1 plan for the caller's own tenant — REAL | null (no match / no plan_offer). */
  plan: AgencyPlan | null;
  /** The raw plan_offer slug on the tenant, even when no catalog row matched. REAL | null */
  planOffer: string | null;
  /** Seat allotment from the tenant summary (activeTenant.seat_limit). REAL */
  seatLimit: number | null;
  /** L2 own-book service subscriptions. REAL */
  serviceSubs: AgencyServiceSub[];
  loading: boolean;
  isError: boolean;
  /** §38/§13 — money aggregates that stay Preview. */
  preview: AgencyBillingPreview;
  refresh: () => void;
}

const PREVIEW: AgencyBillingPreview = { invoiceStates: true, crossBookRevenue: true };

interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthly_price_cents: number;
  annual_price_cents: number | null;
  included_seats: number;
  included_contacts: number | null;
}

interface ProductRow {
  id: string;
  name: string;
  product_type: string;
}
interface PriceRow {
  id: string;
  unit_amount: number;
  currency: string;
  billing_interval: string | null;
}
interface ServiceSubRow {
  id: string;
  product_id: string | null;
  price_id: string | null;
  status: string;
  billing_period: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
}

export function useAgencyBilling(ctx: AgencyShellCtx): AgencyBillingData {
  const aggregate = isAgencyAggregate(ctx);
  const { activeTenant } = useTenantContext();
  const planOffer = activeTenant?.plan_offer ?? null;
  const seatLimit = typeof activeTenant?.seat_limit === "number" ? activeTenant.seat_limit : null;

  // L1 — the platform plan catalog (active plans), matched to the tenant's plan_offer.
  const planQ = useQuery({
    queryKey: ["agency-billing-plan", planOffer],
    enabled: !!planOffer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AgencyPlan | null> => {
      const { data, error } = await supabase
        .from("platform_subscription_plans")
        .select(
          "id,slug,name,description,monthly_price_cents,annual_price_cents,included_seats,included_contacts,is_active",
        )
        .eq("is_active", true);
      if (error) throw error;
      const plans = (data ?? []) as PlanRow[];
      const key = (planOffer ?? "").trim().toLowerCase();
      const hit =
        plans.find((p) => p.slug?.toLowerCase() === key) ??
        plans.find((p) => p.name?.toLowerCase() === key) ??
        null;
      if (!hit) return null;
      return {
        id: hit.id,
        slug: hit.slug,
        name: hit.name,
        description: hit.description ?? null,
        monthlyPriceCents: hit.monthly_price_cents,
        annualPriceCents: hit.annual_price_cents ?? null,
        includedSeats: hit.included_seats,
        includedContacts: hit.included_contacts ?? null,
      };
    },
  });

  // L2 — own-book service subscriptions ⋈ products ⋈ prices (all RLS own-book).
  const subsQ = useQuery({
    queryKey: ["agency-billing-service-subs"],
    staleTime: 60_000,
    queryFn: async (): Promise<AgencyServiceSub[]> => {
      const [prodRes, priceRes, subRes] = await Promise.all([
        supabase.from("tenant_products").select("id,name,product_type"),
        supabase.from("tenant_prices").select("id,unit_amount,currency,billing_interval"),
        supabase
          .from("tenant_service_subscriptions")
          .select(
            "id,product_id,price_id,status,billing_period,cancel_at_period_end,current_period_start,current_period_end,created_at",
          )
          .order("created_at", { ascending: false }),
      ]);
      if (prodRes.error) throw prodRes.error;
      if (priceRes.error) throw priceRes.error;
      if (subRes.error) throw subRes.error;

      const products = new Map<string, ProductRow>();
      for (const p of (prodRes.data ?? []) as ProductRow[]) products.set(p.id, p);
      const prices = new Map<string, PriceRow>();
      for (const p of (priceRes.data ?? []) as PriceRow[]) prices.set(p.id, p);

      return ((subRes.data ?? []) as ServiceSubRow[]).map((s): AgencyServiceSub => {
        const prod = s.product_id ? products.get(s.product_id) : undefined;
        const price = s.price_id ? prices.get(s.price_id) : undefined;
        return {
          id: s.id,
          status: s.status,
          billingPeriod: s.billing_period,
          cancelAtPeriodEnd: s.cancel_at_period_end === true,
          currentPeriodStart: s.current_period_start ?? null,
          currentPeriodEnd: s.current_period_end ?? null,
          createdAt: s.created_at,
          productName: prod?.name ?? null,
          productType: prod?.product_type ?? null,
          priceUnitAmount: typeof price?.unit_amount === "number" ? price.unit_amount : null,
          priceCurrency: price?.currency ?? null,
          priceInterval: price?.billing_interval ?? null,
        };
      });
    },
  });

  const refresh = useCallback(() => {
    void planQ.refetch();
    void subsQ.refetch();
  }, [planQ, subsQ]);

  const serviceSubs = useMemo(() => subsQ.data ?? [], [subsQ.data]);

  return {
    mode: aggregate ? "agency" : "own",
    plan: planQ.data ?? null,
    planOffer,
    seatLimit,
    serviceSubs,
    loading: (!!planOffer && planQ.isLoading) || subsQ.isLoading,
    isError: planQ.isError || subsQ.isError,
    preview: PREVIEW,
    refresh,
  };
}
