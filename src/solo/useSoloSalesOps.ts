// The tenant's SALES OPERATIONS read — Campaigns → Sales.
//
// WHY THIS IS ITS OWN HOOK.
// Two reasons, and both are structural rather than stylistic.
//
// 1. `growth2.contract.test.tsx` asserts that `useSoloCampaigns` performs EXACTLY four
//    `.eq("tenant_id", activeTenantId)` reads. That assertion exists to prove the adapter fails
//    closed on tenant identity, and it is worth keeping sharp — a test that has to be edited every
//    time a read is added stops being a guard. A fifth read there reddens CI.
// 2. `useSoloCampaigns.ts` is currently owned by PR #706 (Solo Pipeline). Keeping this diff off it
//    is the same move `useCatalogOffers.ts` made, for the same reason.
//
// WHAT THIS READS, AND WHAT IT DELIBERATELY DOES NOT.
// It reads three things the workspace has actually recorded: how it says it takes money
// (`tenants.payment_processor_declared` / `payment_methods_declared`), the commercial events that
// exist (`tenant_orders`), and whether the caller may manage any of it. Offers are NOT read here —
// `useCatalogOffers` is the one home for the canonical offer record (§18), and Sales calls it
// rather than growing a second opinion about what the business sells. Deals are NOT read here
// either; they already arrive on the Campaigns snapshot.
//
// TRUTH BOUNDARY (§13/§38). Nothing here computes revenue, forecast, attribution, or "performance".
// `tenant_orders` rows are the only monetary facts on this surface and they are shown as recorded,
// never summed into a figure the record does not prove. Paige is not the merchant of record for
// any of it — see the migration header for `declare_client_payment_handling`.
import { useCallback, useEffect, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

/** Mirrors `tenants_payment_processor_declared_chk`. `not_yet` is a real, chosen answer. */
export type DeclaredProcessor =
  | "stripe" | "paypal" | "square" | "bank_merchant" | "quickbooks_payments" | "manual" | "not_yet";

/** Mirrors `tenants_payment_methods_declared_chk`. */
export type DeclaredMethod =
  | "cards" | "ach" | "zelle" | "wire" | "check" | "cash" | "bank_transfer" | "crypto" | "other";

export const DECLARED_PROCESSORS: readonly DeclaredProcessor[] =
  ["stripe", "paypal", "square", "bank_merchant", "quickbooks_payments", "manual", "not_yet"];
export const DECLARED_METHODS: readonly DeclaredMethod[] =
  ["cards", "ach", "zelle", "wire", "check", "cash", "bank_transfer", "crypto", "other"];

/**
 * One recorded commercial event. Every field is what the row holds — nothing is derived, and an
 * absent amount stays null so the surface can render an em-dash instead of a zero.
 */
export type CommercialEvent = {
  readonly id: string;
  readonly productId: string | null;
  readonly customerName: string | null;
  readonly customerEmail: string | null;
  /** MINOR units, exactly as `tenant_orders.amount_total` stores them. */
  readonly amountTotal: number | null;
  readonly currency: string | null;
  readonly status: OrderStatus;
  readonly createdAt: string | null;
};

/**
 * `tenant_orders.status` after its CHECK, plus `unrecognised` for a value this build has no reading
 * for. The fifth member is not a status anything can record: it is what the surface SAYS when a
 * later migration widens the CHECK and this deployment has not caught up. Coercing it to "pending"
 * would assert a money state the record does not prove.
 */
export type OrderStatus = "pending" | "complete" | "failed" | "refunded" | "cancelled" | "unrecognised";
const ORDER_STATUSES: readonly OrderStatus[] =
  ["pending", "complete", "failed", "refunded", "cancelled"];

export type SalesOpsWriteResult = {
  readonly ok: boolean;
  readonly message?: string;
  readonly result?: Record<string, unknown> | null;
};

export type SalesOpsState = {
  readonly tenantId: string | null;
  readonly phase: "resolving" | "loading" | "ready" | "error" | "unavailable";
  /** Null until the workspace states one. Never inferred from a connected account. */
  readonly processor: DeclaredProcessor | null;
  /** True when the column holds something this build cannot read — distinct from "not stated". */
  readonly processorUnrecognised: boolean;
  readonly methods: readonly DeclaredMethod[];
  readonly orders: readonly CommercialEvent[];
  /**
   * FALSE when the caller may not read `tenant_orders` at all (its RLS is `is_tenant_admin`, which
   * is stricter than the `is_tenant_member` that got them onto this surface). An empty list from an
   * unreadable table is NOT "no activity", and rendering it as such is the exact class of lie this
   * flag exists to prevent.
   */
  readonly ordersReadable: boolean;
  readonly canManage: boolean;
  /** The authority read itself failed. Distinct from "the caller is not an admin". */
  readonly authorityUnknown: boolean;
  readonly retry: () => void;
  readonly declarePaymentHandling: (
    processor: DeclaredProcessor,
    methods: readonly DeclaredMethod[] | null,
  ) => Promise<SalesOpsWriteResult>;
};

const EMPTY = {
  processor: null as DeclaredProcessor | null,
  processorUnrecognised: false,
  methods: [] as readonly DeclaredMethod[],
  orders: [] as readonly CommercialEvent[],
  ordersReadable: false,
  canManage: false,
  authorityUnknown: false,
};

/** An unrecognised value is narrowed to null rather than coerced. A wrong label beats no label never. */
function narrow<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

export function useSoloSalesOps(): SalesOpsState {
  const { activeTenantId, accountContextLoading } = useTenantContext();
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<Omit<SalesOpsState, "retry" | "declarePaymentHandling">>({
    tenantId: activeTenantId ?? null,
    phase: accountContextLoading ? "resolving" : "loading",
    ...EMPTY,
  });
  const retry = useCallback(() => setRefreshKey((key) => key + 1), []);

  // The write lives here, beside the read it has to refresh, and the tenant it sends is the one
  // THIS hook resolved. `_expected_tenant_id` is refusal-only on the server: it never selects a
  // workspace, it can only abort — which is what makes a form opened against one workspace fail
  // rather than silently save into another the same person also belongs to.
  const declarePaymentHandling = useCallback(async (
    processor: DeclaredProcessor,
    methods: readonly DeclaredMethod[] | null,
  ): Promise<SalesOpsWriteResult> => {
    if (!activeTenantId) {
      return { ok: false, message: "This workspace could not be resolved, so nothing was saved." };
    }
    const { data, error } = await supabase.rpc(
      "declare_client_payment_handling" as never,
      {
        _expected_tenant_id: activeTenantId,
        _processor: processor,
        // null means "leave the methods alone"; [] means "clear them". They are different
        // instructions and the server keeps them different.
        _methods: methods === null ? null : [...methods],
      } as never,
    );
    if (error) {
      // The server writes these sentences for the person, not for a log, so they surface as
      // written. A message we cannot read still says plainly that nothing changed — the function
      // is a single statement, so there is no partial outcome to describe.
      console.error("[sales-ops] declare_client_payment_handling failed", error);
      return { ok: false, message: error.message || "That could not be saved. Nothing was changed." };
    }
    setRefreshKey((key) => key + 1);
    return { ok: true, result: (data ?? null) as Record<string, unknown> | null };
  }, [activeTenantId]);

  useEffect(() => {
    let current = true;

    // Fail closed on identity, exactly as the sibling adapters do. No tenant, no read.
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
        const { data: authData } = await supabase.auth.getUser();
        const callerId = authData.user?.id ?? null;

        const [tenantResponse, orderResponse, roleResponse] = await Promise.all([
          // The workspace's own row. `id` IS the tenant scope here — this is not an unscoped read.
          supabase
            .from("tenants")
            .select("id,payment_processor_declared,payment_methods_declared")
            .eq("id", activeTenantId)
            .maybeSingle(),
          // Bounded deliberately. This is a recent-activity list, not a ledger, and saying "the
          // most recent 50" is honest in a way that an unbounded read silently presented as
          // "everything" is not.
          supabase
            .from("tenant_orders")
            .select("id,product_id,customer_name,customer_email,amount_total,currency,status,created_at")
            .eq("tenant_id", activeTenantId)
            .order("created_at", { ascending: false })
            .limit(50),
          // Authority is asked about THIS workspace, never a global role (§59's global-role trap).
          // Asked about the CALLER's own row: `tenant_members`'s SELECT policy lets a plain member
          // see exactly one row and an admin see every row, so a tenant-scoped `.maybeSingle()`
          // resolves for the member and fails for the owner — precisely backwards.
          callerId
            ? supabase
                .from("tenant_members")
                .select("role")
                .eq("tenant_id", activeTenantId)
                .eq("user_id", callerId)
                .eq("status", "active")
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (tenantResponse.error) throw tenantResponse.error;
        if (!current) return;

        if (roleResponse.error) {
          // A failed authority read is not the same as a caller with no authority. Treating the
          // first as the second is how an owner gets told they may not change their own settings.
          console.error("[sales-ops] membership read failed; treating authority as unknown", roleResponse.error);
        }

        // `tenant_orders` is admin-only at the RLS layer while this surface is member-reachable, so
        // a read failure here is EXPECTED for a plain member and must not error the whole surface.
        // It is recorded as "not readable" and rendered as such.
        const ordersReadable = !orderResponse.error;
        if (orderResponse.error) {
          console.warn("[sales-ops] commercial activity is not readable for this caller", orderResponse.error);
        }

        // `types.ts` is generated from production and predates the two declared-payment columns, so
        // PostgREST's typed client resolves this select to a `SelectQueryError` rather than a row.
        // The cast goes through `unknown` deliberately, exactly as `useCatalogOffers` does for the
        // same reason: it is a statement that this shape is wider than the generated type, not a
        // claim that they match. Regenerating types narrows it back. The columns themselves are
        // live on prod — verified by query, not assumed.
        const tenantRow = (tenantResponse.data ?? null) as unknown as Record<string, unknown> | null;
        const rawProcessor = tenantRow?.payment_processor_declared;
        const processor = narrow(rawProcessor, DECLARED_PROCESSORS);
        const rawMethods = tenantRow?.payment_methods_declared;
        const methods = (Array.isArray(rawMethods) ? rawMethods : [])
          .map((m) => narrow(m, DECLARED_METHODS))
          .filter((m): m is DeclaredMethod => m !== null);

        const orders: CommercialEvent[] = ((orderResponse.data ?? []) as Record<string, unknown>[])
          .map((row) => ({
            id: String(row.id ?? ""),
            productId: typeof row.product_id === "string" ? row.product_id : null,
            customerName: typeof row.customer_name === "string" && row.customer_name.trim()
              ? row.customer_name : null,
            customerEmail: typeof row.customer_email === "string" && row.customer_email.trim()
              ? row.customer_email : null,
            amountTotal: typeof row.amount_total === "number" ? row.amount_total : null,
            currency: typeof row.currency === "string" ? row.currency : null,
            status: narrow(row.status, ORDER_STATUSES) ?? "unrecognised",
            createdAt: typeof row.created_at === "string" ? row.created_at : null,
          }));

        const role = (roleResponse.data as { role?: unknown } | null)?.role;

        setState({
          tenantId: activeTenantId,
          phase: "ready",
          processor,
          // The column held a value and this build could not read it. Rendering that as "not
          // stated" would be indistinguishable from a workspace that never answered.
          processorUnrecognised: processor === null
            && typeof rawProcessor === "string"
            && rawProcessor.trim().length > 0,
          methods,
          orders,
          ordersReadable,
          canManage: role === "owner" || role === "admin",
          authorityUnknown: Boolean(roleResponse.error) || !callerId,
        });
      } catch (error) {
        console.error("[sales-ops] tenant-scoped sales read failed", error);
        if (!current) return;
        setState({ tenantId: activeTenantId, phase: "error", ...EMPTY });
      }
    })();

    return () => { current = false; };
  }, [activeTenantId, accountContextLoading, refreshKey]);

  // WHY THIS IS NOT JUST `return state`. `setState` inside the effect runs AFTER paint, so on the
  // render where `activeTenantId` changes IN PLACE — which is what an operator's `switchTenant`
  // does, without remounting, because `GrowthHub` is keyed by route and not by tenant — `state`
  // still holds the PREVIOUS workspace's ready data. For that one paint the surface would render
  // another tenant's customer names and amounts under the newly selected workspace. The sibling
  // adapters already guard this synchronously; this is the same guard, not a second invention.
  const synchronousTenantId = activeTenantId ?? null;
  const visible = state.tenantId === synchronousTenantId ? state : {
    tenantId: synchronousTenantId,
    phase: accountContextLoading ? "resolving" as const
      : synchronousTenantId ? "loading" as const
      : "unavailable" as const,
    ...EMPTY,
  };
  return { ...visible, retry, declarePaymentHandling };
}
