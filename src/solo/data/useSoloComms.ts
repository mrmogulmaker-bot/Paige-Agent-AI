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
 * WRITES (this slice, 2026-08-31). The domain lifecycle, the carrier-facing business
 * details, and the Google sending-account connection are now real, because a surface
 * that reports "business name still missing" and gives nobody a field to type it in
 * is describing a capability rather than providing one (§70). Every write reuses a
 * seam that ALREADY EXISTED and already enforces authority server-side:
 *
 *   business details → `set_tenant_brand(_tenant_id, _patch)`. It MERGES
 *     (`brand = COALESCE(brand,'{}') || _patch`) and raises 42501 through
 *     `can_manage_tenant_brand`. Merging is not incidental: `WorkspaceSettingsPanel`
 *     used to write the whole `brand` object with four keys, which silently DELETED
 *     these three. That panel now goes through the same RPC.
 *   domains         → `manage-tenant-domain` verbs add/refresh/set_default/remove,
 *     the same seam `EmailDomainsPanel` has used on the legacy admin route.
 *   Google account  → `gmail-oauth-start` / `gmail-disconnect`.
 *
 * STILL DEFERRED (§13/§38 — NO fake action): notification toggles and
 * subscribe/checkout (money, §38). Those controls stay DISABLED/Preview.
 *
 * NO SILENT PROVIDER ACTION (§38): `startGmailConnect` RETURNS a consent URL and
 * navigates nowhere. The person clicks it. Nothing in this adapter activates a
 * provider, spends money, or changes a credential on its own.
 *
 * §9: no client-supplied tenant_id — the edge fn + RPCs derive scope from the
 * verified session/RLS. Honest degrade (§13): a failed read surfaces an error and
 * an empty/`null` shape, never a fabricated domain or plan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";

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

/**
 * The carrier-facing business record, read from `tenants.brand`.
 *
 * These are the SAME three fields `tenant_comms_readiness()` grades for the
 * "Business details" step, read from the same jsonb, so the editor and the
 * readiness ladder can never disagree about whether a name is on file.
 */
export interface SoloBusinessDetails {
  name: string;
  website: string;
  phone: string;
}

/**
 * A connected Google sending account.
 *
 * NOT called a mailbox, deliberately (§13). `gmail-oauth-start` requests
 * `gmail.send` and `userinfo.email` only — there is no `gmail.readonly` or
 * `gmail.modify` in the scope set, so nothing here proves inbound mail is read.
 * Calling it a mailbox would claim a capability the OAuth grant does not carry.
 */
export interface SoloMailbox {
  connected: boolean;
  address: string | null;
  displayName: string | null;
  provider: string | null;
  status: string | null;
}

/** Thrown-free result shape: every mutation reports what actually happened (§13). */
export interface SoloMutationResult {
  ok: boolean;
  error: string | null;
}

export interface SoloCommsData {
  loading: boolean;
  error: string | null;
  /** True when this tenant is a sub-account (billing is the parent agency's). */
  isSubAccount: boolean;
  domains: SoloDomain[];
  sending: SoloSendingIdentity;
  business: SoloBusinessDetails;
  /** Null while loading or unresolved; `connected:false` is a real answer. */
  mailbox: SoloMailbox | null;
  /** Null while loading, for a sub-account (parent-managed), or when unresolved. */
  billing: SoloBillingPlan | null;
  /** True when the caller may write brand/domains here — fail-closed. */
  canManage: boolean;
  refresh: () => void;

