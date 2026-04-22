// Broker → Paige Sessions tab. Lists past sessions and lets the broker
// launch a new strategy session by picking a client.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MessageSquare, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";

interface SessionRow {
  id: string;
  client_relationship_id: string;
  created_at: string;
  updated_at: string;
  summary: string | null;
  summary_shared_at: string | null;
  client_first_name?: string;
  client_last_name?: string;
}

interface ClientOpt {
  id: string;
  client_first_name: string;
  client_last_name: string;
  client_email: string;
}

const BrokerSessions = () => {
  const { profile } = useBrokerProfile();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      setLoading(true);
      const [{ data: sessions }, { data: clientList }] = await Promise.all([
        supabase
          .from("broker_paige_sessions")
          .select("id, client_relationship_id, created_at, updated_at, summary, summary_shared_at")
          .eq("broker_id", profile.id)
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("broker_client_relationships")
          .select("id, client_first_name, client_last_name, client_email")
          .eq("broker_id", profile.id)
          .eq("is_active", true)
          .order("client_first_name"),
      ]);

      const byRel = new Map<string, ClientOpt>();
      (clientList || []).forEach((c: any) => byRel.set(c.id, c));
      const enriched: SessionRow[] = (sessions || []).map((s: any) => ({
        ...s,
        client_first_name: byRel.get(s.client_relationship_id)?.client_first_name,
        client_last_name: byRel.get(s.client_relationship_id)?.client_last_name,
      }));
      setRows(enriched);
      setClients((clientList as ClientOpt[]) || []);
      setLoading(false);
    })();
  }, [profile?.id]);

  const filtered = rows.filter((r) => {
    const term = search.toLowerCase();
    if (!term) return true;
    const name = `${r.client_first_name || ""} ${r.client_last_name || ""}`.toLowerCase();
    return name.includes(term) || new Date(r.created_at).toLocaleDateString().includes(term);
  });

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paige Sessions</h1>
          <p className="text-muted-foreground">
            Private peer-advisor strategy chats — one per client conversation.
          </p>
        </div>
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />New session</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a Paige session</DialogTitle>
              <DialogDescription>Pick a client to talk through.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add a client first.</p>
              ) : (
                clients.map((c) => (
                  <button
                    key={c.id}
                    className="w-full text-left p-3 rounded-md border hover:bg-accent transition-colors"
                    onClick={() => {
                      setPickerOpen(false);
                      navigate(`/broker/app/sessions/${c.id}`);
                    }}
                  >
                    <div className="font-medium">{c.client_first_name} {c.client_last_name}</div>
                    <div className="text-xs text-muted-foreground">{c.client_email}</div>
                  </button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Session history</CardTitle>
              <CardDescription>{rows.length} session{rows.length === 1 ? "" : "s"}</CardDescription>
            </div>
            <div className="relative max-w-xs">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by client or date"
                className="pl-8 h-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No sessions yet. Start your first strategy session.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <Link
                  key={s.id}
                  to={`/broker/app/sessions/${s.client_relationship_id}`}
                  className="block p-4 rounded-md border hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {s.client_first_name || "Client"} {s.client_last_name || ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(s.created_at).toLocaleString()}
                      </div>
                      {s.summary && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {s.summary.slice(0, 200)}
                        </p>
                      )}
                    </div>
                    {s.summary_shared_at && <Badge variant="secondary">Shared</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BrokerSessions;
