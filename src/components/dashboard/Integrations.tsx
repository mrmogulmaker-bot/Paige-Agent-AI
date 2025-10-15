import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plug, CheckCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: "accounting" | "banking" | "credit" | "payroll";
  connected: boolean;
  logo?: string;
}

const integrations: Integration[] = [
  {
    id: "quickbooks",
    name: "QuickBooks",
    description: "Sync your accounting data and track business expenses automatically",
    category: "accounting",
    connected: false,
  },
  {
    id: "plaid",
    name: "Plaid",
    description: "Connect your bank accounts securely for credit building",
    category: "banking",
    connected: false,
  },
  {
    id: "experian-business",
    name: "Experian Business",
    description: "Monitor your business credit score and reports",
    category: "credit",
    connected: false,
  },
  {
    id: "nav",
    name: "Nav",
    description: "Track business and personal credit scores in one place",
    category: "credit",
    connected: false,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Connect your payment processing for revenue tracking",
    category: "accounting",
    connected: false,
  },
  {
    id: "freshbooks",
    name: "FreshBooks",
    description: "Manage invoices and track business finances",
    category: "accounting",
    connected: false,
  },
  {
    id: "xero",
    name: "Xero",
    description: "Beautiful accounting software for small businesses",
    category: "accounting",
    connected: false,
  },
  {
    id: "gusto",
    name: "Gusto",
    description: "Streamline payroll and employee benefits",
    category: "payroll",
    connected: false,
  },
];

const categoryColors: Record<string, string> = {
  accounting: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  banking: "bg-green-500/10 text-green-500 border-green-500/20",
  credit: "bg-gold/10 text-gold border-gold/20",
  payroll: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

export function Integrations() {
  const handleConnect = (integration: Integration) => {
    toast({
      title: "Coming Soon",
      description: `${integration.name} integration will be available soon. We'll notify you when it's ready.`,
    });
  };

  const groupedIntegrations = integrations.reduce((acc, integration) => {
    if (!acc[integration.category]) {
      acc[integration.category] = [];
    }
    acc[integration.category].push(integration);
    return acc;
  }, {} as Record<string, Integration[]>);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Integrations</h2>
        <p className="text-muted-foreground">
          Connect your favorite apps to streamline your credit building journey
        </p>
      </div>

      {Object.entries(groupedIntegrations).map(([category, items]) => (
        <div key={category} className="space-y-4">
          <h3 className="text-xl font-semibold capitalize">{category}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((integration) => (
              <Card key={integration.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                        <Plug className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{integration.name}</CardTitle>
                        <Badge variant="outline" className={categoryColors[integration.category]}>
                          {integration.category}
                        </Badge>
                      </div>
                    </div>
                    {integration.connected && (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4">
                    {integration.description}
                  </CardDescription>
                  <Button
                    onClick={() => handleConnect(integration)}
                    variant={integration.connected ? "outline" : "default"}
                    className="w-full"
                  >
                    {integration.connected ? "Manage" : "Connect"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
