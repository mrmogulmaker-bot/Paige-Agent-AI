// The Live desk (cc-spec §2.b). Four ranked groups, most decision-forcing first,
// under an always-visible activity sliver so "she's alive" is never below the
// fold (S3). Group 1 (approvals) rescopes to the focused customer and relabels +
// shows a cross-scope link (B3) — but the tenant-wide count on the command bar is
// owned upstream and never rescopes. At most 3 rows/group, then "View all (n)".
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTasks } from "@/hooks/useTasks";
import type { ApprovalQueueRow } from "@/hooks/usePendingApprovals";
import { ApprovalRow } from "./ApprovalRow";
import type { FocusedClient } from "./commandCenterTypes";
import { firstNameOf } from "./commandCenterTypes";

const MAX_ROWS = 3;

// ── Group header ──────────────────────────────────────────────────────────────
function GroupHeader({ label, count, badge }: { label: string; count?: number; badge?: string }) {
  return (
    <div className="flex items-center gap-2 px-0.5 pt-1 pb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-[11px] text-muted-foreground/60 tabular-nums">· {count}</span>
      )}
      {badge && <Badge variant="outline" className="ml-auto text-[10px] text-accent border-accent/40">{badge}</Badge>}
    </div>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="px-0.5 py-1 text-xs text-muted-foreground">{children}</p>;
}

function ViewAll({ to, n }: { to: string; n: number }) {
  if (n <= MAX_ROWS) return null;
  return (
    <Button asChild variant="link" size="sm" className="h-auto p-0 px-0.5 text-xs text-muted-foreground hover:text-accent">
      <Link to={to}>View all ({n})</Link>
    </Button>
  );
}

// ── Notifications (activity sliver + "Just happened") ─────────────────────────
type Notif = { id: string; title: string; body: string | null; created_at: string };

function useRecentNotifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase
        .from("paige_admin_notifications")
        .select("id, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (on) { setItems((data ?? []) as Notif[]); setLoading(false); }
    })();

    const ch = supabase
      .channel("paige_cc_notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "paige_admin_notifications" }, (p) => {
        setItems((prev) => [p.new as Notif, ...prev].slice(0, 20));
      })
      .subscribe();
    return () => { on = false; supabase.removeChannel(ch); };
  }, []);

  return { items, loading };
}

// ── In motion (focused only): proposed customer actions ───────────────────────
const ACTION_STATUS_LABEL: Record<string, string> = {
  proposed: "Proposed",
  customer_notified: "Sent",
  customer_acted: "Client acted",
  customer_declined: "Declined",
  expired: "Expired",
};

interface InMotionRow {
  id: string;
  action_type: string;
  title: string;
  body: string | null;
  status: string;
  created_at: string;
  responses: Array<{ id: string; response_type: string; response_text: string | null; created_at: string }>;
}

