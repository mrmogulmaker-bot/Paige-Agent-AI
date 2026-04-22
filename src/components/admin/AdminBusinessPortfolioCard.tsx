import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Crown,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
  Lock,
  Briefcase,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { entityRoleLabel } from "@/contexts/BusinessContext";
import { cn } from "@/lib/utils";

interface AdminBusinessPortfolioCardProps {
  clientUserId: string;
}

interface AdminBusinessRow {
  id: string;
  legal_name: string;
  dba: string | null;
  entity_type: string | null;
  entity_role: string | null;
  parent_business_id: string | null;
  organizational_level: number | null;
  display_order: number | null;
  is_primary: boolean;
  is_active: boolean;
  ein: string | null;
  formation_date: string | null;
  state_of_formation: string | null;
  estimated_annual_revenue: number | null;
  // Bureau snapshot fields directly on businesses table
  dnb_paydex: number | null;
  dnb_paydex_score: number | null;
  dnb_report_date: string | null;
  experian_intelliscore: number | null;
  experian_intelliscore_score: number | null;
  experian_days_beyond_terms: number | null;
  experian_report_date: string | null;
  equifax_payment_index: number | null;
  equifax_payment_index_score: number | null;
  equifax_sbfe_score: number | null;
  equifax_report_date: string | null;
  fico_sbss: number | null;
}

interface CreditReportRow {
  id: string;
  business_id: string | null;
  bureau: string;
  paydex_score: number | null;
  intelliscore: number | null;
  sbfe_score: number | null;
  trade_line_count: number | null;
  days_beyond_terms: number | null;
  derogatory_count: number | null;
  highest_credit_extended: number | null;
  payment_trend: string | null;
  report_date: string | null;
}

function formatTimeInBusiness(formationDate: string | null): string {
  if (!formationDate) return "—";
  const start = new Date(formationDate);
  if (Number.isNaN(start.getTime())) return "—";
  const months = Math.max(
    0,
    Math.round((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)),
  );
  if (months < 1) return "<1 mo";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths === 0 ? `${years} yr` : `${years}y ${remMonths}m`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString();
}

interface ScoreOrLockProps {
  label: string;
  value: number | null | undefined;
}

