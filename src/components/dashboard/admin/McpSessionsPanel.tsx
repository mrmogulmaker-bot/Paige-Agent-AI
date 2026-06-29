import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug2, Loader2, ShieldOff, Copy, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const MCP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-mcp`;

type Token = {
  id: string;
  client_id: string;
  client_name_cache: string | null;
  scopes: string[];
  access_expires_at: string;
  refresh_expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export function McpSessionsPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("paige_mcp_oauth_tokens")
      .select("id, client_id, client_name_cache, scopes, access_expires_at, refresh_expires_at, revoked_at, last_used_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setTokens((data ?? []) as Token[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function revoke(id: string) {
    setRevoking(id);
    const { error } = await supabase
      .from("paige_mcp_oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    setRevoking(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Session revoked");
    load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug2 className="w-4 h-4" /> MCP Sessions
        </CardTitle>
        <CardDescription>
          External AI tools (Claude Desktop, ChatGPT, custom agents) that have OAuth access to Paige on your behalf.
          Revoke any session to immediately cut its access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No active or past MCP sessions.</p>
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => {
              const active = !t.revoked_at && new Date(t.access_expires_at) > new Date();
              return (
                <div key={t.id} className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{t.client_name_cache ?? t.client_id}</span>
                      {t.revoked_at ? (
                        <Badge variant="outline" className="text-xs">Revoked</Badge>
                      ) : active ? (
                        <Badge className="text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Expired</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Last used: {t.last_used_at ? formatDistanceToNow(new Date(t.last_used_at), { addSuffix: true }) : "never"}</span>
                      <span>Issued: {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</span>
                    </div>
                    <div className="text-xs mt-1 flex flex-wrap gap-1">
                      {t.scopes.map((s) => (
                        <code key={s} className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{s}</code>
                      ))}
                    </div>
                  </div>
                  {!t.revoked_at && (
                    <Button
                      size="sm" variant="outline"
                      disabled={revoking === t.id}
                      onClick={() => revoke(t.id)}
                      className="shrink-0"
                    >
                      {revoking === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldOff className="h-3.5 w-3.5 mr-1" /> Revoke</>}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