function useInMotion(contactId: string | null) {
  const [rows, setRows] = useState<InMotionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contactId) { setRows([]); return; }
    let on = true;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.rpc("list_pending_customer_actions", { p_contact_id: contactId });
      const payload = data as { ok?: boolean; actions?: InMotionRow[] } | null;
      if (on) { setRows(payload?.ok ? payload.actions ?? [] : []); setLoading(false); }
    };
    void load();
    const ch = supabase
      .channel(`paige_cc_inmotion_${contactId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "paige_customer_actions", filter: `contact_id=eq.${contactId}` }, () => void load())
      .subscribe();
    return () => { on = false; supabase.removeChannel(ch); };
  }, [contactId]);

  return { rows, loading };
}

// ── The feed ──────────────────────────────────────────────────────────────────
interface Props {
  /** Tenant-wide approvals (owned upstream so the command-bar count stays global). */
  approvals: ApprovalQueueRow[];
  approvalsLoading: boolean;
  focused: FocusedClient | null;
}

export function LiveActionFeed({ approvals, approvalsLoading, focused }: Props) {
  const { items: notifications, loading: notifLoading } = useRecentNotifications();
  const { rows: inMotion, loading: inMotionLoading } = useInMotion(focused?.id ?? null);
  const { tasks, loading: tasksLoading, updateTask } = useTasks({ scope: "all", limit: 20 });
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  const first = firstNameOf(focused);

  // Group 1 — approvals rescope to the focused customer (B3). Command-bar count
  // (tenant-wide) is owned upstream and unaffected.
  const focusedApprovals = focused ? approvals.filter((a) => a.contact_id === focused.id) : approvals;
  const crossScopeMore = focused ? approvals.length - focusedApprovals.length : 0;

  const openTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const latest = notifications[0];

  const markDone = async (id: string) => {
    setCompleting((s) => new Set(s).add(id));
    await updateTask(id, { status: "completed" });
    setCompleting((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  return (
    <div className="flex flex-col">
      {/* Live desk header + breathing dot + activity sliver (S3) */}
      <div className="sticky top-0 z-10 bg-primary/[0.02] backdrop-blur-sm px-0.5 pb-2 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary cc-breathe" />
          <span className="text-sm font-semibold">Live desk</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {notifLoading
            ? "…"
            : latest
              ? <>{latest.title} <span className="opacity-60">· {formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}</span></>
              : "Nothing yet — Paige's moves show up here live."}
        </p>
      </div>

      {/* Group 1 — Needs your approval (star) */}
      <section className="mt-1">
        <GroupHeader
          label={focused ? `Needs your approval · ${first}` : "Needs your approval"}
          count={focusedApprovals.length}
        />
        {approvalsLoading ? (
          <div className="flex items-center gap-2 px-0.5 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : focusedApprovals.length === 0 ? (
          <EmptyLine>Nothing waiting on you. Paige queues anything that needs a yes.</EmptyLine>
        ) : (
          <div className="space-y-1.5">
            {focusedApprovals.slice(0, MAX_ROWS).map((a) => <ApprovalRow key={a.id} a={a} />)}
          </div>
        )}
        <div className="mt-1 flex items-center justify-between">
          {focused && crossScopeMore > 0 ? (
            <Button asChild variant="link" size="sm" className="h-auto p-0 px-0.5 text-xs text-accent">
              <Link to="/admin/approvals">{crossScopeMore} more across all customers <ArrowRight className="ml-0.5 inline h-3 w-3" /></Link>
            </Button>
          ) : <span />}
          <ViewAll to="/admin/approvals" n={focusedApprovals.length} />
        </div>
      </section>

      {/* Group 2 — In motion (focused only) */}
      {focused && (
        <section className="mt-3 border-t pt-2">
          <GroupHeader label="In motion" count={inMotion.length} />
          {inMotionLoading ? (
            <div className="flex items-center gap-2 px-0.5 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : inMotion.length === 0 ? (
            <EmptyLine>No open moves for {first} yet.</EmptyLine>
          ) : (
            <ul className="space-y-1.5">
              {inMotion.slice(0, MAX_ROWS).map((a) => {
                const lastResp = a.responses[a.responses.length - 1];
                return (
                  <li key={a.id} className="rounded-md border p-2.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium min-w-0 line-clamp-1">{a.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">{ACTION_STATUS_LABEL[a.status] ?? a.status}</Badge>
                    </div>
                    <p className="text-[11px] capitalize text-muted-foreground">{a.action_type}</p>
                    {lastResp && (
                      <p className="text-[11px] text-muted-foreground border-l-2 pl-2">
                        <span className="capitalize font-medium">{lastResp.response_type}</span>
                        {lastResp.response_text ? ` — ${lastResp.response_text}` : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {inMotion.length > MAX_ROWS && (
            <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 px-0.5 text-xs text-muted-foreground hover:text-accent">
              <Link to={`/admin/contacts/${focused.id}`}>View all ({inMotion.length})</Link>
            </Button>
          )}
        </section>
      )}

      {/* Group 3 — Just happened */}
      <section className="mt-3 border-t pt-2">
        <GroupHeader label="Just happened" />
        {notifLoading ? (
          <div className="flex items-center gap-2 px-0.5 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : notifications.length === 0 ? (
          <EmptyLine>Quiet for now. New moves show up here as they happen.</EmptyLine>
        ) : (
          <ul className="space-y-1.5">
            {notifications.slice(0, MAX_ROWS).map((n) => (
              <li key={n.id} className="rounded-md border p-2.5">
                <p className="text-sm line-clamp-1">{n.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </li>
            ))}
          </ul>
        )}
        <ViewAll to="/admin/notifications" n={notifications.length} />
      </section>

      {/* Group 4 — Follow-ups (tenant-wide) */}
      <section className="mt-3 border-t pt-2">
        <GroupHeader label="Follow-ups" count={openTasks.length} />
        {tasksLoading ? (
          <div className="flex items-center gap-2 px-0.5 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : openTasks.length === 0 ? (
          <EmptyLine>No follow-ups on deck.</EmptyLine>
        ) : (
          <ul className="space-y-1.5">
            {openTasks.slice(0, MAX_ROWS).map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-md border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm line-clamp-1">{t.title}</p>
                  {t.due_date && (
                    <p className="text-[11px] text-muted-foreground">
                      Due {new Date(t.due_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0"
                  disabled={completing.has(t.id)}
                  onClick={() => markDone(t.id)}
                >
                  {completing.has(t.id)
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Done</>}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ViewAll to="/admin/tasks" n={openTasks.length} />
      </section>
    </div>
  );
}
