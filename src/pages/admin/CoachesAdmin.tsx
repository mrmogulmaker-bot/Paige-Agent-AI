import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCog } from "lucide-react";

type CoachRow = {
  user_id: string;
  name: string;
  email?: string | null;
  client_count: number;
  active_count: number;
};

export default function CoachesAdmin() {
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "coach");
    const ids = (roles || []).map((r: any) => r.user_id);
    if (!ids.length) { setCoaches([]); setLoading(false); return; }

    const [profilesRes, clientsRes, ccRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
      supabase.from("clients").select("assigned_coach_user_id, status").in("assigned_coach_user_id", ids),
      supabase.from("coach_clients").select("coach_user_id, status").in("coach_user_id", ids),
    ]);

    const rows: CoachRow[] = ids.map((id) => {
      const p = (profilesRes.data || []).find((x: any) => x.user_id === id);
      const direct = (clientsRes.data || []).filter((c: any) => c.assigned_coach_user_id === id);
      const linked = (ccRes.data || []).filter((c: any) => c.coach_user_id === id);
      const total = direct.length + linked.length;
      const active = direct.filter((c: any) => c.status === "active").length
                   + linked.filter((c: any) => c.status === "active").length;
      return {
        user_id: id,
        name: p?.full_name || "Unnamed Coach",
        client_count: total,
        active_count: active,
      };
    }).sort((a, b) => b.client_count - a.client_count);

    setCoaches(rows);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Coaches</h1>
        <p className="text-sm text-muted-foreground">Coach roster and current client load.</p>
      </div>
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading coaches…</div>
        ) : coaches.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No coaches yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {coaches.map((c) => (
              <div key={c.user_id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                    <UserCog className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{c.user_id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{c.active_count} active</Badge>
                  <Badge>{c.client_count} total</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
