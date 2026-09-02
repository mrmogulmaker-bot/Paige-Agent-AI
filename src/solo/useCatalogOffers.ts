// The tenant's canonical OFFER read — Campaigns → Catalog → Offers (Slice 2A).
//
// WHY THIS IS ITS OWN HOOK AND NOT A FIFTH READ INSIDE `useSoloCampaigns`.
// `growth2.contract.test.tsx` asserts that the campaigns adapter performs EXACTLY four
// `.eq("tenant_id", activeTenantId)` reads. That assertion exists to prove the adapter fails
// closed on tenant identity, and it is worth keeping sharp — a test that has to be edited every
// time a read is added stops being a guard. Offers are a different domain (the tenant's
// commercial record) from published creative artifacts (Vibe Studio's output), so they get their
// own adapter carrying its own identical fail-closed guard, and the existing assertion is left
// untouched. `catalog-offers.contract.test.tsx` asserts the same discipline over this file.
//
// It also keeps the diff off `useSoloCampaigns.ts`, which PR #706 currently owns.
//
// TRUTH BOUNDARY (§13). This reads what the tenant has recorded. It does not compute revenue,
// stock, conversion or demand, because none of those exist. A price recorded here is a PRESENTED
// price, never a checkout: tenant checkout is unreachable in production today.
import { useCallback, useEffect, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

/** Mirrors `tenant_products.status` after migration 20261044000000. */
export type OfferAvailability = "draft" | "active" | "paused" | "archived";
/** Mirrors `tenant_products.product_type`, which predates this slice. */
export type OfferProductType = "one_time" | "recurring" | "service";
export type OfferDeliveryShape =
  | "digital" | "physical" | "appointment" | "program" | "membership" | "hybrid";
export type OfferPricePresentation = "fixed" | "from" | "contact" | "none";
export type OfferCustomerAction = "buy" | "book" | "apply" | "enquire" | "learn";

export type OfferPrice = {
  readonly id: string;
  readonly nickname: string | null;
  /** Minor units, exactly as `tenant_prices.unit_amount` stores them. */
  readonly unitAmount: number | null;
  readonly currency: string | null;
  readonly billingInterval: string | null;
  readonly kind: string | null;
  readonly active: boolean;
};

export type CatalogOffer = {
  readonly id: string;
  readonly name: string;
  /** One customer-facing sentence. Null when the tenant has not written one. */
  readonly summary: string | null;
  readonly description: string | null;
  readonly availability: OfferAvailability;
  readonly productType: OfferProductType;
  readonly deliveryShape: OfferDeliveryShape | null;
  readonly pricePresentation: OfferPricePresentation | null;
  readonly customerAction: OfferCustomerAction | null;
  readonly category: string | null;
  readonly imageUrl: string | null;
  readonly updatedAt: string | null;
  /** Every recorded price, ordered as the tenant ordered them. Never collapsed to one. */
  readonly prices: readonly OfferPrice[];
};

export type CatalogOffersState = {
  readonly tenantId: string | null;
  readonly phase: "resolving" | "loading" | "ready" | "error" | "unavailable";
  readonly offers: readonly CatalogOffer[];
  /** True only for a tenant admin/owner. Slice 2A shows no acts; 2B gates its commands on this. */
  readonly canManage: boolean;
  readonly retry: () => void;
};

const EMPTY = { offers: [] as readonly CatalogOffer[], canManage: false };

/**
 * A row is only as classified as the tenant made it. An unrecognised value from the database is
 * narrowed to null rather than coerced into a neighbour — a wrong label is worse than no label.
 */
function narrow<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const SHAPES: readonly OfferDeliveryShape[] =
  ["digital", "physical", "appointment", "program", "membership", "hybrid"];
const PRESENTATIONS: readonly OfferPricePresentation[] = ["fixed", "from", "contact", "none"];
const ACTIONS: readonly OfferCustomerAction[] = ["buy", "book", "apply", "enquire", "learn"];
const AVAILABILITIES: readonly OfferAvailability[] = ["draft", "active", "paused", "archived"];

export function useCatalogOffers(): CatalogOffersState {
  const { activeTenantId, accountContextLoading } = useTenantContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<CatalogOffersState, "retry">>({
    tenantId: activeTenantId ?? null,
    phase: accountContextLoading ? "resolving" : "loading",
    ...EMPTY,
  });
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let current = true;

    // Fail closed on identity, exactly as the campaigns adapter does. No tenant, no read.
    if (accountContextLoading) {
      setState({ tenantId: activeTenantId ?? null, phase: "resolving", ...EMPTY });
      return () => { current = false; };
    }
    if (!activeTenantId) {
      setState({ tenantId: null, phase: "unavailable", ...EMPTY });
      return () => { current = false; };
    }

    setState({ tenantId: activeTenantId, phase: "loading", ...EMPTY });
    void (async () => {
      try {
        // THE DEPLOY-ORDER RACE THIS CLOSES. The five offer columns arrive in migration
        // 20261044000000, which CI applies on push to `main` — the same push Vercel builds from.
        // Whichever lands first, this read must not break: asking for a column that does not exist
        // yet makes PostgREST reject the whole request (42703) and the surface would go to its
        // error state for every tenant until the migration caught up. So the extended read is
        // attempted first and falls back to the columns that have always existed, rendering the
        // unmigrated fields as the honest "Not stated" they already render when a tenant has not
        // filled them in. The fallback becomes dead weight once the migration is live; it is
        // removed in Slice 2B, which writes these columns and therefore hard-requires them.
        const EXTENDED = "id,name,summary,description,status,product_type,delivery_shape,price_presentation,customer_action,category,image_url,updated_at";
        const BASE = "id,name,description,status,product_type,image_url,updated_at";
        type ProductRead = {
          data: unknown[] | null;
          error: { code?: string; message?: string } | null;
        };
        const isMissingColumn = (error: ProductRead["error"]) =>
          !!error && (error.code === "42703" || /does not exist/i.test(error.message ?? ""));
        // One helper for both attempts so the two selects cannot drift apart in scope or order,
        // and so the narrower BASE result stays assignable to the same variable.
        const readProducts = async (columns: string): Promise<ProductRead> =>
          (await supabase
            .from("tenant_products")
            .select(columns)
            .eq("tenant_id", activeTenantId)
            .order("name", { ascending: true })) as unknown as ProductRead;

        let productResponse = await readProducts(EXTENDED);
        if (isMissingColumn(productResponse.error)) {
          console.warn("[catalog-offers] offer columns not migrated yet; reading the base record");
          productResponse = await readProducts(BASE);
        }

        const [priceResponse, roleResponse] = await Promise.all([
          supabase
            .from("tenant_prices")
            .select("id,product_id,nickname,unit_amount,currency,billing_interval,kind,active,sort_order")
            .eq("tenant_id", activeTenantId)
            .order("sort_order", { ascending: true }),
          // Authority is asked about THIS workspace, never a global role (§59's global-role trap).
          supabase
            .from("tenant_members")
            .select("tenant_role")
            .eq("tenant_id", activeTenantId)
            .maybeSingle(),
        ]);

        const firstError = [productResponse.error, priceResponse.error].find(Boolean);
        if (firstError) throw firstError;
        if (!current) return;

        const pricesByProduct = new Map<string, OfferPrice[]>();
        for (const row of (priceResponse.data ?? []) as Record<string, unknown>[]) {
          const productId = String(row.product_id ?? "");
          if (!productId) continue;
          const list = pricesByProduct.get(productId) ?? [];
          list.push({
            id: String(row.id ?? ""),
            nickname: typeof row.nickname === "string" ? row.nickname : null,
            unitAmount: typeof row.unit_amount === "number" ? row.unit_amount : null,
            currency: typeof row.currency === "string" ? row.currency : null,
            billingInterval: typeof row.billing_interval === "string" ? row.billing_interval : null,
            kind: typeof row.kind === "string" ? row.kind : null,
            active: row.active !== false,
          });
          pricesByProduct.set(productId, list);
        }

        // `types.ts` is generated from production, which has not applied 20261044000000 yet, so it
        // does not know the five new columns. The cast is through `unknown` deliberately: it is a
        // statement that this shape is wider than the generated type, not a claim that they match.
        // Regenerating types after the migration lands narrows it back — see the Gate B packet.
        const offers: CatalogOffer[] = ((productResponse.data ?? []) as unknown as Record<string, unknown>[])
          .map((row) => ({
            id: String(row.id ?? ""),
            name: typeof row.name === "string" ? row.name : "",
            summary: typeof row.summary === "string" && row.summary.trim() ? row.summary : null,
            description: typeof row.description === "string" && row.description.trim() ? row.description : null,
            // An unreadable status is treated as a draft: the safest reading is the one that
            // shows the offer to nobody.
            availability: narrow(row.status, AVAILABILITIES) ?? "draft",
            productType: narrow(row.product_type, ["one_time", "recurring", "service"] as const) ?? "one_time",
            deliveryShape: narrow(row.delivery_shape, SHAPES),
            pricePresentation: narrow(row.price_presentation, PRESENTATIONS),
            customerAction: narrow(row.customer_action, ACTIONS),
            category: typeof row.category === "string" && row.category.trim() ? row.category : null,
            imageUrl: typeof row.image_url === "string" ? row.image_url : null,
            updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
            prices: pricesByProduct.get(String(row.id ?? "")) ?? [],
          }));

        const role = (roleResponse.data as { tenant_role?: unknown } | null)?.tenant_role;
        const canManage = role === "owner" || role === "admin";

        setState({ tenantId: activeTenantId, phase: "ready", offers, canManage });
      } catch (error) {
        console.error("[catalog-offers] tenant-scoped offer read failed", error);
        if (!current) return;
        setState({ tenantId: activeTenantId, phase: "error", ...EMPTY });
      }
    })();

    return () => { current = false; };
  }, [activeTenantId, accountContextLoading, refreshKey]);

  return { ...state, retry };
}
