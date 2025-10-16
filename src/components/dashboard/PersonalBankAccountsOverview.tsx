import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, TrendingUp, ArrowRight, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

interface PersonalBankAccountsOverviewProps {
  onNavigate: () => void;
}

export const PersonalBankAccountsOverview = ({ onNavigate }: PersonalBankAccountsOverviewProps) => {
  const [accountsCount, setAccountsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const fetchBankAccounts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: accounts } = await supabase
        .from("connected_bank_accounts")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (accounts) {
        setAccountsCount(accounts.length);
        
        // Get latest balance snapshots for total
        const accountIds = accounts.map(acc => acc.id);
        if (accountIds.length > 0) {
          const { data: snapshots } = await supabase
            .from("balance_snapshots")
            .select("balance, account_id")
            .in("account_id", accountIds)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (snapshots) {
            // Get latest balance for each account
            const latestBalances = new Map();
            snapshots.forEach(snap => {
              if (!latestBalances.has(snap.account_id)) {
                latestBalances.set(snap.account_id, snap.balance);
              }
            });
            const total = Array.from(latestBalances.values()).reduce((sum, balance) => sum + Number(balance), 0);
            setTotalBalance(total);
          }
        }
      }
      setLoading(false);
    } catch (error) {
      console.error("Error fetching bank accounts:", error);
      setLoading(false);
    }
  };

  return (
    <Card 
      className="p-6 bg-card border-border shadow-card relative overflow-hidden cursor-pointer hover:shadow-lg transition-shadow" 
      onClick={onNavigate}
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Bank Accounts</h2>
            <p className="text-sm text-muted-foreground mt-1">Personal Banking</p>
          </div>
          <Building2 className="w-8 h-8 text-primary" />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Connected Accounts</p>
                <p className="text-xs text-muted-foreground">Active connections</p>
              </div>
            </div>
            <span className="text-2xl font-bold text-primary">{accountsCount}</span>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-success" />
              <div>
                <p className="text-sm font-medium">Total Balance</p>
                <p className="text-xs text-muted-foreground">Across all accounts</p>
              </div>
            </div>
            <span className="text-xl font-bold text-success">
              {formatCurrency(totalBalance)}
            </span>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gradient-gold/10 rounded-lg border border-primary/20 flex items-center justify-between">
          <p className="text-sm font-medium text-primary">View All Accounts</p>
          <ArrowRight className="w-5 h-5 text-primary" />
        </div>
      </div>
    </Card>
  );
};
