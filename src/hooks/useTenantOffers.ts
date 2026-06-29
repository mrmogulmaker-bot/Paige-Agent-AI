// Loads the active tenant's storefront products as selectable offers.
// Replaces the previous hardcoded OFFER_TYPES list — each tenant now defines
// its own products in Admin → Settings → Storefront and they flow into the
// New Contact / New Deal pickers automatically.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TenantOffer = {
  value: string;          // tenant_products.id
  label: string;          // "Name — $X (interval)"
  name: string;
  amountCents: number | null;
  currency: string | null;
  interval: string | null; // "one_time" | "month" | "year" | null
  status: string;
};

function formatLabel(name: string, amountCents: number | null, currency: string | null, interval: string | null) {
  if (amountCents == null) return name;
  const amt = `$${(amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)}`;
  const cur = currency && currency.toLowerCase() !== "usd" ? ` ${currency.toUpperCase()}` : "";
  const suffix = interval && interval !== "one_time" ? ` / ${interval}` : "";
  return `${name} — ${amt}${cur}${suffix}`;
}

export function useTenantOffers() {
  const [offers, setOffers] = useState<TenantOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .maybeSingle();
    const tid = profile?.active_tenant_id;
    if (!tid) {
      setOffers([]);
      setLoading(false);
      return;
    }
    const [{ data: products }, { data: prices }] = await Promise.all([
      supabase
        .from("tenant_products")
        .select("id, name, status")
        .eq("tenant_id", tid)
        .neq("status", "archived")
        .order("created_at", { ascending: false }),
      supabase
        .from("tenant_prices")
        .select("product_id, unit_amount, currency, billing_interval")
        .eq("tenant_id", tid),
    ]);
    const priceByProduct = new Map<string, { unit_amount: number; currency: string; billing_interval: string | null }>();
    (prices ?? []).forEach((p: any) => {
      if (!priceByProduct.has(p.product_id)) priceByProduct.set(p.product_id, p);
    });
    const result: TenantOffer[] = (products ?? []).map((p: any) => {
      const pr = priceByProduct.get(p.id);
      return {
        value: p.id,
        name: p.name,
        amountCents: pr?.unit_amount ?? null,
        currency: pr?.currency ?? null,
        interval: pr?.billing_interval ?? null,
        status: p.status,
        label: formatLabel(p.name, pr?.unit_amount ?? null, pr?.currency ?? null, pr?.billing_interval ?? null),
      };
    });
    setOffers(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const offerLabel = useCallback(
    (value: string | null | undefined): string | null => {
      if (!value) return null;
      const match = offers.find((o) => o.value === value);
      return match?.label ?? value;
    },
    [offers],
  );

  return { offers, loading, offerLabel, reload: load };
}
