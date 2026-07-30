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
 * (#141b) and generic SMTP (#141c) are BOTH real state-driven Connect/Disconnect
 * controls, each reading its own provider row (provider='gmail' | 'smtp') for honest
 * state — never a dead button (§13/§31). SMTP shows an inline host/port/username/
 * password/from form (A2PTab pattern) that invokes smtp-connect, then reloads state.
 */
import { useEffect, useState } from "react";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { EmailDomainsPanel } from "@/components/admin/EmailDomainsPanel";
import { TenantDomainIdentityCard } from "@/components/admin/TenantDomainIdentityCard";
import { resolveFunctionError } from "@/lib/integrations/connectError";
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

type SmtpConnector = {
  from_address: string | null;
  display_name: string | null;
};

// SMTP + OAuth failure copy now lives in the ONE shared home (§18):
// `resolveFunctionError` in @/lib/integrations/connectError — every connect/disconnect
// site on this page consumes it so a tenant never sees a raw framework code.

export default function EmailIntegrationConfig() {
  const [connector, setConnector] = useState<EmailConnector | null>(null);
  const [gmail, setGmail] = useState<GmailConnector | null>(null);
  const [smtp, setSmtp] = useState<SmtpConnector | null>(null);
  const [loading, setLoading] = useState(true);
  const [gmailBusy, setGmailBusy] = useState(false);
  // Honest inline note when the OAuth flow isn't switched on yet (§13/§31) — never a
  // silent failure behind the Connect button.
  const [gmailNote, setGmailNote] = useState<string | null>(null);

  // SMTP inline form (#141c) — the A2PTab Input+Label pattern. Password is type=password.
  const [smtpBusy, setSmtpBusy] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpError, setSmtpError] = useState<string | null>(null);

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

  const loadSmtp = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    // RLS scopes to the caller's tenant (§9). A live SMTP connector is provider='smtp'.
    const { data } = await sb
      .from("channel_connectors")
      .select("from_address, display_name")
      .eq("channel_type", "email")
      .eq("provider", "smtp")
      .eq("active", true)
      .eq("status", "active")
      .maybeSingle();
    setSmtp((data as SmtpConnector | null) ?? null);
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
      // Prefer the most recently updated live domain connector (Resend). The Gmail and SMTP
      // rows are read separately below so they drive their OWN cards, not the sending-domain
      // state — so exclude BOTH providers here (§18: one home each, no double-count).
      const { data } = await sb
        .from("channel_connectors")
        .select("from_address, inbound_domain, display_name")
        .eq("channel_type", "email")
        .or("provider.is.null,and(provider.neq.gmail,provider.neq.smtp)")
        .eq("active", true)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setConnector((data as EmailConnector | null) ?? null);
      await loadGmail();
      await loadSmtp();
      setLoading(false);
    })();
  }, []);

  const connected = Boolean(connector?.from_address);
  const gmailConnected = Boolean(gmail?.from_address);
  const smtpConnected = Boolean(smtp?.from_address);

  // §36: a non-technical coach clicks "Connect Gmail" and signs in — no prompt-engineering.
  // On {error:'gmail_oauth_not_configured'} we show an honest note, never a dead redirect.
  const connectGmail = async () => {
    setGmailBusy(true);
    setGmailNote(null);
    const { data, error } = await supabase.functions.invoke("gmail-oauth-start", {
      body: { origin: window.location.origin },
    });
    const url = (data as { authorization_url?: string } | null)?.authorization_url;
    if (error || !url) {
      setGmailBusy(false);
      const { code, message } = await resolveFunctionError({ error, data, action: "connect Gmail" });
      // Not switched on yet → an honest inline note, never a red error toast (§13/§36).
      if (code === "gmail_oauth_not_configured") {
        setGmailNote(message);
      } else {
        toast.error(message);
      }
      return;
    }
    window.location.href = url; // redirect to Google — busy stays true through navigation
  };

  const disconnectGmail = async () => {
    setGmailBusy(true);
    const { data, error } = await supabase.functions.invoke("gmail-disconnect", { body: {} });
    setGmailBusy(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error((await resolveFunctionError({ error, data, action: "disconnect Gmail" })).message);
      return;
    }
    toast.success("Gmail disconnected");
    setGmail(null);
    void loadGmail();
  };

  // #141c: a coach fills host/port/user/pass/from and it just connects (§36). smtp-connect
  // SSRF-guards + reachability-tests before provisioning; on failure we show an honest inline
  // message keyed to the returned code (§13/§31) — never a silent fail behind the button.
  const connectSmtp = async () => {
    setSmtpError(null);
    const portNum = Number(smtpPort);
    if (!smtpHost.trim() || !Number.isFinite(portNum) || !smtpUser || !smtpPass || !smtpFrom.trim()) {
      setSmtpError("Fill in the server, port, username, password, and from-address.");
      return;
    }
    setSmtpBusy(true);
    const { data, error } = await supabase.functions.invoke("smtp-connect", {
      body: {
        host: smtpHost.trim(),
        port: portNum,
        secure: portNum === 465,
        username: smtpUser,
        password: smtpPass,
        from_address: smtpFrom.trim(),
      },
    });
    setSmtpBusy(false);
    if (error || (data as { error?: string } | null)?.error) {
      setSmtpError((await resolveFunctionError({ error, data, action: "connect your SMTP server" })).message);
      return;
    }
    // §13 honest: connect proves the server is REACHABLE (TCP/TLS handshake), not that the
    // username/password authenticate — denomailer exposes no AUTH-only probe. So don't claim
    // "connected"; credentials are confirmed on the first real send.
    toast.success("SMTP saved — we'll confirm delivery on your first send.");
    // Clear the password from state the moment it's stored server-side; keep host/from for context.
    setSmtpPass("");
    void loadSmtp();
  };

  const disconnectSmtp = async () => {
    setSmtpBusy(true);
    const { data, error } = await supabase.functions.invoke("smtp-disconnect", { body: {} });
    setSmtpBusy(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error((await resolveFunctionError({ error, data, action: "disconnect SMTP" })).message);
      return;
    }
    toast.success("SMTP disconnected");
    setSmtp(null);
    setSmtpHost("");
    setSmtpUser("");
    setSmtpFrom("");
    setSmtpPort("587");
    void loadSmtp();
  };

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Mail}
        title="Email"
        description="Your Paige website and email are ready now. Connect your own domain or mailbox whenever you want."
        backHref="/admin/integrations"
      />

      <TenantDomainIdentityCard />

      {/* Live connection state — read straight from channel_connectors (§13). */}
      <SectionCard
        icon={Inbox}
        title="Email connection"
        description="Your included Paige email works immediately in Conversations. Custom domains and mailboxes are optional upgrades."
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
            You can start an outbound conversation now. If this is your included Paige address, no tenant DNS setup is required.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Paige is finishing the included email channel for this workspace. Refresh in a moment—custom domain setup is not required.
          </p>
        )}
      </SectionCard>

      {/* The domain-verify mechanism — REUSED, not rebuilt (§18). */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" /> Use your own email domain (optional)
          </h2>
          <p className="text-sm text-muted-foreground">
            Your included Paige address stays available out of the box. Add your own domain when you want
            branded sending; Paige will provide and verify the SPF, DKIM, and DMARC records.
          </p>
        </div>
        <EmailDomainsPanel />
      </section>

      {/* Additional connect methods — Gmail OAuth + bring-your-own SMTP. Real state, no dead buttons (§13). */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">More ways to connect</h2>
          <p className="text-sm text-muted-foreground">
            Prefer your existing mailbox? Connect Google or your own SMTP server — no DNS setup needed.
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

          {/* SMTP — bring your own mail server (#141c). Connected → Disconnect; else an inline form. */}
          <SectionCard
            icon={KeyRound}
            title="SMTP"
            description="Bring your own SMTP mail server."
            actions={
              loading ? (
                <Skeleton className="h-5 w-24 rounded-full" />
              ) : smtpConnected ? (
                <StatePill state="success">Connected</StatePill>
              ) : (
                <StatePill state="off">Not connected</StatePill>
              )
            }
          >
            {loading ? (
              <Skeleton className="h-4 w-64" />
            ) : smtpConnected ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Paige sends as{" "}
                  <span className="font-medium text-foreground">{smtp?.from_address}</span> through your
                  SMTP server. Your credentials are stored encrypted — never shown again. We confirm the
                  username and password on your first send.
                </p>
                <Button variant="outline" size="sm" onClick={() => void disconnectSmtp()} disabled={smtpBusy}>
                  {smtpBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Disconnect
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Point Paige at any SMTP host with your server, port, and login to send from an existing
                  mailbox — no DNS setup.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="smtp-host">SMTP server</Label>
                    <Input
                      id="smtp-host"
                      value={smtpHost}
                      placeholder="smtp.yourprovider.com"
                      autoComplete="off"
                      onChange={(e) => setSmtpHost(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      value={smtpPort}
                      inputMode="numeric"
                      placeholder="587"
                      onChange={(e) => setSmtpPort(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-from">From address</Label>
                    <Input
                      id="smtp-from"
                      value={smtpFrom}
                      type="email"
                      placeholder="you@yourdomain.com"
                      autoComplete="off"
                      onChange={(e) => setSmtpFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-user">Username</Label>
                    <Input
                      id="smtp-user"
                      value={smtpUser}
                      placeholder="you@yourdomain.com"
                      autoComplete="off"
                      onChange={(e) => setSmtpUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-pass">Password</Label>
                    <Input
                      id="smtp-pass"
                      value={smtpPass}
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      onChange={(e) => setSmtpPass(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use ports 465 (SSL), 587, 25, or 2525. Your login is stored encrypted and used only to
                  send on your behalf.
                </p>
                {smtpError && <p className="text-sm text-destructive">{smtpError}</p>}
                {/* GOLD — the one act on this card: connect the server (§11). */}
                <Button variant="gold" size="sm" onClick={() => void connectSmtp()} disabled={smtpBusy}>
                  {smtpBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  Connect SMTP
                </Button>
              </div>
            )}
          </SectionCard>
        </div>
      </section>
    </PageShell>
  );
}
