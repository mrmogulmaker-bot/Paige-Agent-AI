import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlaidLink } from "@/hooks/usePlaidLink";
import { toast } from "sonner";
import { Loader2, Building2, User, TrendingUp, AlertCircle, RefreshCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface BankAccountsManagerProps {
  businessMode?: boolean;
}

export function BankAccountsManager({ businessMode = false }: BankAccountsManagerProps) {
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const { data: accounts, isLoading, refetch } = useQuery({
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

  const handleDelete = async (accountId: string) => {
    setIsDeleting(accountId);
    try {
      const { error } = await supabase
        .from("connected_bank_accounts")
        .update({ is_active: false })
        .eq("id", accountId);

      if (error) throw error;

      toast.success("Bank account disconnected");
      refetch();
    } catch (error) {
      console.error("Error disconnecting account:", error);
      toast.error("Failed to disconnect account");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSync = async (accountId: string) => {
    toast.info("Syncing transactions...");
    try {
      const { data, error } = await supabase.functions.invoke("plaid-sync-transactions", {
        body: { accountId },
      });

      if (error) throw error;

      toast.success("Transactions synced successfully!");
      refetch();
    } catch (error) {
      console.error("Error syncing transactions:", error);
      toast.error("Failed to sync transactions");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {businessMode ? <Building2 className="h-6 w-6" /> : <User className="h-6 w-6" />}
            {businessMode ? "Business" : "Personal"} Bank Accounts
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your connected bank accounts and sync transactions
          </p>
        </div>
        <Button onClick={() => openPlaidLink()} disabled={!plaidReady} className="bg-primary hover:bg-primary-light">
          <TrendingUp className="mr-2 h-4 w-4" />
          Connect Bank Account
        </Button>
      </div>

      {/* Connected Accounts */}
      {!accounts || accounts.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Bank Accounts Connected</h3>
            <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
              Connect your {businessMode ? "business" : "personal"} bank account to track transactions,
              monitor cash flow, and improve your {businessMode ? "BUILD" : "credit"} score.
            </p>
            <Button onClick={() => openPlaidLink()} variant="outline" disabled={!plaidReady}>
              <TrendingUp className="mr-2 h-4 w-4" />
              Connect Your First Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <Card key={account.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-primary-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">
                          {account.institution_name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          {account.account_name}
                          {account.account_mask && (
                            <Badge variant="outline" className="text-xs">
                              ••••{account.account_mask}
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(account.id)}
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(account.id)}
                      disabled={isDeleting === account.id}
                    >
                      {isDeleting === account.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Account Type</p>
                    <p className="font-medium capitalize">
                      {account.account_type || "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Subtype</p>
                    <p className="font-medium capitalize">
                      {account.account_subtype || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Connected</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(account.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Synced</p>
                    <p className="font-medium">
                      {account.last_sync_at
                        ? formatDistanceToNow(new Date(account.last_sync_at), {
                            addSuffix: true,
                          })
                        : "Never"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info Card */}
      <Card className="bg-accent/5 border-accent/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-accent" />
            Why Connect Bank Accounts?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • <strong>Automatic Transaction Tracking:</strong> Import and categorize transactions automatically
          </p>
          <p>
            • <strong>{businessMode ? "BUILD Score" : "Credit Score"} Insights:</strong> Track cash flow and improve your financial profile
          </p>
          <p>
            • <strong>Funding Readiness:</strong> Demonstrate strong banking relationships to lenders
          </p>
          <p>
            • <strong>Secure &amp; Private:</strong> Bank-level encryption with read-only access
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
