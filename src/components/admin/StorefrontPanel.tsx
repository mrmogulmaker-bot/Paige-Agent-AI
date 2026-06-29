/**
 * StorefrontPanel — tenant admin UI for selling products through Paige.
 *
 * Sits inside Admin → Settings → Storefront tab. Lets a tenant admin:
 *   1. Connect a Stripe (Express) account
 *   2. Toggle their public storefront on/off
 *   3. Create products with a price
 *   4. See orders coming in
 *
 * Payments are routed via destination charges — see
 * `tenant-checkout-session` edge function.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Store,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  RefreshCw,
  Copy,
} from "lucide-react";

type ConnectRow = {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  country: string | null;
  default_currency: string | null;
};

type Tenant = {
  id: string;
  slug: string | null;
  name: string;
  storefront_enabled: boolean;
  platform_fee_bps: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  product_type: string;
  stripe_product_id: string | null;
};

type Price = {
  id: string;
  product_id: string;
  unit_amount: number;
  currency: string;
  billing_interval: string | null;
  kind?: string | null;
  installments_total?: number | null;
  nickname?: string | null;
};

type Order = {
  id: string;
  customer_email: string | null;
  amount_total: number | null;
  currency: string | null;
  status: string;
  created_at: string;
};

export function StorefrontPanel() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [connect, setConnect] = useState<ConnectRow | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    setLoading(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_tenant_id")
      .maybeSingle();
    const tid = profile?.active_tenant_id;
    if (!tid) {
      setLoading(false);
      return;
    }
    const [{ data: t }, { data: c }, { data: p }, { data: pr }, { data: o }] =
      await Promise.all([
        supabase
          .from("tenants")
          .select("id, slug, name, storefront_enabled, platform_fee_bps")
          .eq("id", tid)
          .single(),
        supabase
          .from("tenant_stripe_accounts")
          .select(
            "stripe_account_id, charges_enabled, payouts_enabled, details_submitted, country, default_currency",
          )
          .eq("tenant_id", tid)
          .maybeSingle(),
        supabase
          .from("tenant_products")
          .select(
            "id, name, description, status, product_type, stripe_product_id",
          )
          .eq("tenant_id", tid)
          .order("created_at", { ascending: false }),
        supabase
          .from("tenant_prices")
          .select("id, product_id, unit_amount, currency, billing_interval, kind, installments_total, nickname")
          .eq("tenant_id", tid)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
        supabase
          .from("tenant_orders")
          .select("id, customer_email, amount_total, currency, status, created_at")
          .eq("tenant_id", tid)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
    setTenant(t as Tenant);
    setConnect((c as ConnectRow) ?? null);
    setProducts((p as Product[]) ?? []);
    setPrices((pr as Price[]) ?? []);
    setOrders((o as Order[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function startConnect() {
    const { data, error } = await supabase.functions.invoke(
      "tenant-stripe-connect",
      {
        body: {
          action: "start_onboarding",
          return_url: `${window.location.origin}/admin/settings?tab=storefront`,
          refresh_url: `${window.location.origin}/admin/settings?tab=storefront`,
        },
      },
    );
    if (error || !data?.url) {
      toast.error("Could not start Stripe onboarding");
      return;
    }
    window.location.href = data.url;
  }

  async function refreshStatus() {
    const { error } = await supabase.functions.invoke("tenant-stripe-connect", {
      body: { action: "refresh_status" },
    });
    if (error) {
      toast.error("Could not refresh status");
      return;
    }
    toast.success("Stripe status refreshed");
    load();
  }

  async function openStripeLogin() {
    const { data, error } = await supabase.functions.invoke(
      "tenant-stripe-connect",
      { body: { action: "login_link" } },
    );
    if (error || !data?.url) {
      toast.error("Could not open Stripe dashboard");
      return;
    }
    window.open(data.url, "_blank");
  }

  async function toggleStorefront(enabled: boolean) {
    if (!tenant) return;
    const { error } = await supabase
      .from("tenants")
      .update({ storefront_enabled: enabled })
      .eq("id", tenant.id);
    if (error) {
      toast.error("Failed to update");
      return;
    }
    setTenant({ ...tenant, storefront_enabled: enabled });
    toast.success(enabled ? "Storefront is live" : "Storefront hidden");
  }

  // TEMP: Stripe Connect bypassed while Antonio provisions a new Stripe account.
  // Flip BYPASS_STRIPE_CONNECT back to false once the real account is wired.
  const BYPASS_STRIPE_CONNECT = true;
  const connectReady = BYPASS_STRIPE_CONNECT || !!connect?.charges_enabled;
  const storefrontUrl = tenant?.slug
    ? `${window.location.origin}/store/${tenant.slug}`
    : null;

  return (
    <div className="space-y-6">
      {/* --- Stripe Connect --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" /> Payments &amp; payouts
          </CardTitle>
          <CardDescription>
            Connect a Stripe account so this workspace can accept payments. Funds
            settle directly to your bank account — Paige never holds your money.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-4 h-4" />
              Stripe connection paused — placeholder mode
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              You can still create products, configure your storefront, and
              preview the public page. Live checkout will activate once a Stripe
              account is connected.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled>
                Connect Stripe (coming soon)
              </Button>
              <Button size="sm" variant="ghost" onClick={refreshStatus}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh status
              </Button>
            </div>
          </div>
          {connect && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Existing account on file
              </Badge>
              {connect.country && (
                <Badge variant="outline">
                  {connect.country.toUpperCase()} •{" "}
                  {(connect.default_currency ?? "").toUpperCase()}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Public storefront toggle --- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="w-4 h-4" /> Public storefront
          </CardTitle>
          <CardDescription>
            When enabled, your active products are listed at a public checkout
            page. Anyone with the link can buy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="store-toggle" className="font-normal">
              Storefront is{" "}
              <span className="font-medium">
                {tenant?.storefront_enabled ? "live" : "hidden"}
              </span>
            </Label>
            <Switch
              id="store-toggle"
              checked={!!tenant?.storefront_enabled}
              onCheckedChange={toggleStorefront}
              disabled={!connectReady}
            />
          </div>
          {storefrontUrl && (
            <div className="flex items-center gap-2 text-sm">
              <code className="bg-muted px-2 py-1 rounded text-xs flex-1 truncate">
                {storefrontUrl}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(storefrontUrl);
                  toast.success("Link copied");
                }}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={storefrontUrl} target="_blank" rel="noreferrer">
                  Visit
                </a>
              </Button>
            </div>
          )}
          {!connectReady && (
            <p className="text-xs text-muted-foreground">
              Complete Stripe onboarding above before turning your storefront on.
            </p>
          )}
        </CardContent>
      </Card>

      {/* --- Products --- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Products &amp; offers</CardTitle>
            <CardDescription>
              Anything you sell — courses, services, retainers, packages.
            </CardDescription>
          </div>
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button size="sm" disabled={!connectReady}>
                <Plus className="w-4 h-4 mr-1" /> New product
              </Button>
            </DialogTrigger>
            <CreateProductDialog
              creating={creating}
              setCreating={setCreating}
              onCreated={() => {
                setOpenCreate(false);
                load();
              }}
            />
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No products yet. Create your first offer to start selling.
            </p>
          ) : (
            <div className="space-y-2">
              {products.map((p) => {
                const productPrices = prices.filter((x) => x.product_id === p.id);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 border rounded-md p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{p.name}</span>
                        <Badge
                          variant={
                            p.status === "active" ? "default" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {p.status}
                        </Badge>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      {productPrices.map((pr) => (
                        <div key={pr.id} className="font-medium">
                          ${(pr.unit_amount / 100).toFixed(2)}{" "}
                          <span className="text-xs text-muted-foreground">
                            {pr.billing_interval && pr.billing_interval !== "one_time"
                              ? `/ ${pr.billing_interval}`
                              : "one-time"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --- Recent orders --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent orders</CardTitle>
          <CardDescription>
            Last 10 checkout sessions across your storefront.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate">
                      {o.customer_email ?? "Anonymous"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {o.amount_total != null
                        ? `$${(o.amount_total / 100).toFixed(2)}`
                        : "—"}
                    </div>
                    <Badge
                      variant={
                        o.status === "complete" ? "default" : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {o.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateProductDialog({
  creating,
  setCreating,
  onCreated,
}: {
  creating: boolean;
  setCreating: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<string>("one_time");

  async function submit() {
    if (!name || !amount) {
      toast.error("Name and price are required");
      return;
    }
    const unit = Math.round(parseFloat(amount) * 100);
    if (isNaN(unit) || unit <= 0) {
      toast.error("Enter a valid price");
      return;
    }
    setCreating(true);
    const { error } = await supabase.functions.invoke("tenant-product-upsert", {
      body: {
        name,
        description: description || undefined,
        status,
        product_type: interval === "one_time" ? "one_time" : "recurring",
        price: {
          unit_amount: unit,
          currency: "usd",
          billing_interval: interval,
        },
      },
    });
    setCreating(false);
    if (error) {
      toast.error(error.message ?? "Failed to create product");
      return;
    }
    toast.success("Product created");
    setName("");
    setDescription("");
    setAmount("");
    onCreated();
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New product</DialogTitle>
        <DialogDescription>
          Mirrored to your Stripe catalog and ready to sell.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Price (USD)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="99.00"
            />
          </div>
          <div>
            <Label>Billing</Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as "draft" | "active")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft (hidden)</SelectItem>
              <SelectItem value="active">Active (sellable)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={submit} disabled={creating} className="w-full">
          {creating ? "Creating…" : "Create product"}
        </Button>
      </div>
    </DialogContent>
  );
}
