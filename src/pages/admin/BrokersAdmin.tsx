// Admin → Brokers oversight page.
// Lists all broker_profiles with client counts, monthly fee, status, and
// quick approve / suspend actions. Visible at /admin/brokers (admin role only).

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Briefcase, Search, Users, DollarSign, AlertCircle, ChevronDown, UserPlus } from "lucide-react";

interface BrokerRow {
  id: string;
  user_id: string;
  business_name: string;
  broker_type: string;
  status: string;
  referral_code: string | null;
  monthly_fee: number;
  current_client_count: number;
  client_count_quoted: number | null;
  approved_at: string | null;
  created_at: string;
  subscription_status: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  pending: "secondary",
  suspended: "destructive",
  rejected: "outline",
};

const BrokersAdmin = () => {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{ broker: BrokerRow; nextStatus: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("broker_profiles")
      .select(
        "id, user_id, business_name, broker_type, status, referral_code, monthly_fee, current_client_count, client_count_quoted, approved_at, created_at, subscription_status",
      )
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(`Failed to load brokers: ${error.message}`);
    } else {
      setRows((data as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

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
    return {
      total: rows.length,
      approved: approved.length,
      pending: rows.filter((r) => r.status === "pending").length,
      mrr: approved.reduce((s, r) => s + Number(r.monthly_fee || 0), 0),
      clients: approved.reduce((s, r) => s + Number(r.current_client_count || 0), 0),
    };
  }, [rows]);

  const updateStatus = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    const updates: Record<string, any> = { status: confirmTarget.nextStatus };
    if (confirmTarget.nextStatus === "approved" && !confirmTarget.broker.approved_at) {
      updates.approved_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("broker_profiles")
      .update(updates)
      .eq("id", confirmTarget.broker.id);
    setBusy(false);
    if (error) {
      toast.error(`Update failed: ${error.message}`);
    } else {
      toast.success(`${confirmTarget.broker.business_name} marked ${confirmTarget.nextStatus}`);
      setConfirmTarget(null);
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Brokers</h1>
          <p className="text-muted-foreground mt-1">
            Every broker on PaigeAgent — status, client load, and recurring fee.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Briefcase} label="Total brokers" value={String(totals.total)} />
        <StatCard icon={Users} label="Approved" value={String(totals.approved)} sub={`${totals.pending} pending`} />
        <StatCard icon={Users} label="Clients managed" value={String(totals.clients)} />
        <StatCard
          icon={DollarSign}
          label="Broker MRR"
          value={totals.mrr.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Clients</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.business_name}</TableCell>
                      <TableCell className="text-sm capitalize text-muted-foreground">
                        {b.broker_type.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        {b.referral_code ? (
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{b.referral_code}</code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {b.current_client_count}
                        {b.client_count_quoted ? (
                          <span className="text-muted-foreground"> /{b.client_count_quoted}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${Number(b.monthly_fee || 0).toFixed(0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[b.status] ?? "outline"} className="capitalize">
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(b.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedBrokerId(expandedBrokerId === b.id ? null : b.id)}
                          >
                            <Users className="h-3.5 w-3.5 mr-1" />
                            Team
                          </Button>
                          {b.status === "pending" && (
                            <Button size="sm" variant="default" onClick={() => setConfirmTarget({ broker: b, nextStatus: "approved" })}>
                              Approve
                            </Button>
                          )}
                          {b.status === "approved" && (
                            <Button size="sm" variant="outline" onClick={() => setConfirmTarget({ broker: b, nextStatus: "suspended" })}>
                              Suspend
                            </Button>
                          )}
                          {b.status === "suspended" && (
                            <Button size="sm" variant="default" onClick={() => setConfirmTarget({ broker: b, nextStatus: "approved" })}>
                              Reinstate
                            </Button>
                          )}
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

      {expandedBrokerId && (
        <BrokerTeamMembersPanel
          brokerId={expandedBrokerId}
          businessName={rows.find((r) => r.id === expandedBrokerId)?.business_name || ""}
          onClose={() => setExpandedBrokerId(null)}
        />
      )}

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Confirm status change
            </DialogTitle>
            <DialogDescription>
              {confirmTarget && (
                <>
                  Mark <strong>{confirmTarget.broker.business_name}</strong> as{" "}
                  <strong>{confirmTarget.nextStatus}</strong>?
                  {confirmTarget.nextStatus === "suspended" && (
                    <span className="block mt-2 text-destructive">
                      They will lose access to the Broker Workspace.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={updateStatus} disabled={busy}>
              {busy ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
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

export default BrokersAdmin;
