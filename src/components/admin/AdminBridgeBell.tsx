import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Notif = {
  id: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  body: string | null;
  link_to: string | null;
  source_workflow_key: string | null;
  read_at: string | null;
  created_at: string;
};

const severityStyles: Record<Notif["severity"], string> = {
  info: "bg-muted text-foreground",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  urgent: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
};

export function AdminBridgeBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const unread = items.filter((n) => !n.read_at).length;

  function toggleExpanded(id: string, n?: Notif) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (n && !n.read_at) markRead(id);
      }
      return next;
    });
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("paige_admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (mounted) {
        setItems((data ?? []) as Notif[]);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel("paige_admin_notifications_bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "paige_admin_notifications" },
        (payload) => {
          const n = payload.new as Notif;
          setItems((prev) => [n, ...prev].slice(0, 50));
          if (n.severity === "warning" || n.severity === "urgent") {
            toast(n.title, {
              description: n.body ?? undefined,
              action: { label: "Open", onClick: () => setOpen(true) },
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "paige_admin_notifications" },
        (payload) => {
          const newN = payload.new as Notif;
          setItems((prev) => prev.map((n) => (n.id === newN.id ? newN : n)));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  async function markRead(id: string) {
    const { error } = await supabase
      .from("paige_admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Failed to mark read");
  }

  async function markAllRead() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const { error } = await supabase
      .from("paige_admin_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) toast.error("Failed to mark all read");
    else toast.success(`Marked ${ids.length} as read`);
  }

  function openLink(n: Notif) {
    markRead(n.id);
    if (n.link_to) {
      setOpen(false);
      navigate(n.link_to);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Admin notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
          className="relative text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
        >
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-[10px] font-semibold leading-[16px] text-primary text-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" /> Notifications
              {unread > 0 && <Badge variant="secondary">{unread} new</Badge>}
            </SheetTitle>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead}>
                  <CheckCheck className="w-4 h-4 mr-1" /> All read
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              You're caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`px-5 py-3 ${n.read_at ? "opacity-70" : "bg-accent/5"}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge className={`${severityStyles[n.severity]} shrink-0`}>{n.severity}</Badge>
                      <h4 className="font-medium text-sm leading-tight truncate">{n.title}</h4>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
            <ul className="divide-y">
              {items.map((n) => {
                const isOpen = expanded.has(n.id);
                return (
                  <li
                    key={n.id}
                    className={`${n.read_at ? "opacity-70" : "bg-accent/5"}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(n.id, n)}
                      className="w-full text-left px-5 py-3 hover:bg-accent/10 transition-colors"
                      aria-expanded={isOpen}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Badge className={`${severityStyles[n.severity]} shrink-0`}>{n.severity}</Badge>
                          <h4 className={`font-medium text-sm leading-tight flex-1 ${isOpen ? "" : "truncate"}`}>
                            {n.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </div>
                      </div>
                      {n.body && !isOpen && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                      )}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 -mt-1">
                        {n.body && (
                          <div className="text-xs text-foreground/90 whitespace-pre-wrap break-words rounded-md bg-muted/40 border p-3 mb-2 max-h-[60vh] overflow-auto">
                            {n.body}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          {n.source_workflow_key && (
                            <span className="text-muted-foreground">from {n.source_workflow_key}</span>
                          )}
                          {n.link_to && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openLink(n); }}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Open in page <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                          {!n.read_at && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                              className="ml-auto text-primary hover:underline"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="border-t px-5 py-3">
          <Link
            to="/admin/notifications"
            onClick={() => setOpen(false)}
            className="text-xs text-primary hover:underline"
          >
            View full notification history →
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
