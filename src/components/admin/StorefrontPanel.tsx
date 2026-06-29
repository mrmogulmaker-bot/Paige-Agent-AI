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
                    <div className="text-right text-sm space-y-0.5">
                      {productPrices.map((pr) => {
                        const amt = `$${(pr.unit_amount / 100).toFixed(2)}`;
                        let suffix = "one-time";
                        if (pr.kind === "deposit") suffix = "deposit";
                        else if (pr.kind === "installment")
                          suffix = `× ${pr.installments_total ?? "?"} ${pr.billing_interval ?? "month"}`;
                        else if (pr.kind === "recurring" || (pr.billing_interval && pr.billing_interval !== "one_time"))
                          suffix = `/ ${pr.billing_interval ?? "month"}`;
                        return (
                          <div key={pr.id} className="font-medium">
                            {pr.nickname && (
                              <span className="text-xs text-muted-foreground mr-1.5">{pr.nickname}:</span>
                            )}
                            {amt}{" "}
                            <span className="text-xs text-muted-foreground">{suffix}</span>
                          </div>
                        );
                      })}
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

type PlanDraft = {
  kind: "one_time" | "deposit" | "recurring" | "installment";
  nickname: string;
  amount: string;
  billing_interval: "week" | "month" | "year";
  installments_total: string;
};

function makePlan(kind: PlanDraft["kind"] = "one_time"): PlanDraft {
  return {
    kind,
    nickname:
      kind === "deposit"
        ? "Deposit"
        : kind === "installment"
          ? "Installment plan"
          : "",
    amount: "",
    billing_interval: "month",
    installments_total: "6",
  };
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
  const [plans, setPlans] = useState<PlanDraft[]>([makePlan("one_time")]);

  function updatePlan(idx: number, patch: Partial<PlanDraft>) {
    setPlans((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPlan(kind: PlanDraft["kind"]) {
    setPlans((prev) => [...prev, makePlan(kind)]);
  }
  function removePlan(idx: number) {
    setPlans((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (plans.length === 0) {
      toast.error("Add at least one billing plan");
      return;
    }
    const pricesPayload: any[] = [];
    for (const p of plans) {
      const unit = Math.round(parseFloat(p.amount) * 100);
      if (isNaN(unit) || unit <= 0) {
        toast.error(`Enter a valid amount for ${p.nickname || p.kind}`);
        return;
      }
      const installments =
        p.kind === "installment" ? parseInt(p.installments_total, 10) : null;
      if (p.kind === "installment" && (!installments || installments < 2)) {
        toast.error("Installment plan needs at least 2 payments");
        return;
      }
      pricesPayload.push({
        kind: p.kind,
        nickname: p.nickname || null,
        unit_amount: unit,
        currency: "usd",
        billing_interval:
          p.kind === "recurring" || p.kind === "installment"
            ? p.billing_interval
            : "one_time",
        interval_count: 1,
        installments_total: installments ?? undefined,
      });
    }

    const hasRecurring = plans.some(
      (p) => p.kind === "recurring" || p.kind === "installment",
    );

    setCreating(true);
    const { data, error } = await supabase.functions.invoke(
      "tenant-product-upsert",
      {
        body: {
          name: name.trim(),
          description: description || undefined,
          status,
          product_type: hasRecurring ? "recurring" : "one_time",
          prices: pricesPayload,
        },
      },
    );
    setCreating(false);
    const serverErr = (data as any)?.error;
    if (error || serverErr) {
      console.error("tenant-product-upsert failed", { error, data });
      toast.error(serverErr || error?.message || "Failed to create product");
      return;
    }
    toast.success("Product created");
    setName("");
    setDescription("");
    setPlans([makePlan("one_time")]);
    onCreated();
  }

  const planLabels: Record<PlanDraft["kind"], string> = {
    one_time: "One-time payment",
    deposit: "Deposit / initial payment",
    recurring: "Recurring subscription",
    installment: "Installment plan (split payments)",
  };

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>New product</DialogTitle>
        <DialogDescription>
          Mirrored to your Stripe catalog. Stack multiple billing plans — e.g. a
          deposit plus an installment schedule, or one-time plus a subscription.
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Billing plans</Label>
            <Select
              value=""
              onValueChange={(v) => addPlan(v as PlanDraft["kind"])}
            >
              <SelectTrigger className="w-44 h-8">
                <SelectValue placeholder="+ Add plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
                <SelectItem value="installment">Installments</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {plans.map((plan, i) => (
            <div key={i} className="rounded-md border p-3 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <Select
                  value={plan.kind}
                  onValueChange={(v) =>
                    updatePlan(i, { kind: v as PlanDraft["kind"] })
                  }
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_time">{planLabels.one_time}</SelectItem>
                    <SelectItem value="deposit">{planLabels.deposit}</SelectItem>
                    <SelectItem value="recurring">{planLabels.recurring}</SelectItem>
                    <SelectItem value="installment">{planLabels.installment}</SelectItem>
                  </SelectContent>
                </Select>
                {plans.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePlan(i)}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Label (optional)</Label>
                  <Input
                    placeholder="e.g. Deposit, Monthly"
                    value={plan.nickname}
                    onChange={(e) => updatePlan(i, { nickname: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    {plan.kind === "installment" ? "Per-payment (USD)" : "Amount (USD)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="99.00"
                    value={plan.amount}
                    onChange={(e) => updatePlan(i, { amount: e.target.value })}
                  />
                </div>
              </div>

              {(plan.kind === "recurring" || plan.kind === "installment") && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Interval</Label>
                    <Select
                      value={plan.billing_interval}
                      onValueChange={(v) =>
                        updatePlan(i, { billing_interval: v as PlanDraft["billing_interval"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Weekly</SelectItem>
                        <SelectItem value="month">Monthly</SelectItem>
                        <SelectItem value="year">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {plan.kind === "installment" && (
                    <div>
                      <Label className="text-xs"># of payments</Label>
                      <Input
                        type="number"
                        min="2"
                        step="1"
                        value={plan.installments_total}
                        onChange={(e) =>
                          updatePlan(i, { installments_total: e.target.value })
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              {plan.kind === "installment" && plan.amount && plan.installments_total && (
                <p className="text-xs text-muted-foreground">
                  Total collected: $
                  {(
                    parseFloat(plan.amount || "0") *
                    parseInt(plan.installments_total || "0", 10)
                  ).toFixed(2)}{" "}
                  over {plan.installments_total} {plan.billing_interval}
                  {parseInt(plan.installments_total, 10) > 1 ? "s" : ""}.
                </p>
              )}
              {plan.kind === "deposit" && (
                <p className="text-xs text-muted-foreground">
                  Add a second plan for the balance (one-time, installments, or
                  recurring) to complete the offer.
                </p>
              )}
            </div>
          ))}
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
