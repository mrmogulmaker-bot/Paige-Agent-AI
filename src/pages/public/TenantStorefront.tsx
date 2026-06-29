/**
 * Public tenant storefront at /store/:slug
 *
 * Anyone (anon-allowed RLS on tenant_products / tenant_prices) can view a
 * tenant's active products and start a Stripe Checkout Session for one.
 * Brand colors/logo come from `tenants.brand`.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  brand: Record<string, any> | null;
  storefront_enabled: boolean;
};

type ProductWithPrice = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  prices: Array<{
    id: string;
    unit_amount: number;
    currency: string;
    billing_interval: string | null;
    nickname: string | null;
  }>;
};

export default function TenantStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<ProductWithPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!slug) return;
      const { data: t } = await supabase
        .from("tenants")
        .select("id, slug, name, brand, storefront_enabled")
        .eq("slug", slug)
        .maybeSingle();
      if (!t || !t.storefront_enabled) {
        setLoading(false);
        return;
      }
      setTenant(t as Tenant);

      const { data: prods } = await supabase
        .from("tenant_products")
        .select("id, name, description, image_url, status")
        .eq("tenant_id", t.id)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      const { data: prices } = await supabase
        .from("tenant_prices")
        .select(
          "id, product_id, unit_amount, currency, billing_interval, nickname, active",
        )
        .eq("tenant_id", t.id)
        .eq("active", true);

      const merged: ProductWithPrice[] = (prods ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        prices: (prices ?? []).filter((x: any) => x.product_id === p.id),
      }));
      setProducts(merged);
      setLoading(false);
    })();
  }, [slug]);

  async function buy(priceId: string) {
    setCheckingOut(priceId);
    const { data, error } = await supabase.functions.invoke(
      "tenant-checkout-session",
      {
        body: {
          price_id: priceId,
          success_url: `${window.location.origin}/store/${slug}/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: window.location.href,
        },
      },
    );
    setCheckingOut(null);
    if (error || !data?.url) {
      toast.error("Could not start checkout");
      return;
    }
    window.location.href = data.url;
  }

  const brand = useMemo(() => tenant?.brand ?? {}, [tenant]);
  const accent = (brand as any)?.primary_color ?? "#0F172A";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-6">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Storefront unavailable</h1>
          <p className="text-muted-foreground">
            This workspace isn't selling publicly right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{tenant.name} — Shop</title>
        <meta
          name="description"
          content={`Buy products and services from ${tenant.name}.`}
        />
      </Helmet>

      <header
        className="px-6 py-12 text-center"
        style={{ background: accent, color: "white" }}
      >
        {(brand as any)?.logo_url && (
          <img
            src={(brand as any).logo_url}
            alt={tenant.name}
            className="h-12 mx-auto mb-4"
          />
        )}
        <h1 className="text-3xl sm:text-4xl font-bold">{tenant.name}</h1>
        {(brand as any)?.tagline && (
          <p className="mt-2 text-white/80">{(brand as any).tagline}</p>
        )}
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        {products.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            No products available yet.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {products.map((p) => {
              const price = p.prices[0];
              return (
                <div
                  key={p.id}
                  className="rounded-xl border bg-card overflow-hidden flex flex-col"
                >
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-44 object-cover"
                    />
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <h2 className="font-semibold text-lg">{p.name}</h2>
                    {p.description && (
                      <p className="text-sm text-muted-foreground mt-1 flex-1">
                        {p.description}
                      </p>
                    )}
                    {price && (
                      <div className="mt-4 flex items-end justify-between">
                        <div>
                          <span className="text-2xl font-bold">
                            ${(price.unit_amount / 100).toFixed(2)}
                          </span>
                          <span className="text-sm text-muted-foreground ml-1">
                            {price.billing_interval &&
                            price.billing_interval !== "one_time"
                              ? `/ ${price.billing_interval}`
                              : ""}
                          </span>
                        </div>
                        <Button
                          onClick={() => buy(price.id)}
                          disabled={checkingOut === price.id}
                          style={{ background: accent }}
                        >
                          {checkingOut === price.id ? "…" : "Buy"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-muted-foreground py-6">
        Secure checkout by Stripe
      </footer>
    </div>
  );
}
