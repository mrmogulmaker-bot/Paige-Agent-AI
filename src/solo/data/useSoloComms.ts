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
 * DOMAIN WRITES ARE LIVE (corrected 2026-08-31). This header used to declare every
 * write "a separate slice" and the surface rendered those controls disabled. But
 * `manage-tenant-domain` had ALREADY shipped add / refresh / set_default / remove —
 * released, tenant-scoped, callable — so the deferral was describing a decision an
 * earlier session made, not a contract that was missing. A stale deferral read as a
 * limit is how a supported capability ends up static behind an "unavailable" label.
 * `manageDomain` below exposes those four verbs and nothing else.
 *
 * STILL DEFERRED, and genuinely so: notification toggles, and subscribe/checkout —
 * the latter moves money (§38) and has no seam here.
 *
 * §9: no client-supplied tenant_id — the edge fn + RPCs derive scope from the
 * verified session/RLS. Honest degrade (§13): a failed read surfaces an error and
 * an empty/`null` shape, never a fabricated domain or plan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";
import { readDnsRecords, type DnsRecord } from "../domainActions";

export interface SoloDomain {
  id: string;
  domain: string;
  fromEmailLocal: string;
  fromName: string;
  status: string;
  isDefault: boolean;
  /** What the tenant must publish at their registrar before this can verify.
   *  Carried because a domain added without them is a dead end — the person has
   *  no way to finish, and "pending" would never become "verified". */
  dnsRecords: DnsRecord[];
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
  /**
   * The four released sender-domain verbs.
   *
   * Resolves to `{ ok: true }` or `{ ok: false, error }` where `error` is the
   * function's own code — NEVER rendered directly; the caller maps it through
   * `domainOutcomeFor`, because the 502 arm's error is the upstream provider's
   * response body. It never throws: a rejected write is an outcome this surface
   * has to show, not an exception that blanks the card.
   *
   * No `tenant_id` is ever sent. The function derives it from the session and
   * rejects a body value that disagrees, so passing one could only ever be
   * theatre or an attempt at someone else's account.
   */
  manageDomain: (
    verb: "add" | "refresh" | "set_default" | "remove",
    payload: { domain?: string; from_name?: string; from_email_local?: string; id?: string },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null);
  const requestGate = useRef(createSettingsRequestGate());

  const load = useCallback(async () => {
    const requestToken = requestGate.current.begin();
    // Clear the previous account before the next account resolves. Nothing tenant-derived
    // is allowed to remain visible during the switch.
    setLoadedTenantId(null);
    setDomains([]);
    setSending({ fromName: null, supportEmail: null, defaultSender: null });
    setBilling(null);
    setError(null);
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
      if (!requestGate.current.isCurrent(requestToken)) return;

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
          dnsRecords: readDnsRecords(r.dns_records),
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
        const [plansRes, subRes, adminRes] = billingRes as unknown as [
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
      setLoadedTenantId(tenantId);
    } catch (e) {
      if (!requestGate.current.isCurrent(requestToken)) return;
      setError(e instanceof Error ? e.message : "Couldn't load your comms settings.");
    } finally {
      if (requestGate.current.isCurrent(requestToken)) setLoading(false);
    }
  }, [tenantId, isSubAccount]);

  useEffect(() => {
    const activeGate = requestGate.current;
    if (tenantLoading) return;
    void load();
    return () => activeGate.clear();
  }, [tenantLoading, load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  /**
   * Drive one of the four released verbs, then RE-READ.
   *
   * The re-read is the point: `add` returns the created row and `set_default`
   * returns only `{ ok: true }`, so patching local state from the response would
   * give two different fidelities of truth and drift from the record on the next
   * verb. Reloading means the card always shows what the account actually holds.
   *
   * The invoke is wrapped because `functions.invoke` REJECTS on a non-2xx rather
   * than returning the body — an unwrapped call would throw out of a click
   * handler and blank the surface instead of showing the tenant what happened.
   */
  const manageDomain = useCallback(
    async (
      verb: "add" | "refresh" | "set_default" | "remove",
      payload: { domain?: string; from_name?: string; from_email_local?: string; id?: string },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke("manage-tenant-domain", {
          body: { verb, ...payload },
        });
        if (invokeErr) {
          // The real payload rides on `context`, a Response; the top-level
          // message is the generic non-2xx sentence and carries no code.
          const ctx = (invokeErr as { context?: { json?: () => Promise<unknown> } }).context;
          let code: string | null = null;
          try {
            const parsed = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
            const e = (parsed as { error?: unknown } | null)?.error;
            if (typeof e === "string") code = e;
          } catch {
            code = null;
          }
          return { ok: false, error: code ?? "unknown" };
        }
        // A 200 can still carry `{ error }` from an arm that returns it directly.
        const bodyErr = (data as { error?: unknown } | null)?.error;
        if (typeof bodyErr === "string") return { ok: false, error: bodyErr };
        await load();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "unknown" };
      }
    },
    [load],
  );

  return useMemo(
    () => ({
      loading: loading || tenantLoading || Boolean(tenantId && loadedTenantId !== tenantId),
      error,
      isSubAccount,
      domains: loadedTenantId === tenantId ? domains : [],
      sending: loadedTenantId === tenantId ? sending : { fromName: null, supportEmail: null, defaultSender: null },
      billing: loadedTenantId === tenantId ? billing : null,
      refresh,
      manageDomain,
    }),
    [loading, tenantLoading, tenantId, loadedTenantId, error, isSubAccount, domains, sending, billing, refresh, manageDomain],
  );
}
