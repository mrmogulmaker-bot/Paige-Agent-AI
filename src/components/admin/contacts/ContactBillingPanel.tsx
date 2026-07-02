/**
 * ContactBillingPanel — Ship #2.7 (Customer Subscription UI)
 *
 * Layer 2 fulfillment: admin creates & manages a customer's subscription to
 * a tenant service offering. §189-gated by billing_enabled feature flag.
 * All mutating actions go through admin_* RPCs which self-gate on
 * admin/owner role and log to paige_audit_log (§180 Cat B).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { CreditCard, Pause, Play, XCircle, ArrowUpDown, Lock } from "lucide-react";
import { useTenantFeature } from "@/hooks/useTenantFeature";

type Price = {
  id: string;
  product_id: string;
  nickname: string | null;
  unit_amount: number;
  currency: string;
  billing_interval: string | null;
  interval_count: number | null;
  active: boolean;
};

type Product = { id: string; name: string; product_type: string | null };

type Subscription = {
  id: string;
  product_id: string;
  price_id: string;
  status: string;
  billing_period: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

function formatMoney(cents: number, currency: string) {
  const c = (currency || "usd").toUpperCase();
  return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(cents / 100);
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-700",
  trialing: "bg-blue-500/15 text-blue-700",
  paused: "bg-amber-500/15 text-amber-700",
  past_due: "bg-orange-500/15 text-orange-700",
  canceled: "bg-muted text-muted-foreground",
};

export function ContactBillingPanel({ contactId }: { contactId: string }) {
  const { enabled: billingEnabled, loading: featureLoading } =
    useTenantFeature("billing_enabled");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);

  // create form
  const [enableCreate, setEnableCreate] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState<string>("");
  const [billingPeriod, setBillingPeriod] = useState<string>("monthly");
  const [startDate, setStartDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10),
  );

  // change / cancel
  const [changePriceFor, setChangePriceFor] = useState<string | null>(null);
  const [newPriceId, setNewPriceId] = useState<string>("");
  const [graceDays, setGraceDays] = useState<number>(7);

  async function load() {
    setLoading(true);
    const [prodRes, priceRes, subRes] = await Promise.all([
      supabase.from("tenant_products").select("id,name,product_type").eq("status", "active"),
      supabase
        .from("tenant_prices")
        .select("id,product_id,nickname,unit_amount,currency,billing_interval,interval_count,active")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("tenant_service_subscriptions")
        .select(
          "id,product_id,price_id,status,billing_period,current_period_start,current_period_end,cancel_at_period_end,created_at",
        )
        .eq("end_customer_contact_id", contactId)
        .order("created_at", { ascending: false }),
    ]);
    if (!prodRes.error) setProducts((prodRes.data as Product[]) ?? []);
    if (!priceRes.error) setPrices((priceRes.data as Price[]) ?? []);
    if (!subRes.error) setSubs((subRes.data as Subscription[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (billingEnabled) void load();
  }, [contactId, billingEnabled]);

  const productById = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const priceById = useMemo(() => {
    const m: Record<string, Price> = {};
    for (const p of prices) m[p.id] = p;
    return m;
  }, [prices]);

  if (featureLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  if (!billingEnabled) {
    return (
      <Card>
        <CardContent className="p-6 flex items-start gap-3 text-sm">
          <Lock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <div className="font-medium">Billing is not enabled for this workspace.</div>
            <div className="text-muted-foreground">
              Enable the <code>billing_enabled</code> feature flag to charge customers for
              tenant services.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  async function handleCreate() {
    if (!selectedPriceId) {
      toast.error("Pick a plan first");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_create_customer_subscription", {
      _contact_id: contactId,
      _price_id: selectedPriceId,
      _billing_period: billingPeriod,
      _start_date: new Date(startDate).toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Subscription created");
    setEnableCreate(false);
    setSelectedPriceId("");
    void load();
  }

  async function handlePause(id: string) {
    const { error } = await supabase.rpc("admin_pause_customer_subscription", {
      _subscription_id: id,
    });
    if (error) return toast.error(error.message);
    toast.success("Subscription paused");
    void load();
  }

  async function handleResume(id: string) {
    const { error } = await supabase.rpc("admin_resume_customer_subscription", {
      _subscription_id: id,
    });
    if (error) return toast.error(error.message);
    toast.success("Subscription resumed");
    void load();
  }

  async function handleChangePrice(id: string) {
    if (!newPriceId) return toast.error("Pick a new plan");
    const { error } = await supabase.rpc("admin_change_customer_subscription_price", {
      _subscription_id: id,
      _new_price_id: newPriceId,
    });
    if (error) return toast.error(error.message);
    toast.success("Plan changed");
    setChangePriceFor(null);
    setNewPriceId("");
    void load();
  }

  async function handleCancel(id: string) {
    const { error } = await supabase.rpc("admin_cancel_customer_subscription", {
      _subscription_id: id,
      _grace_period_days: graceDays,
    });
    if (error) return toast.error(error.message);
    toast.success(graceDays > 0 ? `Cancel scheduled in ${graceDays} days` : "Subscription canceled");
    void load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Subscriptions
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="enable-sub" className="text-muted-foreground">
              Enable subscription
            </Label>
            <Switch id="enable-sub" checked={enableCreate} onCheckedChange={setEnableCreate} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {enableCreate && (
            <div className="border border-border rounded-md p-3 space-y-3 bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Product / plan</Label>
                  <Select value={selectedPriceId} onValueChange={setSelectedPriceId}>
                    <SelectTrigger><SelectValue placeholder="Choose plan" /></SelectTrigger>
                    <SelectContent>
                      {prices.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {(productById[p.product_id]?.name ?? "Plan") +
                            (p.nickname ? ` · ${p.nickname}` : "") +
                            ` — ${formatMoney(p.unit_amount, p.currency)}` +
                            (p.billing_interval ? ` / ${p.billing_interval}` : "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Billing frequency</Label>
                  <Select value={billingPeriod} onValueChange={setBillingPeriod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="one_time">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Start date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating…" : "Create subscription"}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-sm text-muted-foreground py-4">Loading subscriptions…</div>
          ) : subs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No subscriptions yet. Toggle "Enable subscription" above to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {subs.map((s) => {
                const price = priceById[s.price_id];
                const product = productById[s.product_id];
                return (
                  <div key={s.id} className="border border-border rounded-md p-3">
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {product?.name ?? "Plan"}
                            {price?.nickname ? ` · ${price.nickname}` : ""}
                          </span>
                          <Badge className={`text-[10px] ${STATUS_TONE[s.status] ?? ""}`}>
                            {s.status}
                          </Badge>
                          {s.cancel_at_period_end && (
                            <Badge variant="outline" className="text-[10px]">
                              cancels at period end
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {price ? formatMoney(price.unit_amount, price.currency) : "—"}
                          {s.billing_period ? ` / ${s.billing_period}` : ""}
                          {s.current_period_end
                            ? ` · renews ${formatDistanceToNow(new Date(s.current_period_end), { addSuffix: true })}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.status === "active" && (
                          <Button variant="ghost" size="sm" onClick={() => handlePause(s.id)}>
                            <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                          </Button>
                        )}
                        {s.status === "paused" && (
                          <Button variant="ghost" size="sm" onClick={() => handleResume(s.id)}>
                            <Play className="h-3.5 w-3.5 mr-1" /> Resume
                          </Button>
                        )}
                        {s.status !== "canceled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setChangePriceFor(s.id);
                              setNewPriceId("");
                            }}
                          >
                            <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Change plan
                          </Button>
                        )}
                        {s.status !== "canceled" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive">
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Set a grace period (days). Use 0 to cancel immediately.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <div className="py-2">
                                <Label className="text-xs">Grace period (days)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={90}
                                  value={graceDays}
                                  onChange={(e) => setGraceDays(Number(e.target.value) || 0)}
                                />
                              </div>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Nevermind</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleCancel(s.id)}>
                                  Confirm cancel
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>

                    {changePriceFor === s.id && (
                      <div className="mt-3 border-t pt-3 flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-[200px]">
                          <Label className="text-xs">New plan</Label>
                          <Select value={newPriceId} onValueChange={setNewPriceId}>
                            <SelectTrigger><SelectValue placeholder="Choose new plan" /></SelectTrigger>
                            <SelectContent>
                              {prices
                                .filter((p) => p.id !== s.price_id)
                                .map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {(productById[p.product_id]?.name ?? "Plan") +
                                      (p.nickname ? ` · ${p.nickname}` : "") +
                                      ` — ${formatMoney(p.unit_amount, p.currency)}` +
                                      (p.billing_interval ? ` / ${p.billing_interval}` : "")}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={() => handleChangePrice(s.id)}>
                          Apply change
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setChangePriceFor(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
