/**
 * Platform → Tenants
 * Owner-only console listing every tenant on the platform with plan,
 * seat usage, customer usage, and status. Drill-in for member list lives
 * in a follow-up step.
 */
import { useEffect, useMemo, useState } from "react";
import { Building2, Users, Contact as ContactIcon, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTenantContext, TenantSummary } from "@/hooks/useTenantContext";

interface TenantRow extends TenantSummary {
  member_count: number;
  customer_count: number;
}

export default function PlatformTenants() {
  const { isPlatformOwner, loading: ctxLoading, refresh } = useTenantContext();
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ctxLoading || !isPlatformOwner) return;
    (async () => {
      setLoading(true);
      // RLS lets platform owner see all tenants + members + clients.
      const [{ data: tenants }, { data: members }, { data: clients }] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, slug, name, status, plan_offer, seat_limit, customer_limit, owner_user_id")
          .order("created_at", { ascending: true }),
        supabase.from("tenant_members").select("tenant_id").eq("status", "active"),
        supabase.from("clients").select("tenant_id"),
      ]);

      const memberCounts = new Map<string, number>();
      (members ?? []).forEach((m) => {
        memberCounts.set(m.tenant_id, (memberCounts.get(m.tenant_id) ?? 0) + 1);
      });
      const customerCounts = new Map<string, number>();
      (clients ?? []).forEach((c) => {
        if (!c.tenant_id) return;
        customerCounts.set(c.tenant_id, (customerCounts.get(c.tenant_id) ?? 0) + 1);
      });

      setRows(
        ((tenants ?? []) as TenantSummary[]).map((t) => ({
          ...t,
          member_count: memberCounts.get(t.id) ?? 0,
          customer_count: customerCounts.get(t.id) ?? 0,
        })),
      );
      setLoading(false);
    })();
  }, [ctxLoading, isPlatformOwner, refresh]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        tenants: acc.tenants + 1,
        members: acc.members + r.member_count,
        customers: acc.customers + r.customer_count,
        active: acc.active + (r.status === "active" ? 1 : 0),
      }),
      { tenants: 0, members: 0, customers: 0, active: 0 },
    );
  }, [rows]);

  if (ctxLoading) {
    return (
      <div className="text-muted-foreground text-sm">Loading platform console…</div>
    );
  }

  if (!isPlatformOwner) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-destructive" />
            <CardTitle>Platform owner only</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This area is restricted to the platform owner. If you manage a tenant,
            head to <strong>Settings → Workspace</strong> instead.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Platform · Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every workspace running on PaigeAgent. Switch tenants from the header dropdown.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Tenants" value={totals.tenants} icon={Building2} />
        <StatCard label="Active" value={totals.active} icon={Building2} />
        <StatCard label="Team seats" value={totals.members} icon={Users} />
        <StatCard label="Customers" value={totals.customers} icon={ContactIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All tenants</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No tenants yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Seats</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">/{t.slug}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {t.plan_offer ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={t.status === "active" ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.member_count}/{t.seat_limit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.customer_count}/{t.customer_limit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
        </div>
        <Icon className="w-5 h-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
