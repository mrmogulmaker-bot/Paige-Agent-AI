import { useEffect, useState } from "react";
import { Copy, Globe2, Mail, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export type TenantDomainIdentity = {
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  default_web_hostname: string;
  default_web_url: string;
  default_portal_path: string;
  default_email_domain: string;
  default_email_sender: string;
  default_email_reply_to: string | null;
  default_email_kind: string;
  default_email_source: string;
  default_email_status: string;
};

export function TenantDomainIdentityCard() {
  const [identity, setIdentity] = useState<TenantDomainIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The RPC derives the authenticated caller's tenant server-side (§9).
      // It is the single identity seam used by Paige, MCP, and this surface (§18).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("resolve_tenant_domain_identity");
      if (cancelled) return;
      if (error) setLoadError(true);
      else {
        const row = Array.isArray(data) ? data[0] : data;
        setIdentity((row as TenantDomainIdentity | null) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };
  const outboundReady = Boolean(identity && ["verified", "outbound_ready"].includes(identity.default_email_status));

  return (
    <SectionCard
      icon={Globe2}
      title="Included website and email"
      description="Every workspace receives both addresses. Your own domains remain optional."
      actions={
        loading ? <Skeleton className="h-5 w-24 rounded-full" />
        : loadError ? <StatePill state="error">Action needed</StatePill>
        : outboundReady ? <StatePill state="success">Ready to send</StatePill>
        : <StatePill state="pending">Finishing setup</StatePill>
      }
    >
      {loading ? <Skeleton className="h-20 rounded-xl" /> : identity ? (
        <div className="divide-y divide-border/60 rounded-xl border border-border/70">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">Website reserved</p>
              <p className="truncate text-sm font-medium text-foreground">{identity.default_web_hostname}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void copy(identity.default_web_hostname, "Website address")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">{outboundReady ? "Email ready for outbound Conversations" : "Email reserved — activation in progress"}</p>
              <p className="truncate text-sm font-medium text-foreground">{identity.default_email_sender}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void copy(identity.default_email_sender, "Email address")}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
            {outboundReady ? (
              <Button asChild variant="gold" size="sm">
                <Link to="/admin/clients-hub/conversations?compose=1">
                  <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Message a client
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Activating
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {loadError ? "Paige couldn’t read this workspace’s address status. Refresh or try again shortly." : "Paige is reserving this workspace’s included addresses."}
        </p>
      )}
    </SectionCard>
  );
}