  /* ----- mutations (this slice) --------------------------------------------
   * Every one goes through a seam that already existed and already enforces
   * authority server-side: `set_tenant_brand` raises 42501 via
   * `can_manage_tenant_brand`, and `manage-tenant-domain` derives its tenant
   * from the verified session. None of them takes a client-supplied tenant id.
   */
  saveBusiness: (next: SoloBusinessDetails) => Promise<SoloMutationResult>;
  addDomain: (input: { domain: string; fromEmailLocal: string; fromName: string }) => Promise<SoloMutationResult>;
  refreshDomain: (id: string) => Promise<SoloMutationResult>;
  setDefaultDomain: (id: string) => Promise<SoloMutationResult>;
  removeDomain: (id: string) => Promise<SoloMutationResult>;
  /** Returns the provider consent URL for the CALLER to open. Never auto-navigated. */
  startGmailConnect: () => Promise<{ url: string | null; error: string | null }>;
  disconnectGmail: () => Promise<SoloMutationResult>;
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
  const [business, setBusiness] = useState<SoloBusinessDetails>({ name: "", website: "", phone: "" });
  const [mailbox, setMailbox] = useState<SoloMailbox | null>(null);
  const [canManage, setCanManage] = useState(false);
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
    setBusiness({ name: "", website: "", phone: "" });
    setMailbox(null);
    setCanManage(false);
    setError(null);
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Sending identity is meaningful on every tier; billing is skipped for a
      // sub-account (its plan is the parent agency's — §217/§38).
      const [domainRes, brandRes, mailboxRes, manageRes, ...billingRes] = await Promise.all([
        supabase.functions.invoke("manage-tenant-domain", { body: { verb: "list" } }),
        supabase.from("tenants").select("brand").eq("id", tenantId).maybeSingle(),
        // The read the "Connected mailbox" card said did not exist. The contract
        // DOES exist — `gmail-oauth-callback` writes this row — nobody had wired
        // the read, so the card reported UNAVAILABLE for a live capability.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types (repo-wide pattern, cf. OwnerWelcome/EmailIntegrationConfig)
        (supabase as any)
          .from("channel_connectors")
          .select("provider, from_address, display_name, status, active")
          .eq("tenant_id", tenantId)
          .eq("channel_type", "email")
          .eq("provider", "gmail")
          .maybeSingle(),
        // Fail-closed authority for the write controls. The server re-checks on
        // every mutation regardless; this only decides whether to render them.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types (repo-wide pattern)
        supabase.rpc("is_current_user_tenant_admin" as any),
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

      // The same three keys `tenant_comms_readiness()` grades. `business_name`
      // falls back to `name` there, so it does here too — otherwise the editor
      // would show an empty box for a value the ladder already counts as present.
      setBusiness({
        name: str(brand.business_name) ?? str(brand.name) ?? "",
        website: str(brand.website) ?? "",
        phone: str(brand.business_phone) ?? "",
      });

      // A failed connector read is NOT reported as "not connected" — that would
      // be a fabricated negative. It stays null, and the card says it could not
      // be read (§13).
      const mailboxRow = mailboxRes.error ? null : asRecord(mailboxRes.data);
      setMailbox(
        mailboxRes.error
          ? null
          : {
              connected: Boolean(mailboxRow.active) && str(mailboxRow.status) !== "revoked",
              address: str(mailboxRow.from_address),
              displayName: str(mailboxRow.display_name),
              provider: str(mailboxRow.provider),
              status: str(mailboxRow.status),
            },
      );
      setCanManage(manageRes.data === true);

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

  /* ----- mutations ---------------------------------------------------------
   * Shared shape: never throw at the call site, always report what actually
   * happened, and re-read afterwards so the surface shows the PERSISTED answer
   * rather than the value that was typed (§70.1 — a toast is not persistence).
   */
  const asResult = (e: unknown): SoloMutationResult => ({
    ok: false,
    error: e instanceof Error ? e.message : typeof e === "string" ? e : "That didn't save.",
  });

  const saveBusiness = useCallback(
    async (next: SoloBusinessDetails): Promise<SoloMutationResult> => {
      if (!tenantId) return { ok: false, error: "No workspace is selected." };
      try {
        // A PATCH, not a replacement: `set_tenant_brand` merges, so logo, colour
        // and the rest of the brand survive an edit made here.
        const { error: rpcError } = await supabase.rpc("set_tenant_brand" as never, {
          _tenant_id: tenantId,
          _patch: {
            business_name: next.name.trim() || null,
            website: next.website.trim() || null,
            business_phone: next.phone.trim() || null,
          },
        } as never);
        if (rpcError) throw rpcError;
        await load();
        return { ok: true, error: null };
      } catch (e) {
        return asResult(e);
      }
    },
    [tenantId, load],
  );

  const domainVerb = useCallback(
    async (verb: string, payload: Record<string, unknown> = {}): Promise<SoloMutationResult> => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("manage-tenant-domain", {
          body: { verb, ...payload },
        });
        if (fnError) throw fnError;
        // The edge function reports failure in a 200 body as well as by status,
        // so both are checked — treating only the transport error as failure is
        // how a rejected write gets reported as a success.
        const inner = asRecord(data).error;
        if (inner) throw new Error(String(inner));
        await load();
        return { ok: true, error: null };
      } catch (e) {
        return asResult(e);
      }
    },
    [load],
  );