function ScoreOrLock({ label, value }: ScoreOrLockProps) {
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="h-3 w-3" />
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function AdminBusinessPortfolioCard({
  clientUserId,
}: AdminBusinessPortfolioCardProps) {
  const [open, setOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ["admin-portfolio-businesses", clientUserId],
    queryFn: async (): Promise<AdminBusinessRow[]> => {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id, legal_name, dba, entity_type, entity_role, parent_business_id, organizational_level, display_order, is_primary, is_active, ein, formation_date, state_of_formation, estimated_annual_revenue, dnb_paydex, dnb_paydex_score, dnb_report_date, experian_intelliscore, experian_intelliscore_score, experian_days_beyond_terms, experian_report_date, equifax_payment_index, equifax_payment_index_score, equifax_sbfe_score, equifax_report_date, fico_sbss",
        )
        .eq("owner_user_id", clientUserId)
        .order("is_primary", { ascending: false })
        .order("organizational_level", { ascending: true })
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdminBusinessRow[];
    },
  });

  const businessIds = useMemo(() => businesses.map((b) => b.id), [businesses]);

  const { data: reports = [] } = useQuery({
    queryKey: ["admin-portfolio-reports", clientUserId, businessIds.join(",")],
    enabled: open && businessIds.length > 0,
    queryFn: async (): Promise<CreditReportRow[]> => {
      const { data, error } = await supabase
        .from("business_credit_reports")
        .select(
          "id, business_id, bureau, paydex_score, intelliscore, sbfe_score, trade_line_count, days_beyond_terms, derogatory_count, highest_credit_extended, payment_trend, report_date",
        )
        .in("business_id", businessIds)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditReportRow[];
    },
  });

  const reportsByBusiness = useMemo(() => {
    const map: Record<string, CreditReportRow[]> = {};
    for (const r of reports) {
      if (!r.business_id) continue;
      if (!map[r.business_id]) map[r.business_id] = [];
      map[r.business_id].push(r);
    }
    return map;
  }, [reports]);

  // Hierarchy: HoldCo first, subsidiaries indented under their parents
  const orderedRows = useMemo(() => {
    const roots = businesses.filter((b) => !b.parent_business_id);
    const childrenOf = (id: string) =>
      businesses.filter((b) => b.parent_business_id === id);
    const out: { biz: AdminBusinessRow; indent: number }[] = [];
    for (const root of roots) {
      out.push({ biz: root, indent: 0 });
      for (const child of childrenOf(root.id)) {
        out.push({ biz: child, indent: 1 });
      }
    }
    // Orphaned rows whose parent isn't in the set
    for (const b of businesses) {
      if (b.parent_business_id && !businesses.some((p) => p.id === b.parent_business_id)) {
        out.push({ biz: b, indent: 1 });
      }
    }
    return out;
  }, [businesses]);

  const toggleRow = (id: string) =>
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));

  const count = businesses.length;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <CardTitle className="flex items-center justify-between text-lg">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-muted-foreground" />
                <span>Business Portfolio</span>
                <Badge variant="secondary" className="ml-1">
                  {isLoading
                    ? "loading…"
                    : `${count} ${count === 1 ? "entity" : "entities"}`}
                </Badge>
              </div>
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {count === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                This client has no businesses on file yet.
              </p>
            ) : (
              <div className="space-y-2">
                {orderedRows.map(({ biz, indent }) => {
                  const isExpanded = !!expandedRows[biz.id];
                  const isHoldCo = biz.entity_role === "holdco";
                  const reportsForBiz = reportsByBusiness[biz.id] ?? [];

                  return (
                    <div
                      key={biz.id}
                      className={cn(
                        "rounded-lg border border-border bg-card",
                        indent > 0 && "ml-6",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleRow(biz.id)}
                        className="w-full text-left p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors rounded-lg"
                      >
                        <div className="mt-0.5 shrink-0">
                          {isHoldCo ? (
                            <Crown className="h-4 w-4 text-accent" />
                          ) : indent > 0 ? (
                            <CornerDownRight className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Top row: name + badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-foreground">
                              {biz.legal_name}
                            </span>
                            {biz.is_primary && (
                              <Badge variant="default" className="text-[10px] py-0">
                                Primary
                              </Badge>
                            )}
                            {biz.entity_role && (
                              <Badge variant="outline" className="text-[10px] py-0">
                                {entityRoleLabel(biz.entity_role)}
                              </Badge>
                            )}
                            {biz.entity_type && (
                              <Badge variant="secondary" className="text-[10px] py-0 uppercase">
                                {biz.entity_type.replace(/_/g, " ")}
                              </Badge>
                            )}
                            {!biz.is_active && (
                              <Badge variant="destructive" className="text-[10px] py-0">
                                Inactive
                              </Badge>
                            )}
                          </div>

                          {/* Meta row: formation, TIB, EIN */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>Formed: {formatDate(biz.formation_date)}</span>
                            <span>TIB: {formatTimeInBusiness(biz.formation_date)}</span>
                            <span>EIN: {biz.ein ? "on file" : "missing"}</span>
                            {biz.state_of_formation && (
                              <span>State: {biz.state_of_formation}</span>
                            )}
                          </div>

                          {/* Bureau scores row */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                            <ScoreOrLock label="Paydex" value={biz.dnb_paydex_score ?? biz.dnb_paydex} />
                            <ScoreOrLock
                              label="Intelliscore"
                              value={biz.experian_intelliscore_score ?? biz.experian_intelliscore}
                            />
                            <ScoreOrLock
                              label="Equifax PI"
                              value={biz.equifax_payment_index_score ?? biz.equifax_payment_index}
                            />
                            <ScoreOrLock label="FICO SBSS" value={biz.fico_sbss} />
                          </div>
                        </div>

                        <div className="shrink-0 mt-1">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20">
                          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2 mb-2">
                            Bureau snapshot
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-muted-foreground">D&amp;B Paydex</p>
                              <p className="font-medium">
                                {biz.dnb_paydex_score ?? biz.dnb_paydex ?? "—"}
                                {biz.dnb_report_date && (
                                  <span className="text-muted-foreground ml-1">
                                    ({formatDate(biz.dnb_report_date)})
                                  </span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Experian Intelliscore</p>
                              <p className="font-medium">
                                {biz.experian_intelliscore_score ?? biz.experian_intelliscore ?? "—"}
                                {biz.experian_report_date && (
                                  <span className="text-muted-foreground ml-1">
                                    ({formatDate(biz.experian_report_date)})
                                  </span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Equifax SBFE</p>
                              <p className="font-medium">
                                {biz.equifax_sbfe_score ?? "—"}
                                {biz.equifax_report_date && (
                                  <span className="text-muted-foreground ml-1">
                                    ({formatDate(biz.equifax_report_date)})
                                  </span>
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Days Beyond Terms (Exp)</p>
                              <p className="font-medium">
                                {biz.experian_days_beyond_terms ?? "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">FICO SBSS</p>
                              <p className="font-medium">{biz.fico_sbss ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Annual Revenue (est.)</p>
                              <p className="font-medium">
                                {biz.estimated_annual_revenue
                                  ? `$${Number(biz.estimated_annual_revenue).toLocaleString()}`
                                  : "—"}
                              </p>
                            </div>
                          </div>

                          {reportsForBiz.length > 0 && (
                            <>
                              <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-4 mb-2">
                                Uploaded credit reports ({reportsForBiz.length})
                              </h5>
                              <div className="space-y-1.5">
                                {reportsForBiz.map((r) => (
                                  <div
                                    key={r.id}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs p-2 rounded border border-border bg-card"
                                  >
                                    <Badge variant="outline" className="text-[10px] py-0 uppercase">
                                      {r.bureau}
                                    </Badge>
                                    <span className="text-muted-foreground">
                                      {formatDate(r.report_date)}
                                    </span>
                                    {r.paydex_score !== null && (
                                      <span>Paydex: <strong>{r.paydex_score}</strong></span>
                                    )}
                                    {r.intelliscore !== null && (
                                      <span>Intelli: <strong>{r.intelliscore}</strong></span>
                                    )}
                                    {r.sbfe_score !== null && (
                                      <span>SBFE: <strong>{r.sbfe_score}</strong></span>
                                    )}
                                    {r.trade_line_count !== null && (
                                      <span>Tradelines: <strong>{r.trade_line_count}</strong></span>
                                    )}
                                    {r.days_beyond_terms !== null && (
                                      <span>DBT: <strong>{r.days_beyond_terms}</strong></span>
                                    )}
                                    {r.derogatory_count !== null && (
                                      <span>Derog: <strong>{r.derogatory_count}</strong></span>
                                    )}
                                    {r.payment_trend && (
                                      <span className="text-muted-foreground">
                                        Trend: {r.payment_trend}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
