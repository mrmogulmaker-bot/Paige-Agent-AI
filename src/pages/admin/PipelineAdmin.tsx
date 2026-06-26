import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  entity_name: string | null;
  status: string;
  funding_goal: number | null;
  linked_user_id: string | null;
};

const STAGES: { key: string; label: string }[] = [
  { key: "pending", label: "Lead" },
  { key: "active", label: "In Progress" },
  { key: "inactive", label: "Paused" },
  { key: "archived", label: "Closed" },
];

export default function PipelineAdmin() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, first_name, last_name, entity_name, status, funding_goal, linked_user_id")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setClients(data || []);
    setLoading(false);
  };

  const move = async (clientId: string, newStatus: string) => {
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, status: newStatus } : c));
    const { error } = await supabase.from("clients").update({ status: newStatus }).eq("id", clientId);
    if (error) toast.error(error.message);
    else toast.success("Stage updated");
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };
  const onDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) move(id, status);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Pipeline</h1>
        <p className="text-sm text-muted-foreground">Drag contacts across stages.</p>
      </div>
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Loading pipeline…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {STAGES.map((stage) => {
            const items = clients.filter((c) => c.status === stage.key);
            return (
              <div
                key={stage.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, stage.key)}
                className="bg-muted/30 rounded-lg p-3 min-h-[400px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold text-sm">{stage.label}</div>
                  <Badge variant="outline">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((c) => (
                    <Card
                      key={c.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, c.id)}
                      onClick={() => navigate(
                        c.linked_user_id
                          ? `/admin/clients/user/${c.linked_user_id}`
                          : `/admin/clients/internal/${c.id}`
                      )}
                      className="p-3 cursor-grab active:cursor-grabbing hover:border-accent transition-colors"
                    >
                      <div className="font-medium text-sm">{c.first_name} {c.last_name}</div>
                      {c.entity_name && <div className="text-xs text-muted-foreground truncate">{c.entity_name}</div>}
                      {c.funding_goal && (
                        <div className="text-xs text-accent mt-1">${Number(c.funding_goal).toLocaleString()}</div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
