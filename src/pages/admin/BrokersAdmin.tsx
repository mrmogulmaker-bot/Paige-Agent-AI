// Admin → Brokers oversight page.
// Full broker account management: applications approval, manual access grants,
// status management (suspend/reinstate), and detailed broker profile panel.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Briefcase, Search, Users, DollarSign, AlertCircle, MoreVertical,
  UserPlus, Copy, ExternalLink, CheckCircle2, XCircle, Pencil,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface BrokerRow {
  id: string;
  user_id: string;
  business_name: string;
  broker_type: string;
  status: string;
  referral_code: string | null;
  broker_client_discount_code: string | null;
  monthly_fee: number;
  current_client_count: number;
  client_count_quoted: number | null;
  approved_at: string | null;
  created_at: string;
  subscription_status: string | null;
  stripe_subscription_id: string | null;
  bio: string | null;
  website: string | null;
  specializations: string[] | null;
  decline_reason?: string | null;
  firm_description?: string | null;
  paige_context_notes?: string | null;
}

const SPECIALIZATION_OPTIONS = [
  "credit_repair",
  "business_credit",
  "personal_credit",
  "funding",
  "mortgage_prep",
  "real_estate_investing",
  "small_business_loans",
  "trust_planning",
  "tax_strategy",
  "wealth_building",
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "secondary",
  suspended: "destructive",
  declined: "outline",
};

const BROKER_TYPES = [
  { value: "credit_coach", label: "Credit Coach" },
  { value: "mortgage_broker", label: "Mortgage Broker" },
  { value: "financial_advisor", label: "Financial Advisor" },
  { value: "real_estate_agent", label: "Real Estate Agent" },
  { value: "insurance_agent", label: "Insurance Agent" },
  { value: "other", label: "Other" },
];

