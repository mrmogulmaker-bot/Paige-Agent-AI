import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Notif = {
  id: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  body: string | null;
  read_at: string | null;
};

export function AdminBridgeBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { count } = await supabase
        .from("paige_admin_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (mounted && typeof count === "number") setUnread(count);
    })();

    const channel = supabase
      .channel("paige_admin_notifications_bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "paige_admin_notifications" },
        (payload) => {
          const n = payload.new as Notif;
          setUnread((c) => c + 1);
          if (n.severity === "warning" || n.severity === "urgent") {
            toast(n.title, {
              description: n.body ?? undefined,
              action: { label: "View", onClick: () => navigate("/admin/notifications") },
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "paige_admin_notifications" },
        (payload) => {
          const oldN = payload.old as Notif;
          const newN = payload.new as Notif;
          if (!oldN.read_at && newN.read_at) setUnread((c) => Math.max(0, c - 1));
          if (oldN.read_at && !newN.read_at) setUnread((c) => c + 1);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/admin/notifications")}
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
  );
}
