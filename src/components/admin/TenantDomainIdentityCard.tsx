import { useEffect, useState } from "react";
import { Globe2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, StatePill } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

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
      if (error) {
        setLoadError(true);
        setIdentity(null);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setIdentity((row as TenantDomainIdentity | null) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SectionCard
      icon={Globe2}
      title="Your included addresses"
      description="Paige gives every workspace a website and an email address immediately. Your own domains are optional."
      actions={loading ? <Skeleton className="h-5 w-20 rounded-full" /> : loadError ? <StatePill state="error">Needs attention</StatePill> : identity && ["verified", "outbound_ready"].includes(identity.default_email_status) ? <StatePill state="success">Ready to send</StatePill> : <StatePill state="pending">Reserved</StatePill>}
    >
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : identity ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Globe2 className="h-3.5 w-3.5" /> Website
              </div>
              <p className="truncate font-medium text-foreground">{identity.default_web_hostname}</p>
              <p className="mt-1 text-xs text-muted-foreground">Reserved for this workspace. Paige will mark it live after wildcard routing is activated.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> Email
            </div>
            <p className="truncate font-medium text-foreground">{identity.default_email_sender}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {identity.default_email_status === "verified"
                ? "Your verified custom sender is active in Conversations."
                : identity.default_email_status === "outbound_ready"
                  ? "Your included Paige sender is active for outbound Conversations."
                  : "Your address is reserved while Paige finishes activating the sending channel."}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{loadError ? "Paige couldn’t read this workspace’s domain status. Try again or open Email setup." : "Paige is reserving this workspace’s website and email identity."}</p>
      )}
    </SectionCard>
  );
}