const BrokersAdmin = () => {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoApprove, setAutoApprove] = useState(true);
  const [autoApproveLoading, setAutoApproveLoading] = useState(true);

  const [declineTarget, setDeclineTarget] = useState<BrokerRow | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [declineNotify, setDeclineNotify] = useState(true);

  const [statusTarget, setStatusTarget] = useState<{ broker: BrokerRow; nextStatus: string } | null>(null);

  const [grantOpen, setGrantOpen] = useState(false);
  const [detailBroker, setDetailBroker] = useState<BrokerRow | null>(null);
  const [editTarget, setEditTarget] = useState<BrokerRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("broker_profiles")
      .select(
        "id, user_id, business_name, broker_type, status, referral_code, broker_client_discount_code, monthly_fee, current_client_count, client_count_quoted, approved_at, created_at, subscription_status, stripe_subscription_id, bio, website, specializations, decline_reason, firm_description, paige_context_notes",
      )
      .order("created_at", { ascending: false });
    if (error) toast.error(`Failed to load brokers: ${error.message}`);
    else setRows((data as any) ?? []);
    setLoading(false);
  };

  const loadAutoApprove = async () => {
    setAutoApproveLoading(true);
    const { data } = await supabase
      .from("admin_app_settings")
      .select("value")
      .eq("key", "broker_auto_approve")
      .maybeSingle();
    const v = (data as any)?.value;
    setAutoApprove(v && typeof v === "object" && "enabled" in v ? !!v.enabled : true);
    setAutoApproveLoading(false);
  };

  useEffect(() => {
    load();
    loadAutoApprove();
  }, []);

  const toggleAutoApprove = async (enabled: boolean) => {
    setAutoApprove(enabled);
    const { error } = await supabase
      .from("admin_app_settings")
      .upsert(
        { key: "broker_auto_approve", value: { enabled } as any, updated_at: new Date().toISOString() } as any,
        { onConflict: "key" },
      );
    if (error) {
      toast.error(`Failed to update setting: ${error.message}`);
      setAutoApprove(!enabled);
    } else {
      toast.success(`Auto-approve ${enabled ? "enabled" : "disabled"}`);
    }
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(
      (r) =>
        r.business_name.toLowerCase().includes(f) ||
        r.referral_code?.toLowerCase().includes(f) ||
        r.broker_type.toLowerCase().includes(f) ||
        r.status.toLowerCase().includes(f),
    );
  }, [rows, filter]);

  const totals = useMemo(() => {
    const approved = rows.filter((r) => r.status === "approved");
    const activeMrr = approved
      .filter((r) => r.subscription_status === "active")
      .reduce((s, r) => s + Number(r.monthly_fee || 0), 0);
    return {
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: approved.length,
      mrr: activeMrr,
    };
  }, [rows]);

  const callAdminAction = async (payload: Record<string, any>): Promise<any | null> => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("broker-admin-action", {
      body: payload,
    });
    setBusy(false);
    if (error) {
      toast.error(`Action failed: ${error.message}`);
      return null;
    }
    if (data?.error) {
      toast.error(data.error);
      return null;
    }
    return data;
  };

  const onApprove = async (b: BrokerRow) => {
    const res = await callAdminAction({ action: "approve", brokerId: b.id });
    if (res?.success) {
      toast.success(`${b.business_name} approved — welcome email ${res.emailSent ? "sent" : "queued"}`);
      await load();
    }
  };

  const onConfirmDecline = async () => {
    if (!declineTarget) return;
    const res = await callAdminAction({
      action: "decline",
      brokerId: declineTarget.id,
      reason: declineReason.trim() || undefined,
      notify: declineNotify,
    });
    if (res?.success) {
      toast.success(`${declineTarget.business_name} declined`);
      setDeclineTarget(null);
      setDeclineReason("");
      setDeclineNotify(true);
      await load();
    }
  };

  const onConfirmStatusChange = async () => {
    if (!statusTarget) return;
    const res = await callAdminAction({
      action: statusTarget.nextStatus === "suspended" ? "suspend" : "reinstate",
      brokerId: statusTarget.broker.id,
    });
    if (res?.success) {
      toast.success(`${statusTarget.broker.business_name} marked ${statusTarget.nextStatus}`);
      setStatusTarget(null);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Brokers</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Approve applications, grant access, and manage broker accounts.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-card">
            <Switch
              checked={autoApprove}
              onCheckedChange={toggleAutoApprove}
              disabled={autoApproveLoading}
              id="auto-approve"
            />
            <Label htmlFor="auto-approve" className="text-xs cursor-pointer">
              Auto-approve apps
            </Label>
          </div>
          <Button onClick={() => setGrantOpen(true)} size="sm">
            <UserPlus className="h-4 w-4 mr-1" /> Grant Broker Access
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} label="Total applications" value={String(totals.total)} />
        <StatCard
          icon={AlertCircle}
          label="Pending review"
          value={String(totals.pending)}
          sub={totals.pending > 0 ? "Awaiting your action" : "All caught up"}
        />
        <StatCard icon={Users} label="Active brokers" value={String(totals.approved)} />
        <StatCard
          icon={DollarSign}
          label="Broker MRR"
          value={totals.mrr.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
          sub="Active subscriptions"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All brokers</CardTitle>
          <CardDescription>Filter by business name, referral code, type, or status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search brokers..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No brokers match that filter.</p>
          ) : (
            <div className="overflow-x-auto -mx-3 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden sm:table-cell">Code</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Clients</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow
                      key={b.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDetailBroker(b)}
                    >
                      <TableCell className="font-medium max-w-[180px] truncate">{b.business_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm capitalize text-muted-foreground">
                        {b.broker_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {b.referral_code ? (
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{b.referral_code}</code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm hidden sm:table-cell">
                        {b.current_client_count}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[b.status] ?? "outline"} className="capitalize">
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1 flex-wrap">
                          {b.status === "pending" && (
                            <>
                              <Button size="sm" variant="default" onClick={() => onApprove(b)} disabled={busy}>
                                <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">Approve</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeclineTarget(b)}
                                disabled={busy}
                              >
                                <XCircle className="h-3.5 w-3.5 sm:mr-1" />
                                <span className="hidden sm:inline">Decline</span>
                              </Button>
                            </>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetailBroker(b)}>
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditTarget(b)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit profile
                              </DropdownMenuItem>
                              {b.status === "approved" && (
                                <DropdownMenuItem
                                  onClick={() => setStatusTarget({ broker: b, nextStatus: "suspended" })}
                                >
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              {(b.status === "suspended" || b.status === "declined") && (
                                <DropdownMenuItem
                                  onClick={() => setStatusTarget({ broker: b, nextStatus: "approved" })}
                                >
                                  Reinstate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem asChild>
                                <a href={`/broker/app`} target="_blank" rel="noreferrer">
                                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open Workspace
                                </a>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decline modal */}
      <Dialog open={!!declineTarget} onOpenChange={(o) => !o && setDeclineTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline application</DialogTitle>
            <DialogDescription>
              {declineTarget && <>Decline <strong>{declineTarget.business_name}</strong>'s broker application.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reason">Reason (optional, internal)</Label>
              <Textarea
                id="reason"
                placeholder="Doesn't meet broker criteria, suspicious application, etc."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="notify" checked={declineNotify} onCheckedChange={setDeclineNotify} />
              <Label htmlFor="notify" className="text-sm cursor-pointer">
                Send decline notification email
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={onConfirmDecline} disabled={busy}>
              {busy ? "Declining..." : "Decline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change confirm */}
      <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" /> Confirm status change
            </DialogTitle>
            <DialogDescription>
              {statusTarget && (
                <>
                  Mark <strong>{statusTarget.broker.business_name}</strong> as{" "}
                  <strong>{statusTarget.nextStatus}</strong>?
                  {statusTarget.nextStatus === "suspended" && (
                    <span className="block mt-2 text-destructive">
                      They will lose access to the Broker Workspace.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)} disabled={busy}>Cancel</Button>
            <Button onClick={onConfirmStatusChange} disabled={busy}>
              {busy ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grant access modal */}
      <GrantAccessDialog
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        onGranted={async () => {
          setGrantOpen(false);
          await load();
        }}
      />

      {/* Broker detail panel */}
      {detailBroker && (
        <BrokerDetailDialog
          broker={detailBroker}
          onClose={() => setDetailBroker(null)}
          onApprove={() => onApprove(detailBroker)}
          onSuspend={() => setStatusTarget({ broker: detailBroker, nextStatus: "suspended" })}
          onReinstate={() => setStatusTarget({ broker: detailBroker, nextStatus: "approved" })}
          onDecline={() => setDeclineTarget(detailBroker)}
          onEdit={() => setEditTarget(detailBroker)}
        />
      )}

      {/* Edit profile modal */}
      {editTarget && (
        <EditBrokerProfileDialog
          broker={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await load();
          }}
        />
      )}
    </div>
  );
};

const StatCard = ({
  icon: Icon, label, value, sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{label}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

// ─────────────────────────────────────────────────────────────────────────────
// Grant Access Dialog
// ─────────────────────────────────────────────────────────────────────────────
const GrantAccessDialog = ({
  open, onClose, onGranted,
}: {
  open: boolean; onClose: () => void; onGranted: () => Promise<void>;
}) => {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [brokerType, setBrokerType] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setEmail(""); setBusinessName(""); setBrokerType("");
  };

  const onConfirm = async () => {
    if (!email.trim() || !businessName.trim() || !brokerType) {
      toast.error("Email, business name, and broker type are required.");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("broker-admin-action", {
      body: {
        action: "grant_access",
        email: email.trim(),
        businessName: businessName.trim(),
        brokerType,
      },
    });
    setBusy(false);
    if (error || data?.error) {
      toast.error(error?.message || data?.error || "Grant failed");
      return;
    }
    toast.success(`Broker access granted${data?.userName ? ` to ${data.userName}` : ""}`);
    reset();
    await onGranted();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant Broker Access</DialogTitle>
          <DialogDescription>
            Manually onboard an existing PaigeAgent user as a broker. They'll get
            workspace access plus a referral code and welcome email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="email">User email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must already have a PaigeAgent account.
            </p>
          </div>
          <div>
            <Label htmlFor="biz">Business name *</Label>
            <Input
              id="biz"
              placeholder="Apex Realty Group"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="type">Broker type *</Label>
            <Select value={brokerType} onValueChange={setBrokerType}>
              <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {BROKER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy ? "Granting..." : "Confirm Grant Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Broker Detail Dialog
// ─────────────────────────────────────────────────────────────────────────────
interface BrokerStats {
  clientCount: number;
  teamCount: number;
  sessionCount: number;
  totalCommissionCents: number;
  paidCommissionCents: number;
}

const BrokerDetailDialog = ({
  broker, onClose, onApprove, onSuspend, onReinstate, onDecline, onEdit,
}: {
  broker: BrokerRow;
  onClose: () => void;
  onApprove: () => void;
  onSuspend: () => void;
  onReinstate: () => void;
  onDecline: () => void;
  onEdit: () => void;
}) => {
  const [stats, setStats] = useState<BrokerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [clientsRes, teamRes, sessionsRes, commsRes] = await Promise.all([
        supabase.from("broker_client_relationships")
          .select("id", { count: "exact", head: true })
          .eq("broker_id", broker.id),
        supabase.from("broker_team_members")
          .select("id", { count: "exact", head: true })
          .eq("broker_id", broker.id),
        supabase.from("broker_paige_sessions")
          .select("id", { count: "exact", head: true })
          .eq("broker_id", broker.id),
        supabase.from("broker_referral_commissions")
          .select("monthly_amount, status")
          .eq("referring_broker_id", broker.id),
      ]);
      if (cancelled) return;
      const comms = (commsRes.data as any[]) || [];
      const totalCents = comms.reduce(
        (s, c) => s + Math.round(Number(c.monthly_amount || 0) * 100), 0,
      );
      const paidCents = comms
        .filter((c) => c.status === "paid")
        .reduce((s, c) => s + Math.round(Number(c.monthly_amount || 0) * 100), 0);
      setStats({
        clientCount: clientsRes.count ?? 0,
        teamCount: teamRes.count ?? 0,
        sessionCount: sessionsRes.count ?? 0,
        totalCommissionCents: totalCents,
        paidCommissionCents: paidCents,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [broker.id]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const fmtMoney = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {broker.business_name}
            <Badge variant={STATUS_VARIANT[broker.status] ?? "outline"} className="capitalize">
              {broker.status}
            </Badge>
          </DialogTitle>
          <DialogDescription className="capitalize">
            {broker.broker_type.replace(/_/g, " ")}
            {broker.website && (
              <>
                {" · "}
                <a href={broker.website} target="_blank" rel="noreferrer" className="underline">
                  {broker.website.replace(/^https?:\/\//, "")}
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Codes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground mb-1">Referral code</div>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm font-bold">
                  {broker.referral_code || "—"}
                </code>
                {broker.referral_code && (
                  <Button size="sm" variant="ghost" onClick={() => copy(broker.referral_code!, "Code")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground mb-1">Client discount code</div>
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-sm">
                  {broker.broker_client_discount_code || "—"}
                </code>
                {broker.broker_client_discount_code && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(broker.broker_client_discount_code!, "Discount code")}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="rounded-md border p-3 space-y-1">
            <div className="text-xs uppercase text-muted-foreground">Subscription</div>
            <div className="text-sm">
              Status: <span className="capitalize font-medium">{broker.subscription_status || "inactive"}</span>
              {" · "}
              Monthly: <span className="font-mono">${Number(broker.monthly_fee || 0).toFixed(0)}</span>
            </div>
            {broker.stripe_subscription_id && (
              <div className="text-xs text-muted-foreground font-mono truncate">
                {broker.stripe_subscription_id}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {loading ? (
              <>
                <Skeleton className="h-16" /><Skeleton className="h-16" />
                <Skeleton className="h-16" /><Skeleton className="h-16" />
              </>
            ) : stats ? (
              <>
                <MiniStat label="Clients" value={String(stats.clientCount)} />
                <MiniStat label="Team" value={String(stats.teamCount)} />
                <MiniStat label="Paige sessions" value={String(stats.sessionCount)} />
                <MiniStat
                  label="Commissions"
                  value={fmtMoney(stats.totalCommissionCents)}
                  sub={`${fmtMoney(stats.paidCommissionCents)} paid`}
                />
              </>
            ) : null}
          </div>

          {broker.bio && (
            <div className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground mb-1">Bio</div>
              <p className="text-sm whitespace-pre-wrap">{broker.bio}</p>
            </div>
          )}

          {broker.specializations && broker.specializations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {broker.specializations.map((s) => (
                <Badge key={s} variant="secondary" className="capitalize">{s.replace(/_/g, " ")}</Badge>
              ))}
            </div>
          )}

          {broker.decline_reason && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-xs uppercase text-destructive mb-1">Decline reason</div>
              <p className="text-sm">{broker.decline_reason}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Edit profile
          </Button>
          {broker.status === "pending" && (
            <>
              <Button variant="outline" onClick={onDecline}>Decline</Button>
              <Button onClick={onApprove}>Approve</Button>
            </>
          )}
          {broker.status === "approved" && (
            <Button variant="destructive" onClick={onSuspend}>Suspend</Button>
          )}
          {(broker.status === "suspended" || broker.status === "declined") && (
            <Button onClick={onReinstate}>Reinstate</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const MiniStat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-md border p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-bold">{value}</div>
    {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
  </div>
);

export default BrokersAdmin;
