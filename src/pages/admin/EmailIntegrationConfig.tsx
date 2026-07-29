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
 * (#141b) is now a REAL state-driven Connect/Disconnect control (reads a provider='gmail'
 * channel_connectors row for honest state; on gmail_oauth_not_configured it shows an
 * honest inline note, never a dead button — §13/§31). SMTP (#141c) remains an honest
 * "coming soon" card — modeled on CalendarConnectorsPanel's Apple card.
 */
import { useEffect, useState } from "react";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { EmailDomainsPanel } from "@/components/admin/EmailDomainsPanel";
import { toast } from "sonner";
import { Mail, Inbox, KeyRound, Loader2, Link as LinkIcon, Unlink } from "lucide-react";

type EmailConnector = {
  from_address: string | null;
  inbound_domain: string | null;
  display_name: string | null;
};

type GmailConnector = {
  from_address: string | null;
  display_name: string | null;
};

export default function EmailIntegrationConfig() {
  const [connector, setConnector] = useState<EmailConnector | null>(null);
  const [gmail, setGmail] = useState<GmailConnector | null>(null);
  const [loading, setLoading] = useState(true);
  const [gmailBusy, setGmailBusy] = useState(false);
  // Honest inline note when the OAuth flow isn't switched on yet (§13/§31) — never a
  // silent failure behind the Connect button.
  const [gmailNote, setGmailNote] = useState<string | null>(null);

  const loadGmail = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    // RLS scopes to the caller's tenant (§9). A live Gmail connector is provider='gmail'.
    const { data } = await sb
      .from("channel_connectors")
      .select("from_address, display_name")
      .eq("channel_type", "email")
      .eq("provider", "gmail")
      .eq("active", true)
      .eq("status", "active")
      .maybeSingle();
    setGmail((data as GmailConnector | null) ?? null);
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      // RLS scopes this to the caller's tenant (§9) — no tenant_id in the query.
      // channel_connectors isn't in the generated types yet (same as in
      // ClientsConversations), so route through the `any` client used across the
      // Conversations surface; the row is re-typed on assignment below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      // Prefer the most recently updated live domain connector (Resend). A Gmail row is
      // read separately below so it drives its own card, not the sending-domain state.
      const { data } = await sb
        .from("channel_connectors")
        .select("from_address, inbound_domain, display_name")
        .eq("channel_type", "email")
        .or("provider.is.null,provider.neq.gmail")
        .eq("active", true)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setConnector((data as EmailConnector | null) ?? null);
      await loadGmail();
      setLoading(false);
    })();
  }, []);

  const connected = Boolean(connector?.from_address);
  const gmailConnected = Boolean(gmail?.from_address);

  // §36: a non-technical coach clicks "Connect Gmail" and signs in — no prompt-engineering.
  // On {error:'gmail_oauth_not_configured'} we show an honest note, never a dead redirect.
  const connectGmail = async () => {
    setGmailBusy(true);
    setGmailNote(null);
    const { data, error } = await supabase.functions.invoke("gmail-oauth-start", {
      body: { origin: window.location.origin },
    });
    const errCode = (data as { error?: string } | null)?.error;
    const url = (data as { authorization_url?: string } | null)?.authorization_url;
    if (errCode === "gmail_oauth_not_configured") {
      setGmailBusy(false);
      setGmailNote("Gmail connect is being wired — the Google sign-in isn't switched on yet. Verify a sending domain above to go live today; we'll enable Gmail shortly.");
      return;
    }
    if (error || !url) {
      setGmailBusy(false);
      toast.error(errCode ?? error?.message ?? "Could not start Gmail connect");
      return;
    }
    window.location.href = url; // redirect to Google — busy stays true through navigation
  };

  const disconnectGmail = async () => {
    setGmailBusy(true);
    const { data, error } = await supabase.functions.invoke("gmail-disconnect", { body: {} });
    setGmailBusy(false);
    const errCode = (data as { error?: string } | null)?.error;
    if (error || errCode) {
      toast.error(errCode ?? error?.message ?? "Could not disconnect Gmail");
      return;
    }
    toast.success("Gmail disconnected");
    setGmail(null);
    void loadGmail();
  };

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
            actions={
              loading ? (
                <Skeleton className="h-5 w-24 rounded-full" />
              ) : gmailConnected ? (
                <StatePill state="success">Connected</StatePill>
              ) : (
                <StatePill state="off">Not connected</StatePill>
              )
            }
          >
            {loading ? (
              <Skeleton className="h-4 w-64" />
            ) : gmailConnected ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Paige sends as{" "}
                  <span className="font-medium text-foreground">{gmail?.from_address}</span> through your
                  Google account — no DNS setup needed.
                </p>
                <Button variant="outline" size="sm" onClick={() => void disconnectGmail()} disabled={gmailBusy}>
                  {gmailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Sign in with Google to send from your existing Gmail or Workspace address — no DNS setup.
                </p>
                <Button variant="gold" size="sm" onClick={() => void connectGmail()} disabled={gmailBusy}>
                  {gmailBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  Connect Gmail
                </Button>
                {gmailNote && (
                  <p className="text-sm text-[hsl(var(--warning))]">{gmailNote}</p>
                )}
              </div>
            )}
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
