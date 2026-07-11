import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard, StatePill } from "@/components/ui/page";
import type { PillState } from "@/components/ui/page";
import { supabase } from "@/integrations/supabase/client";
import {
  Workflow, CreditCard, MessageSquare, Send, Zap, Search, Activity,
  ExternalLink, FileSignature, CalendarClock, BarChart3, Bug, Share2, UserSearch,
  Building2, ShieldCheck, Landmark, Plug,
} from "lucide-react";


type ConfigShape = {
  ghl_pit_ref: string | null;
  ghl_location_id: string | null;
  gmail_default_sender: string | null;
  langsmith_project: string | null;
  posthog_project_url: string | null;
  sentry_org_slug: string | null;
  meta_default_page_id: string | null;
  cal_default_event_type_id: string | null;
  apollo_auto_enrich: boolean | null;
  docusign_templates: Record<string, string> | null;
};

type Counts = {
  n8n: number;
  mcp: number;
  telegramConfigured: boolean;
  recentSubscriptionEvents: number;
  envelopes: number;
  bookings: number;
  socialPosts: number;
  enrichments: number;
};

const tiles = [
  { key: "n8n", icon: Workflow, title: "n8n Workflows", description: "Connect your n8n so Paige can run, monitor, and build automations across your tools.", href: "/admin/integrations/n8n" },
  { key: "stripe", icon: CreditCard, title: "Stripe Revenue", description: "Live subscription events, MRR delta and churn alerts.", href: "/admin/integrations/subscriptions" },
  { key: "zapier", icon: Zap, title: "Zapier MCP", description: "Expose thousands of apps to Paige via the MCP client.", href: "/admin/integrations/zapier" },
  { key: "telegram", icon: Send, title: "Telegram Alerts", description: "Bot channel for admin alerts and overdue approvals.", href: "/admin/integrations/telegram" },
  { key: "gmail", icon: MessageSquare, title: "Gmail (Founder Inbox)", description: "Deliverability-sensitive sends via OAuth.", href: "/admin/integrations/gmail" },
  { key: "firecrawl", icon: Search, title: "Firecrawl Web Search", description: "Live web research and site crawling.", href: "/admin/integrations" },
  { key: "langsmith", icon: Activity, title: "AI Activity (LangSmith)", description: "Recent traces, cost and latency for all AI calls.", href: "/admin/integrations/ai-activity" },
  { key: "docusign", icon: FileSignature, title: "DocuSign", description: "VIP apps, coach agreements, DFY engagement letters, term sheets.", href: "/admin/integrations/docusign" },
  { key: "cal", icon: CalendarClock, title: "Cal.com", description: "Booking surface for VIP intros, DFY discovery and workshops.", href: "/admin/integrations/cal" },
  { key: "meta_pixel", icon: Share2, title: "Meta Pixel + Conversions API", description: "Track ad conversions on Paige + external landing/webinar pages.", href: "/admin/integrations/meta-pixel" },
  { key: "meta", icon: Share2, title: "Meta Graph (FB + IG, inbound)", description: "Inbound comments → CS Triage. Scheduling disabled by default.", href: "/admin/integrations/meta" },
  { key: "apollo", icon: UserSearch, title: "Apollo Enrichment", description: "Auto-enrich new contacts; manual lookup; prospect search.", href: "/admin/integrations/apollo" },
  { key: "posthog", icon: BarChart3, title: "PostHog Analytics", description: "Product usage truth for internal + B2B rollout.", href: "/admin/observability/usage" },
  { key: "sentry", icon: Bug, title: "Sentry Errors", description: "Frontend + Edge Function error tracking with deep links.", href: "/admin/observability/errors" },
  { key: "nav", icon: Building2, title: "Nav (Business Credit)", description: "Pull D&B / Experian / Equifax business profiles for capital readiness.", href: "/admin/integrations/nav" },
  { key: "smartcredit", icon: ShieldCheck, title: "SmartCredit (Owner Lens)", description: "Owner credit standing — funding eligibility lens only. No dispute work.", href: "/admin/integrations/smartcredit" },
  { key: "plaid", icon: Landmark, title: "Plaid (Banking)", description: "Cash flow signals. Connect to go live.", href: "/admin/integrations/plaid" },
] as const;