  const addDomain = useCallback(
    (input: { domain: string; fromEmailLocal: string; fromName: string }) =>
      domainVerb("add", {
        domain: input.domain.trim().toLowerCase(),
        from_email_local: input.fromEmailLocal.trim() || "no-reply",
        from_name: input.fromName.trim(),
      }),
    [domainVerb],
  );
  const refreshDomain = useCallback((id: string) => domainVerb("refresh", { id }), [domainVerb]);
  const setDefaultDomain = useCallback((id: string) => domainVerb("set_default", { id }), [domainVerb]);
  const removeDomain = useCallback((id: string) => domainVerb("remove", { id }), [domainVerb]);

  /**
   * Returns Google's consent URL. It does NOT navigate.
   *
   * The caller opens it, so the provider handshake is something the person
   * chose, in a window they can see — never a redirect this adapter performed
   * on their behalf.
   */
  const startGmailConnect = useCallback(async (): Promise<{ url: string | null; error: string | null }> => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("gmail-oauth-start", {
        body: { origin: window.location.origin },
      });
      if (fnError) throw fnError;
      const rec = asRecord(data);
      if (rec.error) throw new Error(String(rec.error));
      const url = str(rec.authorization_url);
      if (!url) throw new Error("Google didn't return a sign-in link.");
      return { url, error: null };
    } catch (e) {
      return { url: null, error: asResult(e).error };
    }
  }, []);

  const disconnectGmail = useCallback(async (): Promise<SoloMutationResult> => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("gmail-disconnect", { body: {} });
      if (fnError) throw fnError;
      const inner = asRecord(data).error;
      if (inner) throw new Error(String(inner));
      await load();
      return { ok: true, error: null };
    } catch (e) {
      return asResult(e);
    }
  }, [load]);

  return useMemo(
    () => ({
      loading: loading || tenantLoading || Boolean(tenantId && loadedTenantId !== tenantId),
      error,
      isSubAccount,
      domains: loadedTenantId === tenantId ? domains : [],
      sending: loadedTenantId === tenantId ? sending : { fromName: null, supportEmail: null, defaultSender: null },
      billing: loadedTenantId === tenantId ? billing : null,
      business: loadedTenantId === tenantId ? business : { name: "", website: "", phone: "" },
      mailbox: loadedTenantId === tenantId ? mailbox : null,
      canManage: loadedTenantId === tenantId ? canManage : false,
      refresh,
      saveBusiness,
      addDomain,
      refreshDomain,
      setDefaultDomain,
      removeDomain,
      startGmailConnect,
      disconnectGmail,
    }),
    [
      loading, tenantLoading, tenantId, loadedTenantId, error, isSubAccount, domains, sending,
      billing, business, mailbox, canManage, refresh, saveBusiness, addDomain, refreshDomain,
      setDefaultDomain, removeDomain, startGmailConnect, disconnectGmail,
    ],
  );
}
