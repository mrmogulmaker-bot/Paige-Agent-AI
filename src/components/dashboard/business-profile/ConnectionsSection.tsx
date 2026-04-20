import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
  Sparkles,
  Building2,
  CreditCard,
  Globe,
  Mail,
  MessageSquare,
  ShoppingBag,
  Users2,
  FileSpreadsheet,
  Calendar,
  Briefcase,
  Receipt,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { QuickBooksConsentDialog } from "./QuickBooksConsentDialog";

interface Props {
  businessId?: string;
  userId: string;
}

type ConnStatus = "connected" | "available" | "coming_soon";

interface ConnectionCard {
  key: string;
  name: string;
  category: "Accounting & Finance" | "Banking & Payments" | "Public Presence" | "CRM & Marketing" | "Operations & Ops" | "Productivity";
  description: string;
  icon: React.ElementType;
  status: ConnStatus;
  badge?: string;
}

const COMING_SOON: Omit<ConnectionCard, "status">[] = [
  // Accounting & Finance
  { key: "xero", name: "Xero", category: "Accounting & Finance", description: "Alternative accounting platform sync", icon: Receipt },
  { key: "wave", name: "Wave", category: "Accounting & Finance", description: "Free accounting for small business", icon: Receipt },
  // Banking & Payments
  { key: "stripe", name: "Stripe", category: "Banking & Payments", description: "Payment processing and revenue intelligence", icon: CreditCard, badge: "Q2" },
  { key: "square", name: "Square", category: "Banking & Payments", description: "POS, payments, and merchant data", icon: CreditCard },
  { key: "paypal", name: "PayPal", category: "Banking & Payments", description: "Payment volume and merchant history", icon: Wallet },
  { key: "shopify", name: "Shopify", category: "Banking & Payments", description: "E-commerce revenue and order data", icon: ShoppingBag },
  // Public Presence
  { key: "google_business", name: "Google Business Profile", category: "Public Presence", description: "Verify NAP consistency and reviews", icon: Globe },
  { key: "yelp", name: "Yelp", category: "Public Presence", description: "Business listing and review monitoring", icon: Globe },
  { key: "facebook_business", name: "Facebook Business", category: "Public Presence", description: "Business page presence verification", icon: Globe },
  { key: "linkedin_company", name: "LinkedIn Company", category: "Public Presence", description: "Professional presence and credibility", icon: Briefcase },
  // CRM & Marketing
  { key: "hubspot", name: "HubSpot", category: "CRM & Marketing", description: "Pipeline, deals, and customer data", icon: Users2 },
  { key: "mailchimp", name: "Mailchimp", category: "CRM & Marketing", description: "Email marketing and audience reach", icon: Mail },
  { key: "salesforce", name: "Salesforce", category: "CRM & Marketing", description: "Enterprise CRM and revenue forecasting", icon: Users2 },
  // Operations
  { key: "gusto", name: "Gusto", category: "Operations & Ops", description: "Payroll and employee verification", icon: Users2 },
  { key: "adp", name: "ADP", category: "Operations & Ops", description: "Enterprise payroll and HR data", icon: Users2 },
  { key: "slack", name: "Slack", category: "Operations & Ops", description: "Team communications and alerts", icon: MessageSquare },
  // Productivity
  { key: "google_drive", name: "Google Drive", category: "Productivity", description: "Document storage and financial PDFs", icon: FileSpreadsheet },
  { key: "google_calendar", name: "Google Calendar", category: "Productivity", description: "Schedule funding milestones and reviews", icon: Calendar },
  { key: "microsoft_365", name: "Microsoft 365", category: "Productivity", description: "Outlook, OneDrive, and Excel sync", icon: FileSpreadsheet },
];

const CATEGORY_ORDER: ConnectionCard["category"][] = [
  "Accounting & Finance",
  "Banking & Payments",
  "Public Presence",
  "CRM & Marketing",
  "Operations & Ops",
  "Productivity",
];

