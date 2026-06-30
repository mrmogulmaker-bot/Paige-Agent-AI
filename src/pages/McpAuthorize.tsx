import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";

const SCOPE_LABELS: Record<string, { title: string; detail: string }> = {
  "crm.read": { title: "Read CRM data", detail: "View contacts, deals, and tasks." },
  "crm.write": { title: "Edit CRM data", detail: "Update contacts, move deals, create tasks and notes." },
  "crm.delete": { title: "Delete CRM records", detail: "Bulk-delete contacts and remove tasks. Owner-only." },
  "workflows.run": { title: "Run workflows", detail: "Trigger automations and decide pending approvals." },
  "btf.read": { title: "Read BTF workspaces", detail: "View client phase progress and documents." },
  "btf.write": { title: "Update BTF workspaces", detail: "Mark phase items complete, send client messages." },
  "admin.read": { title: "Read admin data", detail: "View team members, queues, and admin notifications." },
  "admin.write": { title: "Make admin changes", detail: "Assign coaches, send team invitations, post notifications." },
  "admin.delete": { title: "Destructive admin actions", detail: "Suspend tenants, remove coach roles. Owner-only." },
};

export default function McpAuthorize() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "ready" | "needs_auth" | "error" | "submitting" | "redirecting">("loading");
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<{ id: string; name: string; uri: string | null } | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [elevated, setElevated] = useState<"owner" | "admin" | null>(null);

  const req = useMemo(() => ({
    client_id: params.get("client_id") ?? "",
    redirect_uri: params.get("redirect_uri") ?? "",
    scope: params.get("scope") ?? "crm.read",
    state: params.get("state") ?? "",
    code_challenge: params.get("code_challenge") ?? "",
    code_challenge_method: params.get("code_challenge_method") ?? "S256",
  }), [params]);

  // Direct fetch with explicit headers — avoids supabase.functions.invoke quirks
  // ("Failed to send a request to the Edge Function" generic errors) and lets us
  // surface the actual server response body.
  const callConsent = async (action: "lookup" | "approve" | "deny", token: string | null) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-mcp-consent`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ action, ...req }),
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Network error reaching authorization service");
    }
    const text = await resp.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!resp.ok || parsed?.error) {
      const code = parsed?.error ?? `HTTP ${resp.status}`;
      throw new Error(typeof code === "string" ? code : JSON.stringify(code));
    }
    return parsed;
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const next = `/mcp/authorize?${params.toString()}`;
          sessionStorage.setItem("post_auth_redirect", next);
          setStatus("needs_auth");
          return;
        }
        const data = await callConsent("lookup", session.access_token);
        setClient(data.client);
        setScopes(data.scopes);
        setElevated(data.elevated ?? null);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, params]);

  const decide = async (action: "approve" | "deny") => {
    setStatus("submitting");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("needs_auth");
        return;
      }
      const data = await callConsent(action, session.access_token);
      if (!data?.redirect_url) throw new Error("Server did not return a redirect URL");
      setStatus("redirecting");
      window.location.href = data.redirect_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit decision");
      setStatus("error");
    }
  };

  if (status === "loading") {
    return <CenteredCard><Loader2 className="h-6 w-6 animate-spin" /></CenteredCard>;
  }
  if (status === "needs_auth") {
    return (
      <CenteredCard>
        <CardHeader><CardTitle>Sign in to continue</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">You need a Paige account to authorize this connection.</p>
          <Button className="w-full" onClick={() => navigate("/auth")}>Sign in</Button>
        </CardContent>
      </CenteredCard>
    );
  }
  if (status === "error") {
    return (
      <CenteredCard>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" /> Authorization failed</CardTitle>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{error}</p></CardContent>
      </CenteredCard>
    );
  }
  if (status === "redirecting") {
    return <CenteredCard><Loader2 className="h-6 w-6 animate-spin" /></CenteredCard>;
  }

  return (
    <CenteredCard>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Authorize MCP connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="text-lg font-semibold">{client?.name}</div>
          {client?.uri && <a href={client.uri} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">{client.uri}</a>}
          <p className="mt-2 text-sm text-muted-foreground">
            This application is requesting the following permissions on your Paige account.
          </p>
          {elevated && (
            <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
              {elevated === "owner"
                ? "Platform owner detected — full scope set granted, including destructive deletes."
                : "Admin detected — scopes auto-elevated to the full admin set. Destructive deletes remain owner-only."}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {scopes.map((s) => (
            <div key={s} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{SCOPE_LABELS[s]?.title ?? s}</div>
                <Badge variant="secondary" className="font-mono text-xs">{s}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{SCOPE_LABELS[s]?.detail}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" disabled={status === "submitting"} onClick={() => decide("deny")}>Deny</Button>
          <Button className="flex-1" disabled={status === "submitting"} onClick={() => decide("approve")}>
            {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Allow"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          You can revoke this connection any time from Admin → Settings → MCP Sessions.
        </p>
      </CardContent>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );
}
