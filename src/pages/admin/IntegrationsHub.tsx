import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Workflow, CreditCard, Mail, MessageSquare, Send, Zap, Search, Activity, ExternalLink,
} from "lucide-react";

type ConfigShape = {
  ghl_pit_ref: string | null;
  ghl_location_id: string | null;
  gmail_default_sender: string | null;
  langsmith_project: string | null;
};

type Counts = {
  n8n: number;
  mcp: number;
  telegramConfigured: boolean;
  recentSubscriptionEvents: number;
};

const tiles = [
  {
    key: "n8n",
    icon: Workflow,
    title: "n8n Workflows",
    description: "Sync workflow inventory, trigger by ID, view recent executions.",
    href: "/admin/integrations/n8n",
  },
  {
    key: "stripe",
    icon: CreditCard,
    title: "Stripe Revenue",
    description: "Live subscription events, MRR delta and churn alerts.",
    href: "/admin/integrations/subscriptions",
  },
  {
    key: "ghl",
    icon: Mail,
    title: "GoHighLevel Pipe",
    description: "Read legacy contacts. Email + SMS fallback for send-message.",
    href: "/admin/integrations/ghl",
  },
  {
    key: "zapier",
    icon: Zap,
    title: "Zapier MCP",
    description: "Expose thousands of apps to Paige via the MCP client.",
    href: "/admin/integrations/zapier",
  },
  {
    key: "telegram",
    icon: Send,
    title: "Telegram Alerts",
    description: "Bot channel for admin alerts and overdue approvals.",
    href: "/admin/integrations/telegram",
  },
  {
    key: "gmail",
    icon: MessageSquare,
    title: "Gmail (Founder Inbox)",
    description: "Deliverability-sensitive sends via OAuth.",
    href: "/admin/integrations/gmail",
  },
  {
    key: "tavily",
    icon: Search,
    title: "Tavily Web Search",
    description: "Web research for Paige's reasoning.",
    href: "/admin/integrations/tavily",
  },
  {
    key: "langsmith",
    icon: Activity,
    title: "AI Activity (LangSmith)",
    description: "Recent traces, cost and latency for all AI calls.",
    href: "/admin/integrations/ai-activity",
  },
] as const;

export default function IntegrationsHub() {
  const [config, setConfig] = useState<ConfigShape | null>(null);
  const [counts, setCounts] = useState<Counts>({ n8n: 0, mcp: 0, telegramConfigured: false, recentSubscriptionEvents: 0 });

  useEffect(() => {
    void (async () => {
      const [cfg, n8n, mcp, tg, sub] = await Promise.all([
        supabase.from("paige_config").select("ghl_pit_ref, ghl_location_id, gmail_default_sender, langsmith_project").eq("id", 1).maybeSingle(),
        supabase.from("paige_n8n_connections").select("id", { count: "exact", head: true }),
        supabase.from("paige_mcp_connections").select("id", { count: "exact", head: true }).eq("enabled", true),
        supabase.from("paige_telegram_config").select("default_admin_chat_id").eq("id", 1).maybeSingle(),
        supabase.from("paige_subscription_events").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
      ]);
      setConfig(cfg.data as ConfigShape | null);
      setCounts({
        n8n: n8n.count ?? 0,
        mcp: mcp.count ?? 0,
        telegramConfigured: Boolean(tg.data?.default_admin_chat_id),
        recentSubscriptionEvents: sub.count ?? 0,
      });
    })();
  }, []);

  const statusFor = (key: string) => {
    switch (key) {
      case "n8n": return counts.n8n > 0 ? { tone: "default" as const, label: `${counts.n8n} connection${counts.n8n === 1 ? "" : "s"}` } : { tone: "secondary" as const, label: "Not configured" };
      case "stripe": return counts.recentSubscriptionEvents > 0 ? { tone: "default" as const, label: `${counts.recentSubscriptionEvents} events (7d)` } : { tone: "secondary" as const, label: "Awaiting events" };
      case "ghl": return config?.ghl_location_id ? { tone: "default" as const, label: "Connected" } : { tone: "secondary" as const, label: "Not configured" };
      case "zapier": return counts.mcp > 0 ? { tone: "default" as const, label: `${counts.mcp} active` } : { tone: "secondary" as const, label: "Not configured" };
      case "telegram": return counts.telegramConfigured ? { tone: "default" as const, label: "Active" } : { tone: "secondary" as const, label: "Not configured" };
      case "gmail": return config?.gmail_default_sender ? { tone: "default" as const, label: config.gmail_default_sender } : { tone: "secondary" as const, label: "Not connected" };
      case "tavily": return { tone: "outline" as const, label: "Env-managed" };
      case "langsmith": return config?.langsmith_project ? { tone: "default" as const, label: config.langsmith_project } : { tone: "secondary" as const, label: "Disabled" };
      default: return { tone: "secondary" as const, label: "Unknown" };
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Paige's connector layer — the central nervous system for MMA. Restricted to admins.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const status = statusFor(tile.key);
          return (
            <Card key={tile.key} className="group hover:border-primary/40 transition-colors">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-muted p-2"><Icon className="size-4" /></div>
                  <CardTitle className="text-base">{tile.title}</CardTitle>
                </div>
                <Badge variant={status.tone}>{status.label}</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription>{tile.description}</CardDescription>
                <Button asChild size="sm" variant="outline" className="gap-1">
                  <Link to={tile.href}>Manage <ExternalLink className="size-3" /></Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
