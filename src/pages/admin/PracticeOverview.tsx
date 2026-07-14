import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  DollarSign,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Clock,
  CalendarClock,
  CheckSquare,
  UserPlus,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PageShell,
  PageHeader,
  StatRow,
  StatTile,
  SectionCard,
  EmptyState,
  StatePill,
  GlyphPlate,
} from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { ExportClientsButton } from "@/components/dashboard/admin/ExportClientsButton";
import { OwnerWelcome, type OnboardingState } from "@/components/onboarding/OwnerWelcome";
import { usePracticeDashboard } from "@/hooks/usePracticeDashboard";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";

const usd = (cents: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100));

const num = (n: number) => n.toLocaleString();

/** One row in the "Needs You Today" rail — a neutral, linked count. Gold is
 *  reserved for the single act moment (approvals), never these resting rows. */
function AttentionItem({
  icon,
  label,
  count,
  href,
  emphasize,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      to={href}
      className="group flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
    >
      <GlyphPlate icon={icon} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {num(count)}
        </div>
        <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </div>
      {emphasize && count > 0 ? (
        <StatePill state="warning">Review</StatePill>
      ) : (
        <ArrowRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </Link>
  );
}

export function PracticeOverview({ children }: { children?: ReactNode }) {
  const { metrics, attention, loading } = usePracticeDashboard();
  // The rail's act moment: live approvals awaiting this user. usePendingApprovals
  // subscribes to paige_pending_approvals realtime, so this count is instant.
  const { items: approvals } = usePendingApprovals({ scope: "mine" });
  const approvalsCount = approvals.length;

  // First-run welcome (§9/§10). Completion state is authoritative in the tenants row,
  // read through the Paige-callable RPC — never localStorage. We show the guided
  // welcome only while it's neither dismissed nor completed; it's an above-the-fold,
  // dismissible panel that never blocks the dashboard underneath.
  const { activeTenantId, activeTenant } = useTenantContext();
  const [welcome, setWelcome] = useState<OnboardingState | null>(null);
  const [welcomeHidden, setWelcomeHidden] = useState(false);

  useEffect(() => {
    let on = true;
    setWelcome(null);
    setWelcomeHidden(false);
    if (!activeTenantId) return;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("get_owner_onboarding_state" as any, {
        p_tenant_id: activeTenantId,
      });
      // Role-gated RPC: a non-owner/admin caller raises — we simply show nothing.
      if (!on || error) return;
      setWelcome((data ?? {}) as OnboardingState);
    })();
    return () => { on = false; };
  }, [activeTenantId]);

  const showWelcome =
    !welcomeHidden &&
    welcome !== null &&
    !welcome.dismissed &&
    !welcome.completed_at;

  // Defensive: render a KPI tile only when its key is actually present (§13).
  const kpis: Array<{ key: string; node: JSX.Element }> = [];
  if (loading || metrics?.active_clients !== undefined) {
    kpis.push({
      key: "active_clients",
      node: (
        <StatTile
          label="Active clients"
          value={num(metrics?.active_clients ?? 0)}
          icon={Users}
          loading={loading}
          hint={
            metrics?.new_clients !== undefined && metrics.new_clients > 0
              ? `${num(metrics.new_clients)} new this period`
              : undefined
          }
        />
      ),
    });
  }
  if (loading || metrics?.won_value_cents !== undefined) {
    kpis.push({
      key: "won_value_cents",
      node: (
        <StatTile
          label="Revenue this period"
          value={usd(metrics?.won_value_cents ?? 0)}
          icon={DollarSign}
          loading={loading}
          hint={
            metrics?.arpc_cents !== undefined
              ? `${usd(metrics.arpc_cents)} avg / client`
              : undefined
          }
        />
      ),
    });
  }
  if (loading || metrics?.active_retainers !== undefined) {
    kpis.push({
      key: "active_retainers",
      node: (
        <StatTile
          label="Active retainers"
          value={num(metrics?.active_retainers ?? 0)}
          icon={Wallet}
          loading={loading}
        />
      ),
    });
  }
  if (loading || metrics?.pipeline_value_cents !== undefined) {
    kpis.push({
      key: "pipeline_value_cents",
      node: (
        <StatTile
          label="Pipeline value"
          value={usd(metrics?.pipeline_value_cents ?? 0)}
          icon={TrendingUp}
          loading={loading}
        />
      ),
    });
  }

  const railItems = [
    {
      key: "at_risk_clients",
      icon: AlertTriangle,
      label: "At-risk clients",
      value: attention?.at_risk_clients,
      href: "/admin/clients",
    },
    {
      key: "follow_ups_due",
      icon: Clock,
      label: "Follow-ups due",
      value: attention?.follow_ups_due,
      href: "/admin/approvals",
    },
    {
      key: "upcoming_sessions_7d",
      icon: CalendarClock,
      label: "Sessions next 7 days",
      value: attention?.upcoming_sessions_7d,
      href: "/admin/calendar",
    },
    {
      key: "tasks_due",
      icon: CheckSquare,
      label: "Tasks due",
      value: attention?.tasks_due,
      href: "/admin/planning",
    },
    {
      key: "onboarding_in_progress",
      icon: UserPlus,
      label: "Onboarding in progress",
      value: attention?.onboarding_in_progress,
      href: "/admin/clients",
    },
  ].filter((i) => i.value !== undefined) as Array<{
    key: string;
    icon: LucideIcon;
    label: string;
    value: number;
    href: string;
  }>;

  const attentionTotal = railItems.reduce((sum, i) => sum + i.value, 0);
  const emptyBook =
    !loading &&
    (metrics?.active_clients ?? 0) === 0 &&
    attentionTotal === 0 &&
    approvalsCount === 0;

  const stages = metrics?.deals_by_stage ?? [];
  const activeStages = stages.filter((s) => s.count > 0 || s.value_cents > 0);

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        icon={LayoutDashboard}
        eyebrow="Overview"
        title="Your practice at a glance"
        description="The people you serve, the revenue in motion, and exactly what's waiting on you today."
        actions={<ExportClientsButton />}
      />

      {showWelcome && activeTenantId && (
        <OwnerWelcome
          tenantId={activeTenantId}
          accountType={activeTenant?.account_type ?? "standalone"}
          initialState={welcome ?? {}}
          onClose={() => setWelcomeHidden(true)}
        />
      )}

      {kpis.length > 0 && (
        <StatRow cols={4}>{kpis.map((k) => <div key={k.key}>{k.node}</div>)}</StatRow>
      )}

      {emptyBook ? (
        <SectionCard>
          <EmptyState
            icon={Sparkles}
            tone="brand"
            title="Your book is a blank canvas"
            description="Add your first client and Paige starts working both sides — onboarding them and surfacing your next move here."
            action={
              <Button asChild variant="gold">
                <Link to="/admin/clients">Add your first client</Link>
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Needs you today"
          description="What Paige has teed up for your attention, live."
          icon={Sparkles}
          actions={
            approvalsCount > 0 ? (
              <Button asChild variant="gold" size="sm">
                <Link to="/admin/approvals">
                  Review {num(approvalsCount)} approval{approvalsCount === 1 ? "" : "s"}
                </Link>
              </Button>
            ) : (
              <StatePill state="success">All clear</StatePill>
            )
          }
        >
          {railItems.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Nothing needs you right now"
              description="Paige will raise at-risk clients, due follow-ups, and upcoming sessions here as they come up."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {railItems.map((i) => (
                <AttentionItem
                  key={i.key}
                  icon={i.icon}
                  label={i.label}
                  count={i.value}
                  href={i.href}
                  emphasize={i.key === "at_risk_clients"}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {!emptyBook && metrics?.deals_by_stage !== undefined && (
        <SectionCard
          title="Open pipeline by stage"
          description="Where your active deals sit right now."
          icon={TrendingUp}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/pipeline">
                Open pipeline <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
              </Link>
            </Button>
          }
        >
          {activeStages.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No open deals yet"
              description="As you move deals through your pipeline, the value in each stage shows up here."
            />
          ) : (
            <ul className="divide-y divide-border/60">
              {activeStages.map((s) => (
                <li
                  key={s.stage_label}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium text-foreground">
                      {s.stage_label}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {num(s.count)}
                    </span>
                  </div>
                  <span className="shrink-0 font-display text-sm font-semibold tabular-nums text-foreground">
                    {usd(s.value_cents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {children}
    </PageShell>
  );
}
