import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Landmark,
  CreditCard,
  TrendingUp,
  Receipt,
  Calculator,
  Banknote,
  ShieldCheck,
} from "lucide-react";

type Status = "live" | "beta" | "coming-soon";

const integrations: Array<{
  name: string;
  description: string;
  icon: typeof Building2;
  status: Status;
  category: string;
}> = [
  {
    name: "Plaid",
    description: "Securely connect bank accounts for cash-flow & funding signals",
    icon: Landmark,
    status: "live",
    category: "Banking",
  },
  {
    name: "Stripe",
    description: "Revenue tracking & subscription billing for fundability",
    icon: CreditCard,
    status: "live",
    category: "Payments",
  },
  {
    name: "Experian Business",
    description: "Live business credit score and Intelliscore monitoring",
    icon: TrendingUp,
    status: "beta",
    category: "Business Credit",
  },
  {
    name: "D&B / PAYDEX",
    description: "DUNS verification and PAYDEX payment-history sync",
    icon: ShieldCheck,
    status: "beta",
    category: "Business Credit",
  },
  {
    name: "QuickBooks",
    description: "Pull P&L, balance sheet, and revenue trends automatically",
    icon: Calculator,
    status: "coming-soon",
    category: "Accounting",
  },
  {
    name: "Xero",
    description: "Sync books for lender-ready financial documentation",
    icon: Receipt,
    status: "coming-soon",
    category: "Accounting",
  },
  {
    name: "Nav",
    description: "Aggregate personal + business credit in one view",
    icon: Building2,
    status: "coming-soon",
    category: "Credit Monitoring",
  },
  {
    name: "Lendflow",
    description: "Embedded funding marketplace with real lender approvals",
    icon: Banknote,
    status: "coming-soon",
    category: "Funding",
  },
];

const statusStyles: Record<Status, { label: string; className: string }> = {
  live: {
    label: "Live",
    className:
      "bg-fundability-excellent/15 text-fundability-excellent border-fundability-excellent/30",
  },
  beta: {
    label: "Beta",
    className: "bg-accent/15 text-accent border-accent/30",
  },
  "coming-soon": {
    label: "Coming Soon",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function IntegrationsSection() {
  return (
    <section id="integrations" className="py-20 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Badge className="mb-4 bg-gold/10 text-gold-dark border-gold/20">
            Integrations
          </Badge>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4">
            Connects To Your{" "}
            <span className="text-gold font-extrabold">Whole Stack</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Paige plugs into the financial tools that actually move funding
            decisions — not chat apps. Banking, accounting, and the bureaus that
            lenders read.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {integrations.map((integration, i) => {
            const Icon = integration.icon;
            const status = statusStyles[integration.status];
            return (
              <Card
                key={i}
                className="p-6 bg-card border-border hover:border-gold/50 hover:shadow-glow transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
                <h3 className="font-bold text-base mb-1">{integration.name}</h3>
                <p className="text-xs text-accent font-medium mb-2">
                  {integration.category}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {integration.description}
                </p>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-2xl mx-auto">
          Need something custom? Pro and Enterprise plans include webhook +
          Zapier/n8n access for any tool in your workflow.
        </p>
      </div>
    </section>
  );
}
