import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug2, Loader2, ShieldOff, Copy, Sparkles, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// White-label rule: the product name "Paige" never appears inside /workspace/*.
// Hybrid branding: when the tenant has filled their legal profile and the
// "white_label_ai_connect" toggle is on, we show their brand name + logo.
// Otherwise we fall back to a neutral "AI Assistant" label. A "Powered by
// Paige Agent AI" footer is always shown for legal clarity.

const MCP_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-mcp`;

type Token = {
  id: string;
  client_id: string;
  client_name_cache: string | null;
  scopes: string[];
  access_expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

type Brand = {
  tenant_name: string | null;
  white_label_ai_connect: boolean;
  brand_display_name: string | null;
  brand_logo_url: string | null;
  legal_business_name: string | null;
};

const SELF_SCOPE_COPY: Record<string, string> = {
  "self.read": "View your own profile, businesses, tasks, and BTF progress",
  "self.write": "Update your own profile, log progress, message your coach",
  "self.chat": "Have conversational sessions about your own workspace",
};

export function WorkspaceConnectPanel() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);

  const brandName =
    brand && brand.white_label_ai_connect
      ? brand.brand_display_name ||
        brand.legal_business_name ||
        brand.tenant_name ||
        ""
      : "";
  const showBrand = brandName.length > 0;

  async function load() {
    setLoading(true);
    const [tokensRes, brandRes] = await Promise.all([
      // RLS on paige_mcp_oauth_tokens already scopes to auth.uid() = user_id.
      supabase
        .from("paige_mcp_oauth_tokens")
        .select("id, client_id, client_name_cache, scopes, access_expires_at, revoked_at, last_used_at, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.rpc("get_workspace_brand" as never),
    ]);
    if (tokensRes.error) toast.error(tokensRes.error.message);
    setTokens((tokensRes.data ?? []) as Token[]);
    const brandData = brandRes.data as unknown as Brand[] | null;
    const row = Array.isArray(brandData) && brandData.length > 0 ? brandData[0] : null;
    setBrand((row as Brand) ?? null);
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
    toast.success("Connection revoked");
    load();
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {showBrand && brand?.brand_logo_url ? (
              <img
                src={brand.brand_logo_url}
                alt={brandName}
                className="w-5 h-5 rounded object-contain"
              />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {showBrand
              ? `Connect your AI assistant to ${brandName}`
              : "Connect your AI assistant"}
          </CardTitle>
          <CardDescription>
            Plug your AI assistant (Claude, ChatGPT, Cursor, etc.) into
            {showBrand ? ` your ${brandName} workspace` : " your workspace"}{" "}
            using the Model Context Protocol. Once connected, you can talk to
            your assistant from anywhere and it can update{" "}
            <strong>your own profile</strong>, log progress, search lender
            products, and message your coach — all scoped to{" "}
            <strong>your account only</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-medium opacity-70 mb-1">
              Workspace connector URL
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-2 py-1.5 rounded text-xs break-all">
                {MCP_ENDPOINT}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(MCP_ENDPOINT, "URL")}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-md border p-3">
              <div className="font-semibold mb-1">Claude Desktop / Claude.ai</div>
              <p className="opacity-75">
                Settings → Connectors → <em>Add custom connector</em>. Paste
                the URL above. Claude will pop a sign-in window — use the
                same email you used to join.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <div className="font-semibold mb-1">ChatGPT</div>
              <p className="opacity-75">
                Business / Enterprise plans: Settings → Connectors →{" "}
                <em>Add MCP server</em>. Paste the URL and complete the
                sign-in.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <div className="font-semibold mb-1">Cursor / other agents</div>
              <p className="opacity-75">
                Add as a remote MCP server using the URL above. Your agent
                will open the sign-in flow on first use.
              </p>
            </div>
          </div>

          <div className="rounded-md border p-3 text-xs space-y-2" style={{ borderColor: "var(--mma-line)" }}>
            <div className="font-semibold">What your assistant can do</div>
            <ul className="space-y-1 opacity-80">
              {Object.entries(SELF_SCOPE_COPY).map(([scope, copy]) => (
                <li key={scope} className="flex gap-2">
                  <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted shrink-0 self-start mt-0.5">{scope}</code>
                  <span>{copy}</span>
                </li>
              ))}
            </ul>
            <div className="pt-1 opacity-70">
              Your assistant can <strong>never</strong> read or change another
              member's data — every action is locked to your own account.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="https://modelcontextprotocol.io/clients" target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> MCP-compatible apps
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug2 className="w-4 h-4" /> Your active connections
          </CardTitle>
          <CardDescription>
            AI tools that currently have access to your workspace. Revoke any
            one to cut its access immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 opacity-60">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : tokens.length === 0 ? (
            <p className="text-sm opacity-70 py-6 text-center">
              No AI assistants connected yet.
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((t) => {
                const active = !t.revoked_at && new Date(t.access_expires_at) > new Date();
                return (
                  <div key={t.id} className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {t.client_name_cache ?? t.client_id}
                        </span>
                        {t.revoked_at ? (
                          <Badge variant="outline" className="text-xs">Revoked</Badge>
                        ) : active ? (
                          <Badge className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Expired</Badge>
                        )}
                      </div>
                      <div className="text-xs opacity-70 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
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

      {/* Legal-clarity footer: always shown, regardless of white-label state. */}
      <p className="text-[10px] opacity-50 text-center">
        Powered by Paige Agent AI · Your AI assistant connects directly to
        your workspace; the platform never sees your conversations.
      </p>
    </div>
  );
}
