/**
 * useSoloNumbers — the number marketplace, reachable from the Solo shell.
 *
 * WHY THIS EXISTS. `comms-search-numbers` and `comms-purchase-number` are real and have
 * been for a while: they authenticate as the tenant's OWN Twilio subaccount, search live
 * inventory, and buy into that subaccount. Production proves it — one workspace already
 * holds two purchased numbers. But the only caller was `NumbersTab`, mounted on a legacy
 * route a Solo tenant is redirected away from, and Solo's own "Find a number" panel was
 * marked PROPOSED and ran nothing at all. The capability was built, then orphaned. This
 * adapter is the Solo caller it never had (§18 — the same two seams, not a third).
 *
 * WHAT IS DELIBERATELY NOT HERE (§38). Buying a number is a REAL CHARGE: Twilio's
 * wholesale plus a flat platform fee, read live from `platform_number_pricing`. This
 * adapter therefore never purchases on its own initiative, never retries a purchase, and
 * never treats a failed purchase as a success. A person presses Buy, once, and is told
 * exactly what happened.
 *
 * §9: no tenant id crosses the wire. Both edge functions derive the tenant from the
 * verified JWT via `current_user_tenant_id()`, resolve that tenant's subaccount
 * credentials from Vault under the service role, and the inserted
 * `tenant_phone_numbers.tenant_id` is stamped by a database trigger from the subaccount
 * parent — a request body cannot point the purchase at another workspace.
 *
 * §13: `needs_config` is a first-class answer, not an error and not an empty list. A
 * workspace with no messaging account provisioned CANNOT buy yet, and saying "no numbers
 * found" would blame the search for a setup gap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";
import { resolveFunctionError } from "@/lib/integrations/connectError";

/** What a person can narrow the search by. Every field is optional. */
export interface NumberSearchFilters {
  /** "local" — an ordinary area-code number — or "tollfree" for an 800/833/844/855/866/877/888. */
  kind: "local" | "tollfree";
  /** Three digits. Ignored for toll-free, where the prefix IS the area code. */
  areaCode: string;
  /** Two-letter state, e.g. GA. */
  region: string;
  /** City, e.g. Atlanta. */
  locality: string;
  /** Digits the number should begin with, after the area code. */
  startsWith: string;
}

export const EMPTY_NUMBER_FILTERS: NumberSearchFilters = {
  kind: "local", areaCode: "", region: "", locality: "", startsWith: "",
};

export interface AvailableNumber {
  phoneNumber: string;
  locality: string | null;
  region: string | null;
  capabilities: { sms: boolean; mms: boolean; voice: boolean };
  /** Monthly price in cents, or null when the operator has not priced this type yet. */
  priceCents: number | null;
}

export interface OwnedNumber {
  id: string;
  phoneNumber: string;
  isPrimary: boolean;
  status: string | null;
  friendlyName: string | null;
}

export type SearchOutcome =
  | { state: "results"; numbers: AvailableNumber[]; priceConfigured: boolean }
  /** The workspace cannot buy yet — a setup gap, NOT an empty result (§13). */
  | { state: "needs_config"; message: string }
  | { state: "error"; message: string };