export function ConnectionsSection({ businessId, userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [qbConnected, setQbConnected] = useState(false);
  const [qbCompanyName, setQbCompanyName] = useState<string | null>(null);
  const [qbLastSync, setQbLastSync] = useState<string | null>(null);
  const [plaidCount, setPlaidCount] = useState(0);
  const [consentOpen, setConsentOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchStatuses = async () => {
    setLoading(true);
    const [qbRes, plaidRes] = await Promise.all([
      supabase
        .from("quickbooks_connections")
        .select("qb_company_name, last_synced_at, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("connected_bank_accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_active", true),
    ]);

    if (qbRes.data) {
      setQbConnected(true);
      setQbCompanyName(qbRes.data.qb_company_name);
      setQbLastSync(qbRes.data.last_synced_at);
    } else {
      setQbConnected(false);
      setQbCompanyName(null);
      setQbLastSync(null);
    }
    setPlaidCount(plaidRes.count || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchStatuses();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast.success("QuickBooks connected!");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const qbErr = params.get("qb_error");
    if (qbErr) toast.error(`QuickBooks: ${qbErr}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleQBSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("quickbooks-sync-financials", { body: {} });
      if (error) throw error;
      toast.success("QuickBooks synced");
      await fetchStatuses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleQBDisconnect = async () => {
    if (!confirm("Disconnect QuickBooks? This will remove all synced financial data.")) return;
    try {
      const { error } = await supabase.functions.invoke("quickbooks-disconnect", { body: {} });
      if (error) throw error;
      toast.success("QuickBooks disconnected");
      await fetchStatuses();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const liveCards: ConnectionCard[] = [
    {
      key: "quickbooks",
      name: "QuickBooks Online",
      category: "Accounting & Finance",
      description: "Real-time financial data — revenue, margins, runway, expense intelligence",
      icon: Receipt,
      status: qbConnected ? "connected" : "available",
    },
    {
      key: "plaid",
      name: "Bank Accounts (Plaid)",
      category: "Banking & Payments",
      description: "Cashflow, balances, and funding signals via secure bank connections",
      icon: Building2,
      status: plaidCount > 0 ? "connected" : "available",
    },
  ];

  const allCards: ConnectionCard[] = [
    ...liveCards,
    ...COMING_SOON.map((c) => ({ ...c, status: "coming_soon" as ConnStatus })),
  ];

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    cards: allCards.filter((c) => c.category === cat),
  })).filter((g) => g.cards.length > 0);

  const connectedCount = allCards.filter((c) => c.status === "connected").length;
  const availableCount = allCards.filter((c) => c.status === "available").length;

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Plug className="w-5 h-5 text-primary" />
            <div>
              <div className="font-semibold text-foreground">App Connections</div>
              <div className="text-xs text-muted-foreground">
                Connect external apps so Paige can coach you with real data instead of estimates.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
              {connectedCount} connected
            </Badge>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {availableCount} ready to connect
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Grouped connection cards */}
      {grouped.map((group) => (
        <div key={group.category} className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">
            {group.category}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.cards.map((card) => {
              const Icon = card.icon;
              const isQB = card.key === "quickbooks";
              const isPlaid = card.key === "plaid";

              return (
                <Card
                  key={card.key}
                  className={`relative transition-all ${
                    card.status === "connected"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : card.status === "available"
                      ? "border-primary/30 hover:border-primary/60 hover:shadow-md"
                      : "border-border/50 opacity-70"
                  }`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-2 rounded-md ${
                            card.status === "connected"
                              ? "bg-emerald-500/15 text-emerald-600"
                              : card.status === "available"
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <CardTitle className="text-sm">{card.name}</CardTitle>
                      </div>
                      {card.status === "connected" && (
                        <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Connected
                        </Badge>
                      )}
                      {card.status === "coming_soon" && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Sparkles className="w-3 h-3" /> {card.badge || "Coming soon"}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs leading-snug pt-1">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    {/* QuickBooks actions */}
                    {isQB && card.status === "connected" && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {qbCompanyName || "Connected"}
                          {qbLastSync && (
                            <> · Last sync {new Date(qbLastSync).toLocaleDateString()}</>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={handleQBSync} disabled={syncing} className="h-7 text-xs">
                            {syncing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                            Sync
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleQBDisconnect} className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    )}
                    {isQB && card.status === "available" && (
                      <Button
                        size="sm"
                        onClick={() => setConsentOpen(true)}
                        className="w-full h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Connect QuickBooks
                      </Button>
                    )}

                    {/* Plaid actions */}
                    {isPlaid && card.status === "connected" && (
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {plaidCount} account{plaidCount === 1 ? "" : "s"} linked
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => (window.location.href = "/app/business")}
                          className="w-full h-7 text-xs"
                        >
                          Manage in Bank Accounts
                        </Button>
                      </div>
                    )}
                    {isPlaid && card.status === "available" && (
                      <Button
                        size="sm"
                        onClick={() => (window.location.href = "/app/business")}
                        className="w-full h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Connect Bank Account
                      </Button>
                    )}

                    {/* Coming soon */}
                    {card.status === "coming_soon" && (
                      <Button size="sm" variant="outline" disabled className="w-full h-8 text-xs">
                        Coming soon
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer note */}
      <Card className="border-dashed">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          More integrations on the way. Have a tool you need? Tell Paige in chat and we will prioritize it.
        </CardContent>
      </Card>

      <QuickBooksConsentDialog open={consentOpen} onOpenChange={setConsentOpen} businessId={businessId} />
    </div>
  );
}
