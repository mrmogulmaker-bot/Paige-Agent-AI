import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePlaidLink } from "@/hooks/usePlaidLink";
import { toast } from "sonner";
import {
  Zap,
  FileText,
  PenLine,
  CheckCircle2,
  ArrowRight,
  Star,
  Upload,
} from "lucide-react";

interface BankingDataSetupProps {
  businessMode?: boolean;
  onNavigateToUpload?: () => void;
}

export function BankingDataSetup({ businessMode = false, onNavigateToUpload }: BankingDataSetupProps) {
  const queryClient = useQueryClient();
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualData, setManualData] = useState({
    avg_monthly_revenue: "",
    avg_daily_balance: "",
    monthly_nsf_count: "0",
    accounts_separated: false,
  });

  const { open: openPlaidLink, ready: plaidReady } = usePlaidLink(() => {
    toast.success("Bank account connected successfully!");
    queryClient.invalidateQueries({ queryKey: ["banking-data-source"] });
  });

  const { data: existingManual } = useQuery({
    queryKey: ["manual-banking-entry"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("manual_banking_entries")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const saveManual = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const row = {
        user_id: user.id,
        avg_monthly_revenue: parseFloat(manualData.avg_monthly_revenue) || 0,
        avg_daily_balance: parseFloat(manualData.avg_daily_balance) || 0,
        monthly_nsf_count: parseInt(manualData.monthly_nsf_count) || 0,
        accounts_separated: manualData.accounts_separated,
      };

      const { error } = await supabase
        .from("manual_banking_entries")
        .upsert(row, { onConflict: "user_id" });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Banking data saved successfully!");
      setShowManualForm(false);
      queryClient.invalidateQueries({ queryKey: ["manual-banking-entry"] });
      queryClient.invalidateQueries({ queryKey: ["funding-readiness-supplemental"] });
    },
    onError: () => toast.error("Failed to save banking data"),
  });

  const tiers = [
    {
      tier: 1,
      title: "Connect Bank Account (Instant)",
      description: "Most accurate method — live balances, transactions, and cashflow analysis via secure bank connection.",
      icon: <Zap className="w-5 h-5" />,
      badge: null,
      action: () => plaidReady && openPlaidLink(),
      actionLabel: "Connect via Plaid",
      disabled: !plaidReady,
      note: "Highest confidence • Real-time data",
    },
    {
      tier: 2,
      title: "Upload Bank Statements (Recommended)",
      description: "AI extracts revenue, balances, NSF counts, and red flags from your PDF statements automatically.",
      icon: <FileText className="w-5 h-5" />,
      badge: <Badge className="bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold))] border-[hsl(var(--gold))]/30 text-xs">Recommended</Badge>,
      action: onNavigateToUpload,
      actionLabel: "Upload Statements",
      disabled: false,
      note: "High confidence • AI-verified extraction",
    },
    {
      tier: 3,
      title: "Enter Manually",
      description: "Quick fallback — enter key banking metrics yourself. Data is flagged as self-reported.",
      icon: <PenLine className="w-5 h-5" />,
      badge: null,
      action: () => setShowManualForm(true),
      actionLabel: existingManual ? "Update Manual Entry" : "Enter Manually",
      disabled: false,
      note: "Lower confidence • Self-reported",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-primary">Banking Data Sources</h3>
        <p className="text-sm text-muted-foreground">
          Choose how to provide your banking data. Higher-confidence sources improve your PME Funding Readiness Score.
        </p>
      </div>

      <div className="grid gap-4">
        {tiers.map((tier) => (
          <Card
            key={tier.tier}
            className={`border transition-all ${
              tier.tier === 2
                ? "border-[hsl(var(--gold))]/50 shadow-md ring-1 ring-[hsl(var(--gold))]/20"
                : "border-border/50"
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  tier.tier === 2 ? "bg-[hsl(var(--gold))]/15" : "bg-muted"
                }`}>
                  {tier.icon}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-sm">{tier.title}</h4>
                    {tier.badge}
                    {tier.tier === 2 && <Star className="w-3.5 h-3.5 text-[hsl(var(--gold))]" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{tier.description}</p>
                  <p className="text-xs text-muted-foreground/70 italic">{tier.note}</p>
                </div>
                <Button
                  size="sm"
                  variant={tier.tier === 2 ? "default" : "outline"}
                  className={tier.tier === 2 ? "bg-gradient-gold hover:shadow-glow text-primary" : ""}
                  onClick={tier.action}
                  disabled={tier.disabled}
                >
                  {tier.tier === 2 ? <Upload className="w-3.5 h-3.5 mr-1.5" /> : <ArrowRight className="w-3.5 h-3.5 mr-1.5" />}
                  {tier.actionLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {existingManual && !showManualForm && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-amber-500" />
            <span className="text-muted-foreground">
              Manual banking data on file — Avg Revenue: ${Number(existingManual.avg_monthly_revenue).toLocaleString()}, Avg Balance: ${Number(existingManual.avg_daily_balance).toLocaleString()}
            </span>
            <Badge variant="outline" className="ml-auto text-xs border-amber-500/50 text-amber-600">Self-Reported</Badge>
          </CardContent>
        </Card>
      )}

      {showManualForm && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Manual Banking Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="revenue" className="text-xs">Average Monthly Revenue ($)</Label>
                <Input
                  id="revenue"
                  type="number"
                  placeholder="e.g. 25000"
                  value={manualData.avg_monthly_revenue}
                  onChange={(e) => setManualData(prev => ({ ...prev, avg_monthly_revenue: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="balance" className="text-xs">Average Daily Balance ($)</Label>
                <Input
                  id="balance"
                  type="number"
                  placeholder="e.g. 15000"
                  value={manualData.avg_daily_balance}
                  onChange={(e) => setManualData(prev => ({ ...prev, avg_daily_balance: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nsf" className="text-xs">Monthly NSF Count</Label>
                <Input
                  id="nsf"
                  type="number"
                  min="0"
                  value={manualData.monthly_nsf_count}
                  onChange={(e) => setManualData(prev => ({ ...prev, monthly_nsf_count: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Business & Personal Accounts Separated?</Label>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={manualData.accounts_separated}
                    onCheckedChange={(checked) => setManualData(prev => ({ ...prev, accounts_separated: checked }))}
                  />
                  <span className="text-sm text-muted-foreground">{manualData.accounts_separated ? "Yes" : "No"}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveManual.mutate()} disabled={saveManual.isPending}>
                {saveManual.isPending ? "Saving..." : "Save Banking Data"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowManualForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