export interface SoloNumbersData {
  loading: boolean;
  error: string | null;
  /** Numbers this workspace already owns. */
  owned: OwnedNumber[];
  /** True when the caller may search and buy — fail-closed; the server re-checks. */
  canManage: boolean;
  refresh: () => void;
  search: (filters: NumberSearchFilters) => Promise<SearchOutcome>;
  /** Buys ONE number. Never called except from a person's click (§38). */
  purchase: (phoneNumber: string) => Promise<{ ok: boolean; error: string | null }>;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
/** Twilio spells capabilities inconsistently across endpoints ({SMS} vs {sms}). */
function cap(caps: Record<string, unknown>, key: "sms" | "mms" | "voice"): boolean {
  return caps[key] === true || caps[key.toUpperCase()] === true;
}

export function useSoloNumbers(): SoloNumbersData {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const tenantId = activeTenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loadedTenantId, setLoadedTenantId] = useState<string | null>(null);
  const gate = useRef(createSettingsRequestGate());

  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Only forget the previous workspace when it actually CHANGED. Blanking on a
    // same-workspace refresh unmounts whatever the surface was showing, including the
    // result of the purchase that triggered the refresh.
    const switching = loadedTenantId !== null && loadedTenantId !== tenantId;
    if (switching) { setLoadedTenantId(null); setOwned([]); setCanManage(false); }
    setError(null);
    if (!tenantId) { setLoading(false); return; }
    if (loadedTenantId !== tenantId) setLoading(true);
    try {
      const [numbersRes, adminRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types (repo-wide pattern, cf. channel_connectors)
        (supabase as any)
          .from("tenant_phone_numbers")
          .select("id, phone_number, is_primary, status, friendly_name")
          .eq("tenant_id", tenantId)
          .order("is_primary", { ascending: false }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated types (repo-wide pattern)
        supabase.rpc("is_current_user_tenant_admin" as any),
      ]);
      if (!gate.current.isCurrent(token)) return;
      if (numbersRes.error) throw numbersRes.error;
      setOwned(((numbersRes.data ?? []) as unknown[]).map((r) => {
        const row = asRecord(r);
        return {
          id: String(row.id ?? ""),
          phoneNumber: str(row.phone_number) ?? "",
          isPrimary: row.is_primary === true,
          status: str(row.status),
          friendlyName: str(row.friendly_name),
        };
      }));
      setCanManage(adminRes.data === true); // fail-closed
      setLoadedTenantId(tenantId);
    } catch (e) {
      if (!gate.current.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Couldn't read this workspace's numbers.");
    } finally {
      if (gate.current.isCurrent(token)) setLoading(false);
    }
  }, [tenantId, loadedTenantId]);

  useEffect(() => {
    const active = gate.current;
    if (tenantLoading) return;
    void load();
    return () => active.clear();
  }, [tenantLoading, load]);

  const refresh = useCallback(() => { void load(); }, [load]);

  const search = useCallback(async (filters: NumberSearchFilters): Promise<SearchOutcome> => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("comms-search-numbers", {
        body: {
          number_type: filters.kind,
          // A toll-free prefix IS its area code, so sending both would contradict itself.
          area_code: filters.kind === "tollfree" ? undefined : filters.areaCode.trim() || undefined,
          in_region: filters.region.trim() || undefined,
          in_locality: filters.locality.trim() || undefined,
          starts_with: filters.startsWith.trim() || undefined,
        },
      });
      const rec = asRecord(data);
      if (fnError) {
        const { message } = await resolveFunctionError({ error: fnError, data, action: "search for numbers" });
        return { state: "error", message };
      }
      // A setup gap is its own answer. Rendering it as "no results" would blame the
      // search for something the search did not do.
      if (rec.needs_config === true) {
        return {
          state: "needs_config",
          message: str(rec.message)
            ?? "This workspace can't buy a number yet — its messaging account isn't set up.",
        };
      }
      if (rec.error) {
        const { message } = await resolveFunctionError({ error: null, data, action: "search for numbers" });
        return { state: "error", message };
      }
      const raw = Array.isArray(rec.numbers) ? rec.numbers : [];
      return {
        state: "results",
        priceConfigured: rec.price_configured === true,
        numbers: raw.map((n) => {
          const row = asRecord(n);
          const caps = asRecord(row.capabilities);
          const price = asRecord(row.retail_price);
          return {
            phoneNumber: str(row.phone_number) ?? "",
            locality: str(row.locality),
            region: str(row.region),
            capabilities: { sms: cap(caps, "sms"), mms: cap(caps, "mms"), voice: cap(caps, "voice") },
            priceCents: typeof price.retail_monthly_cents === "number" ? price.retail_monthly_cents : null,
          };
        }).filter((n) => n.phoneNumber),
      };
    } catch (e) {
      return { state: "error", message: e instanceof Error ? e.message : "That search didn't run." };
    }
  }, []);

  const purchase = useCallback(async (phoneNumber: string) => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke("comms-purchase-number", {
        body: { phone_number: phoneNumber },
      });
      const rec = asRecord(data);
      // Both shapes checked. A purchase that reports success when the provider refused
      // would tell someone they own a number they do not, and bill nobody for it.
      if (fnError || rec.error || rec.needs_config === true) {
        const { message } = await resolveFunctionError({ error: fnError, data, action: "buy that number" });
        return { ok: false, error: message };
      }
      await load();
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "That purchase didn't complete." };
    }
  }, [load]);

  return useMemo(() => ({
    loading: loading || tenantLoading || Boolean(tenantId && loadedTenantId !== tenantId),
    error,
    owned: loadedTenantId === tenantId ? owned : [],
    canManage: loadedTenantId === tenantId ? canManage : false,
    refresh, search, purchase,
  }), [loading, tenantLoading, tenantId, loadedTenantId, error, owned, canManage, refresh, search, purchase]);
}
