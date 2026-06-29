// Create or update a tenant_product + (optionally) a tenant_price, mirroring
// to a Stripe Product/Price on the **platform** account. The product is sold
// via destination charges (see tenant-checkout-session) so it lives in the
// platform's catalog with metadata.tenant_id pointing at the seller workspace.
//
// POST {
//   product_id?: uuid,        // omit to create
//   name: string,
//   description?: string,
//   image_url?: string,
//   status: 'draft' | 'active' | 'archived',
//   product_type: 'one_time' | 'recurring' | 'service',
//   price?: {
//     unit_amount: number,    // cents
//     currency?: string,      // default 'usd'
//     billing_interval?: 'one_time'|'day'|'week'|'month'|'year',
//     interval_count?: number,
//     nickname?: string,
//   }
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SUPA_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "unauthorized" });

  const admin = createClient(SUPA_URL, SUPA_SRK);
  const userClient = createClient(SUPA_URL, SUPA_SRK, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) return json(401, { error: "unauthorized" });

  const { data: profile } = await admin
    .from("profiles")
    .select("active_tenant_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const tenantId = profile?.active_tenant_id;
  if (!tenantId) return json(400, { error: "no_active_tenant" });

  const { data: membership } = await admin
    .from("tenant_members")
    .select("role,status")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (
    !membership ||
    membership.status !== "active" ||
    !["owner", "admin"].includes(membership.role)
  ) {
    return json(403, { error: "tenant_admin_required" });
  }

  // Must have a connected Stripe account before listing products for sale
  const { data: connect } = await admin
    .from("tenant_stripe_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY, { apiVersion: "2024-11-20.acacia" }) : null;

  // ----- Upsert product row -----
  let productRow: any;
  if (body.product_id) {
    const { data, error } = await admin
      .from("tenant_products")
      .update({
        name: body.name,
        description: body.description ?? null,
        image_url: body.image_url ?? null,
        status: body.status ?? "draft",
        product_type: body.product_type ?? "one_time",
      })
      .eq("id", body.product_id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single();
    if (error) return json(400, { error: error.message });
    productRow = data;
  } else {
    const { data, error } = await admin
      .from("tenant_products")
      .insert({
        tenant_id: tenantId,
        name: body.name,
        description: body.description ?? null,
        image_url: body.image_url ?? null,
        status: body.status ?? "draft",
        product_type: body.product_type ?? "one_time",
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error) return json(400, { error: error.message });
    productRow = data;
  }

  // ----- Mirror to Stripe Product on platform account -----
  if (stripe) {
    try {
      if (!productRow.stripe_product_id) {
        const sp = await stripe.products.create({
          name: productRow.name,
          description: productRow.description ?? undefined,
          images: productRow.image_url ? [productRow.image_url] : undefined,
          active: productRow.status === "active",
          metadata: {
            tenant_id: tenantId,
            tenant_product_id: productRow.id,
            connected_account: connect?.stripe_account_id ?? "",
          },
        });
        await admin
          .from("tenant_products")
          .update({ stripe_product_id: sp.id })
          .eq("id", productRow.id);
        productRow.stripe_product_id = sp.id;
      } else {
        await stripe.products.update(productRow.stripe_product_id, {
          name: productRow.name,
          description: productRow.description ?? undefined,
          images: productRow.image_url ? [productRow.image_url] : undefined,
          active: productRow.status === "active",
        });
      }
    } catch (e) {
      console.error("stripe product mirror failed", e);
    }
  }

  // ----- Prices (support multiple billing plans per product) -----
  // Accept either `prices: [...]` array OR legacy single `price` object.
  const incomingPrices: any[] = Array.isArray(body.prices)
    ? body.prices
    : body.price
      ? [body.price]
      : [];

  const createdPrices: any[] = [];
  for (let i = 0; i < incomingPrices.length; i++) {
    const p = incomingPrices[i];
    if (p == null || p.unit_amount == null) continue;
    const currency = (p.currency ?? "usd").toLowerCase();
    const kind = p.kind ?? "one_time"; // one_time | deposit | recurring | installment
    const isRecurring = kind === "recurring" || kind === "installment";
    const interval = isRecurring ? (p.billing_interval ?? "month") : "one_time";
    const intervalCount = p.interval_count ?? 1;
    const installmentsTotal = kind === "installment" ? (p.installments_total ?? null) : null;

    let stripePriceId: string | null = null;
    if (stripe && productRow.stripe_product_id) {
      try {
        const sp = await stripe.prices.create({
          product: productRow.stripe_product_id,
          currency,
          unit_amount: p.unit_amount,
          nickname: p.nickname ?? undefined,
          recurring: isRecurring
            ? { interval: interval as any, interval_count: intervalCount }
            : undefined,
          metadata: {
            tenant_id: tenantId,
            kind,
            ...(installmentsTotal ? { installments_total: String(installmentsTotal) } : {}),
          },
        });
        stripePriceId = sp.id;
      } catch (e) {
        console.error("stripe price create failed", e);
      }
    }

    const { data: prRow, error: priceErr } = await admin
      .from("tenant_prices")
      .insert({
        tenant_id: tenantId,
        product_id: productRow.id,
        stripe_price_id: stripePriceId,
        nickname: p.nickname ?? null,
        currency,
        unit_amount: p.unit_amount,
        billing_interval: interval,
        interval_count: intervalCount,
        kind,
        installments_total: installmentsTotal,
        sort_order: i,
        active: true,
      })
      .select("*")
      .single();
    if (priceErr) {
      console.error("tenant_prices insert failed", priceErr);
      return json(400, { error: `price_insert_failed: ${priceErr.message}` });
    }
    createdPrices.push(prRow);
  }

  return json(200, {
    product: productRow,
    prices: createdPrices,
    connect_ready: !!connect?.charges_enabled,
  });
});
