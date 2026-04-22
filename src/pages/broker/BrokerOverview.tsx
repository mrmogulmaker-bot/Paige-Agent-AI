// Broker workspace home — shows headline stats + quickstart guidance.
// Uses BrokerContext so team members see their parent broker's data.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, DollarSign, MessageSquareText, Copy, Check } from "lucide-react";
import { useBrokerContext } from "@/hooks/useBrokerContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const BrokerOverview = () => {
  const { activeBrokerId, parentBrokerProfile, isTeamMember, permissions } = useBrokerContext();
  const { toast } = useToast();
  const [stats, setStats] = useState({ activeClients: 0, pendingClients: 0, sessions: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeBrokerId) return;
    (async () => {
      const [{ data: rels }, { count: sessionCount }] = await Promise.all([
        supabase
          .from("broker_client_relationships")
          .select("id, client_subscription_status, is_active")
          .eq("broker_id", activeBrokerId),
        supabase
          .from("broker_paige_sessions")
          .select("id", { count: "exact", head: true })
          .eq("broker_id", activeBrokerId),
      ]);
      const list = rels || [];
      setStats({
        activeClients: list.filter(
          (r: any) => r.is_active && r.client_subscription_status === "active",
        ).length,
        pendingClients: list.filter(
          (r: any) => r.client_subscription_status !== "active",
        ).length,
        sessions: sessionCount || 0,
      });
    })();
  }, [activeBrokerId]);

  const signupLink = parentBrokerProfile?.referral_code
    ? `https://paigeagent.ai/auth?ref=${parentBrokerProfile.referral_code}&mode=signup`
    : "";

  const handleCopy = async () => {
    if (!signupLink) return;
    await navigator.clipboard.writeText(signupLink);
    setCopied(true);
    toast({ title: "Copied", description: "Client signup link copied to clipboard." });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {isTeamMember ? `Welcome to ${parentBrokerProfile?.business_name}` : "Welcome back"}
        </h1>
        <p className="text-muted-foreground">
          {isTeamMember
            ? "You're collaborating in your team workspace."
            : "Manage your clients and grow your book of business with Paige."}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active clients</CardDescription>
            <CardTitle className="text-3xl">{stats.activeClients}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Users className="h-3 w-3 inline mr-1" />
            Subscribed at $17/mo
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending invites</CardDescription>
            <CardTitle className="text-3xl">{stats.pendingClients}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Awaiting client signup</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Paige sessions</CardDescription>
            <CardTitle className="text-3xl">{stats.sessions}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <MessageSquareText className="h-3 w-3 inline mr-1" />
            Strategy conversations
          </CardContent>
        </Card>
      </div>

      {/* Signup link card */}
      <Card>
        <CardHeader>
          <CardTitle>Your client signup link</CardTitle>
          <CardDescription>
            Share this link with clients. They get the $17/mo broker rate locked in for life.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-md border bg-muted/30 font-mono text-sm break-all">
            {signupLink || "—"}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCopy} disabled={!signupLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/broker/app/clients">
                <Users className="h-4 w-4 mr-2" />
                Invite clients
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Earnings teaser — hide for team members without commission visibility */}
      {(!isTeamMember || permissions.can_view_commissions) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Commissions
            </CardTitle>
            <CardDescription>
              Earn 20% recurring on any broker you refer to PaigeAgent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/broker/app/commissions">View commissions</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BrokerOverview;
