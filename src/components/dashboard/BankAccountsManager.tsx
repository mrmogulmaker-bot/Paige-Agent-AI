import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlaidLink } from "@/hooks/usePlaidLink";
import { toast } from "sonner";
import { Building2, User } from "lucide-react";
import { OverviewTab } from "./bank-accounts/OverviewTab";
import { AccountsTab } from "./bank-accounts/AccountsTab";
import { TransactionsTab } from "./bank-accounts/TransactionsTab";
import { CashflowTab } from "./bank-accounts/CashflowTab";
import { FundingSignalsTab } from "./bank-accounts/FundingSignalsTab";
import { RulesAlertsTab } from "./bank-accounts/RulesAlertsTab";
import { StatementsTab } from "./bank-accounts/StatementsTab";
import { ReconciliationTab } from "./bank-accounts/ReconciliationTab";
import { ConnectionsTab } from "./bank-accounts/ConnectionsTab";
import { CreditHealthTab } from "./bank-accounts/CreditHealthTab";
import { EntityMappingTab } from "./bank-accounts/EntityMappingTab";

interface BankAccountsManagerProps {
  businessMode?: boolean;
}

export function BankAccountsManager({ businessMode = false }: BankAccountsManagerProps) {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: accountsData, isLoading, refetch } = useQuery({
    queryKey: ["connected-bank-accounts", businessMode],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let query = supabase
        .from("connected_bank_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (businessMode) {
        query = query.not("business_id", "is", null);
      } else {
        query = query.is("business_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink(() => {
    toast.success("Bank account connected successfully!");
    refetch();
  });

  const handleRefreshAccount = async (accountId: string) => {
    toast.info("Syncing account...");
    try {
      const { error } = await supabase.functions.invoke("plaid-sync-transactions", {
        body: { accountId },
      });
      if (error) throw error;
      toast.success("Account synced successfully!");
      refetch();
    } catch (error) {
      console.error("Error syncing account:", error);
      toast.error("Failed to sync account");
    }
  };

  const handleDisconnectAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from("connected_bank_accounts")
        .update({ is_active: false })
        .eq("id", accountId);

      if (error) throw error;
      toast.success("Account disconnected");
      refetch();
    } catch (error) {
      console.error("Error disconnecting account:", error);
      toast.error("Failed to disconnect account");
    }
  };

  // Mock data for demo - replace with real data
  const mockAccounts = [
    {
      id: "1",
      institution: "Chase Bank",
      accountName: "Business Checking",
      type: "checking",
      currentBalance: 127450,
      available: 127450,
      lastSync: new Date(),
      status: "connected" as const,
      isPrimary: true,
    },
  ];

  const mockTransactions = [
    {
      id: "1",
      date: new Date(),
      description: "Client Payment - ABC Corp",
      category: "income",
      inflow: 15000,
      balance: 127450,
      pending: false,
    },
    {
      id: "2",
      date: new Date(Date.now() - 86400000),
      description: "Office Supplies",
      category: "expenses",
      outflow: 450,
      balance: 112450,
      pending: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-3xl font-bold text-primary flex items-center gap-3">
          {businessMode ? <Building2 className="h-8 w-8" /> : <User className="h-8 w-8" />}
          Bank Accounts
        </h2>
        <p className="text-muted-foreground">
          Cashflow clarity that closes deals
        </p>
      </div>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap lg:inline-flex h-auto p-1 bg-muted/50 border border-border/50">
          <TabsTrigger value="overview" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Overview
          </TabsTrigger>
          <TabsTrigger value="accounts" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Accounts
          </TabsTrigger>
          <TabsTrigger value="transactions" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Transactions
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Cashflow
          </TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Rules & Alerts
          </TabsTrigger>
          <TabsTrigger value="statements" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Statements
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Reconciliation
          </TabsTrigger>
          <TabsTrigger value="funding" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            {businessMode ? "Funding Signals" : "Credit Health"}
          </TabsTrigger>
          {businessMode && (
            <TabsTrigger value="entity" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
              Entity Mapping
            </TabsTrigger>
          )}
          <TabsTrigger value="connections" className="data-[state=active]:bg-gradient-gold data-[state=active]:text-primary">
            Connections
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab
            onConnectBank={() => plaidReady && openPlaidLink()}
            onRefresh={() => refetch()}
            businessMode={businessMode}
          />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <AccountsTab
            accounts={mockAccounts}
            onRefresh={handleRefreshAccount}
            onDisconnect={handleDisconnectAccount}
          />
        </TabsContent>

        <TabsContent value="transactions" className="mt-6">
          <TransactionsTab
            transactions={mockTransactions}
            cursorStatus="up-to-date"
          />
        </TabsContent>

        <TabsContent value="cashflow" className="mt-6">
          <CashflowTab />
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <RulesAlertsTab businessMode={businessMode} />
        </TabsContent>

        <TabsContent value="statements" className="mt-6">
          <StatementsTab />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-6">
          <ReconciliationTab />
        </TabsContent>

        <TabsContent value="funding" className="mt-6">
          {businessMode ? <FundingSignalsTab /> : <CreditHealthTab />}
        </TabsContent>

        {businessMode && (
          <TabsContent value="entity" className="mt-6">
            <EntityMappingTab />
          </TabsContent>
        )}

        <TabsContent value="connections" className="mt-6">
          <ConnectionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
