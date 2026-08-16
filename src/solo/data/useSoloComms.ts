/**
 * useSoloComms — the Solo Setup › Comms & data adapter (§18: composes the EXISTING
 * `manage-tenant-domain` + platform-billing seams, never a new query family).
 *
 * READ-ONLY this slice. It surfaces two real things:
 *   1. SENDING IDENTITY — the tenant's sender domains via the EmailDomainsPanel
 *      seam (`manage-tenant-domain` verb:"list") + the brand from_name/support_email
 *      (tenants.brand). The platform default is `no-reply@paigeagent.ai`.
 *   2. BILLING — the tenant's real Paige plan/status via the SetupBilling seam
 *      (platform_subscription_plans + get_tenant_platform_subscription +
 *      is_current_user_tenant_admin). §217/§38: a SUB-ACCOUNT's billing is the
 *      parent agency's — we do NOT fetch a plan and report `isSubAccount` so the
 *      caller renders the honest "managed by your agency" empty state.
 *
 * DEFERRED (§13/§38 — NO fake action): every WRITE — add/refresh/set-default/remove
 * a domain, notification toggles, subscribe/checkout (money, §38) — is a separate
 * slice. This adapter exposes NO mutation; the Setup surface renders those controls
 * DISABLED/Preview.
 *
 * §9: no client-supplied tenant_id — the edge fn + RPCs derive scope from the
 * verified session/RLS. Honest degrade (§13): a failed read surfaces an error and
 * an empty/`null` shape, never a fabricated domain or plan.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

export interface SoloDomain {
  id: string;
  domain: string;
  fromEmailLocal: string;
  fromName: string;
  status: string;
  isDefault: boolean;
}

export interface SoloSendingIdentity {
  fromName: string | null;
  supportEmail: string | null;
  /** The tenant's own verified/default sender, or null when only the platform default applies. */
  defaultSender: string | null;
}

export interface SoloBillingPlan {
  name: string;
  /** "trialing" | "active" | "past_due" | … | null when no subscription. */
  status: string | null;
  priceLabel: string | null;
  renewsLabel: string | null;
  /** True when the caller may manage billing (tenant admin), fail-closed. */
  canManage: boolean;
  hasActiveSub: boolean;
}

export interface SoloCommsData {
  loading: boolean;
  error: string | null;
  /** True when this tenant is a sub-account (billing is the parent agency's). */
  isSubAccount: boolean;
  domains: SoloDomain[];
  sending: SoloSendingIdentity;
  /** Null while loading, for a sub-account (parent-managed), or when unresolved. */
  billing: SoloBillingPlan | null;
  refresh: () => void;
}

/* ----- billing helpers (mirrors SetupBilling) --------------------------------- */
interface PlanRow {
  id: string;
  slug: string;
  name: string;
  monthly_price_cents: number;
  annual_price_cents: number | null;
}
interface CurrentSub {
  plan_id?: string | null;
  plan_slug?: string | null;
  status?: string | null;
  billing_period?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
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
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function useSoloComms(): SoloCommsData {
  const { activeTenant, activeTenantId, loading: tenantLoading } = useTenantContext();
  const tenantId = activeTenantId;
  const isSubAccount = activeTenant?.parent_tenant_id != null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<SoloDomain[]>([]);
  const [sending, setSending] = useState<SoloSendingIdentity>({
    fromName: null,
    supportEmail: null,
    defaultSender: null,
  });
  const [billing, setBilling] = useState<SoloBillingPlan | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Sending identity is meaningful on every tier; billing is skipped for a
      // sub-account (its plan is the parent agency's — §217/§38).
      const [domainRes, brandRes, ...billingRes] = await Promise.all([
        supabase.functions.invoke("manage-tenant-domain", { body: { verb: "list" } }),
        supabase.from("tenants").select("brand").eq("id", tenantId).maybeSingle(),
        ...(isSubAccount
          ? []
          : [
              supabase
                .from("platform_subscription_plans")
                .select("id,slug,name,monthly_price_cents,annual_price_cents")
                .eq("is_active", true),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types (repo-wide pattern)
              supabase.rpc("get_tenant_platform_subscription" as any),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types (repo-wide pattern)
              supabase.rpc("is_current_user_tenant_admin" as any),
            ]),
      ]);

      // --- sending identity ---
      if (domainRes.error) throw domainRes.error;
      const domainData = domainRes.data as { domains?: unknown } | null;
      const rawDomains = Array.isArray(domainData?.domains) ? domainData!.domains : [];
      const parsedDomains: SoloDomain[] = rawDomains.map((d) => {
        const r = asRecord(d);
        return {
          id: String(r.id ?? ""),
          domain: str(r.domain) ?? "",
          fromEmailLocal: str(r.from_email_local) ?? "no-reply",
          fromName: str(r.from_name) ?? "",
          status: str(r.status) ?? "pending",
          isDefault: r.is_default === true,
        };
      });
      setDomains(parsedDomains);

      const brand = asRecord(brandRes.data?.brand);
      const defaultDomainRow =
        parsedDomains.find((d) => d.isDefault) ??
        parsedDomains.find((d) => d.status === "verified") ??
        null;
      setSending({
        fromName: str(brand.from_name),
        supportEmail: str(brand.support_email),
        defaultSender: defaultDomainRow
          ? `${defaultDomainRow.fromEmailLocal}@${defaultDomainRow.domain}`
          : null,
      });

      // --- billing (skipped for sub-accounts) ---
      if (isSubAccount) {
        setBilling(null);
      } else {
        const [plansRes, subRes, adminRes] = billingRes as [
          { data: PlanRow[] | null; error: unknown },
          { data: unknown; error: unknown },
          { data: unknown; error: unknown },
        ];
        const canManage = adminRes.data === true; // fail-closed
        const plans = (plansRes.data ?? []) as PlanRow[];
        const subRaw = (subRes.data as CurrentSub[] | CurrentSub | null) ?? null;
        const sub = Array.isArray(subRaw) ? (subRaw[0] ?? null) : subRaw;
        const hasActiveSub = Boolean(
          sub && (sub.status ? sub.status !== "canceled" && sub.status !== "cancelled" : true),
        );
        const plan =
          sub &&
          plans.find(
            (p) =>
              (sub.plan_slug && p.slug === sub.plan_slug) || (sub.plan_id && p.id === sub.plan_id),
          );
        let priceLabel: string | null = null;
        if (plan) {
          const annual = sub?.billing_period === "annual";
          const cents = annual
            ? plan.annual_price_cents ?? plan.monthly_price_cents * 12
            : plan.monthly_price_cents;
          priceLabel = `${formatUsd(cents)}/${annual ? "yr" : "mo"}`;
        }
        const periodEnd = formatDate(sub?.current_period_end);
        setBilling({
          name: plan?.name ?? (hasActiveSub ? "Your Paige plan" : "No plan yet"),
          status: sub?.status ?? null,
          priceLabel,
          renewsLabel: sub?.cancel_at_period_end
            ? periodEnd
              ? `Cancels ${periodEnd}`
              : "Cancels at period end"
            : periodEnd
              ? `Renews ${periodEnd}`
              : null,
          canManage,
          hasActiveSub,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your comms settings.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, isSubAccount]);

  useEffect(() => {
    if (tenantLoading) return;
    void load();
  }, [tenantLoading, load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return useMemo(
    () => ({ loading: loading || tenantLoading, error, isSubAccount, domains, sending, billing, refresh }),
    [loading, tenantLoading, error, isSubAccount, domains, sending, billing, refresh],
  );
}