export default function IntegrationsHub({ embedded = false }: { embedded?: boolean } = {}) {
  const [config, setConfig] = useState<ConfigShape | null>(null);
  const [counts, setCounts] = useState<Counts>({
    n8n: 0, mcp: 0, telegramConfigured: false, recentSubscriptionEvents: 0,
    envelopes: 0, bookings: 0, socialPosts: 0, enrichments: 0,
  });

  useEffect(() => {
    void (async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [cfg, n8n, mcp, tg, sub, env, bkg, soc, enr] = await Promise.all([
        supabase.from("paige_config").select("ghl_pit_ref, ghl_location_id, gmail_default_sender, langsmith_project, posthog_project_url, sentry_org_slug, meta_default_page_id, cal_default_event_type_id, apollo_auto_enrich, docusign_templates").eq("id", 1).maybeSingle(),
        (supabase as any).rpc("get_tenant_n8n_connection"),
        supabase.from("paige_mcp_connections").select("id", { count: "exact", head: true }).eq("enabled", true),
        supabase.from("paige_telegram_config").select("default_admin_chat_id").eq("id", 1).maybeSingle(),
        supabase.from("paige_subscription_events").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("paige_signature_envelopes").select("id", { count: "exact", head: true }),
        supabase.from("paige_bookings").select("id", { count: "exact", head: true }).gte("scheduled_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
        supabase.from("paige_social_posts").select("id", { count: "exact", head: true }),
        supabase.from("paige_enrichment_log").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);
      setConfig(cfg.data as ConfigShape | null);
      setCounts({
        n8n: (n8n as any)?.data?.configured ? 1 : 0,
        mcp: mcp.count ?? 0,
        telegramConfigured: Boolean(tg.data?.default_admin_chat_id),
        recentSubscriptionEvents: sub.count ?? 0,
        envelopes: env.count ?? 0,
        bookings: bkg.count ?? 0,
        socialPosts: soc.count ?? 0,
        enrichments: enr.count ?? 0,
      });
    })();
  }, []);

  const hasSentryDsn = Boolean(import.meta.env.VITE_SENTRY_DSN);
  const hasPosthogKey = Boolean(import.meta.env.VITE_POSTHOG_KEY);

  const statusFor = (key: string): { state: PillState; label: string } => {
    switch (key) {
      case "n8n": return counts.n8n > 0 ? { state: "success", label: "Connected" } : { state: "off", label: "Not configured" };
      case "stripe": return counts.recentSubscriptionEvents > 0 ? { state: "success", label: `${counts.recentSubscriptionEvents} events (7d)` } : { state: "off", label: "Awaiting events" };
      case "ghl": return config?.ghl_location_id ? { state: "success", label: "Connected" } : { state: "off", label: "Not configured" };
      case "zapier": return counts.mcp > 0 ? { state: "success", label: `${counts.mcp} active` } : { state: "off", label: "Not configured" };
      case "telegram": return counts.telegramConfigured ? { state: "success", label: "Active" } : { state: "off", label: "Not configured" };
      case "gmail": return config?.gmail_default_sender ? { state: "success", label: config.gmail_default_sender } : { state: "off", label: "Not connected" };
      case "firecrawl": return { state: "success", label: "Active" };
      case "langsmith": return config?.langsmith_project ? { state: "success", label: config.langsmith_project } : { state: "off", label: "Disabled" };
      case "docusign": return counts.envelopes > 0 ? { state: "success", label: `${counts.envelopes} envelope${counts.envelopes === 1 ? "" : "s"}` } : { state: "off", label: "Not configured" };
      case "cal": return counts.bookings > 0 ? { state: "success", label: `${counts.bookings} bookings (30d)` } : { state: "off", label: "Not configured" };
      case "meta": return config?.meta_default_page_id ? { state: "success", label: "Connected" } : { state: "off", label: "Not configured" };
      case "apollo": return config?.apollo_auto_enrich ? { state: "success", label: `Auto-enrich on • ${counts.enrichments} (7d)` } : { state: "off", label: "Auto-enrich off" };
      case "posthog": return hasPosthogKey ? { state: "success", label: "Connected" } : { state: "off", label: "Disabled" };
      case "sentry": return hasSentryDsn ? { state: "success", label: "Connected" } : { state: "off", label: "Disabled" };
      default: return { state: "off", label: "Unknown" };
    }
  };

  const grid = (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const status = statusFor(tile.key);
        return (
          <SectionCard
            key={tile.key}
            interactive
            icon={tile.icon}
            title={tile.title}
            description={tile.description}
            actions={<StatePill state={status.state}>{status.label}</StatePill>}
          >
            <Button asChild size="sm" variant="outline" className="gap-1">
              <Link to={tile.href}>Manage <ExternalLink className="size-3" /></Link>
            </Button>
          </SectionCard>
        );
      })}
    </div>
  );

  // Embedded inside the Settings → Integrations tab: skip the shell + hero so it
  // doesn't render a second masthead under the Settings page's own hero.
  if (embedded) return grid;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Connector Layer"
        icon={Plug}
        title="Integrations"
        description="Every tool Paige can reach — the wiring that lets her act across your stack. Admin only."
      />
      {grid}
    </PageShell>
  );
}
