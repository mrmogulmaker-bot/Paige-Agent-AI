import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Notif = {
  id: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  body: string | null;
  link_to: string | null;
  source_workflow_key: string | null;
  contact_id: string | null;
  read_at: string | null;
  created_at: string;
};

const severityStyles: Record<Notif["severity"], string> = {
  info: "bg-muted text-foreground",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  urgent: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
};

export default function AdminNotifications() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"unread" | "all">("unread");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("paige_admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!mounted) return;
      if (error) toast.error("Failed to load notifications");
      else setItems((data ?? []) as Notif[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel("paige_admin_notifications_page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "paige_admin_notifications" },
        (payload) => {
          setItems((prev) => [payload.new as Notif, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "paige_admin_notifications" },
        (payload) => {
          setItems((prev) => prev.map((n) => (n.id === (payload.new as Notif).id ? (payload.new as Notif) : n)));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const visible = useMemo(
    () => (tab === "unread" ? items.filter((n) => !n.read_at) : items),
    [items, tab],
  );

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

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6" /> Admin Notifications
          </h1>
          <p className="text-sm text-muted-foreground">
            Pushed in from n8n + MMA OS via the Paige Bridge.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={markAllRead}>
          <CheckCheck className="w-4 h-4 mr-1.5" /> Mark all read
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "unread" | "all")}>
        <TabsList>
          <TabsTrigger value="unread">
            Unread {items.filter((n) => !n.read_at).length > 0 && (
              <Badge variant="secondary" className="ml-1.5">{items.filter((n) => !n.read_at).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-2 mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : visible.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Nothing here. {tab === "unread" ? "You're caught up." : "No notifications yet."}
              </CardContent>
            </Card>
          ) : (
            visible.map((n) => (
              <Card key={n.id} className={n.read_at ? "opacity-70" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge className={severityStyles[n.severity]}>{n.severity}</Badge>
                      <span>{n.title}</span>
                    </CardTitle>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {n.body && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{n.body}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {n.source_workflow_key && <span>from {n.source_workflow_key}</span>}
                    {n.link_to && (
                      <Link to={n.link_to} className="inline-flex items-center gap-1 text-primary hover:underline">
                        Open <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                    {!n.read_at && (
                      <button
                        onClick={() => markRead(n.id)}
                        className="ml-auto text-primary hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
