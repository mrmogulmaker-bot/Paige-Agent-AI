/**
 * Email connect home (#141a) — the ONE place a tenant connects email so Paige can
 * send and receive from the unified inbox. Reachable from the integrations hub's
 * new "Email" tile and from every Conversations "Connect a channel" CTA (#518).
 *
 * §18: it does NOT rebuild domain verification — it REUSES <EmailDomainsPanel/>
 * (the live SPF/DKIM/DMARC verify surface backed by manage-tenant-domain). When a
 * domain is verified, the provision-on-verify DB trigger stands up the active
 * email channel_connectors row; this page reads that row to show real connection
 * state (§13 honest — never a faked "Connected").
 *
 * §11: compact PageHeader variant="plain" (no hero on a working surface), built on
 * the shared primitive layer (PageShell + SectionCard + StatePill). Gmail OAuth
 * (#141b) and SMTP (#141c) appear as honest "coming soon" cards — no dead connect
 * buttons — modeled on CalendarConnectorsPanel's Apple card.
 */
import { useEffect, useState } from "react";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { EmailDomainsPanel } from "@/components/admin/EmailDomainsPanel";
import { Mail, Inbox, KeyRound } from "lucide-react";

type EmailConnector = {
  from_address: string | null;
  inbound_domain: string | null;
  display_name: string | null;
};

export default function EmailIntegrationConfig() {
  const [connector, setConnector] = useState<EmailConnector | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      // RLS scopes this to the caller's tenant (§9) — no tenant_id in the query.
      // channel_connectors isn't in the generated types yet (same as in
      // ClientsConversations), so route through the `any` client used across the
      // Conversations surface; the row is re-typed on assignment below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      // Prefer the most recently updated live connector.
      const { data } = await sb
        .from("channel_connectors")
        .select("from_address, inbound_domain, display_name")
        .eq("channel_type", "email")
        .eq("active", true)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setConnector((data as EmailConnector | null) ?? null);
      setLoading(false);
    })();
  }, []);

  const connected = Boolean(connector?.from_address);

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Mail}
        title="Email"
        description="Connect a sending domain so Paige can send and receive email from your unified inbox — under your own brand."
        backHref="/admin/integrations"
      />

      {/* Live connection state — read straight from channel_connectors (§13). */}
      <SectionCard
        icon={Inbox}
        title="Email connection"
        description="Your inbox goes live for sending the moment a domain below is verified."
        actions={
          loading ? (
            <Skeleton className="h-5 w-40 rounded-full" />
          ) : connected ? (
            <StatePill state="success">Connected</StatePill>
          ) : (
            <StatePill state="off">Not connected</StatePill>
          )
        }
      >
        {loading ? (
          <Skeleton className="h-4 w-72" />
        ) : connected ? (
          <p className="text-sm text-muted-foreground">
            Paige sends as <span className="font-medium text-foreground">{connector?.from_address}</span>.
            Replies from your clients land in the inbox once your domain's mail routing (MX / inbound) is
            pointed at Paige — sending is live now; inbound receipt turns on once that routing is set.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            No verified sending domain yet. Add and verify your domain below — as soon as it verifies,
            your inbox can send and Paige composes on your behalf.
          </p>
        )}
      </SectionCard>

      {/* The domain-verify mechanism — REUSED, not rebuilt (§18). */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" /> Sending domain
          </h2>
          <p className="text-sm text-muted-foreground">
            Verify SPF, DKIM, and DMARC for your domain so email sends land from your brand and stay out
            of spam. Verifying a domain connects your inbox automatically.
          </p>
        </div>
        <EmailDomainsPanel />
      </section>

      {/* Honest upcoming connect methods — no dead buttons (§13). */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">More ways to connect</h2>
          <p className="text-sm text-muted-foreground">
            Additional email connect methods on the way — verify a domain above to go live today.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard
            icon={Mail}
            title="Gmail / Google Workspace"
            description="Connect your Google inbox with OAuth."
            actions={<StatePill state="pending">Coming soon</StatePill>}
          >
            <p className="text-sm text-muted-foreground">
              Sign in with Google to send and receive from your existing Gmail or Workspace address — no
              DNS setup. We're wiring the OAuth flow next.
            </p>
          </SectionCard>

          <SectionCard
            icon={KeyRound}
            title="SMTP"
            description="Bring your own SMTP mail server."
            actions={<StatePill state="pending">Coming soon</StatePill>}
          >
            <p className="text-sm text-muted-foreground">
              Point Paige at any SMTP host with your server, port, and credentials to send from an
              existing mailbox. This connect method is on the roadmap.
            </p>
          </SectionCard>
        </div>
      </section>
    </PageShell>
  );
}
