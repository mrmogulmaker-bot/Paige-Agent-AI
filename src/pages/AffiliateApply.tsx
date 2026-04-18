// src/pages/AffiliateApply.tsx
// Public landing + application page at /affiliates.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AffiliateApplyForm from "@/components/affiliates/AffiliateApplyForm";
import { supabase } from "@/integrations/supabase/client";
import { Coins, TrendingUp, ShieldCheck } from "lucide-react";

export default function AffiliateApply() {
  const [userId, setUserId] = useState<string | null>(null);
  const [defaultName, setDefaultName] = useState("");
  const [defaultEmail, setDefaultEmail] = useState("");

  useEffect(() => {
    document.title = "Become an Affiliate · PaigeAgent";
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (u) {
        setUserId(u.id);
        setDefaultEmail(u.email ?? "");
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", u.id)
          .maybeSingle();
        if (p?.full_name) setDefaultName(p.full_name);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a2840] to-[#0f1828] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-6">
        <Link to="/" className="text-xl font-semibold tracking-tight">
          PaigeAgent
        </Link>
        <Link
          to="/auth"
          className="text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-12 pt-8">
        <Badge className="mb-4 bg-[#d4a574]/20 text-[#d4a574] hover:bg-[#d4a574]/20">
          Affiliate Program
        </Badge>
        <h1 className="font-serif text-4xl font-semibold leading-tight md:text-5xl">
          Earn recurring commissions
          <br />
          referring entrepreneurs to PaigeAgent.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-white/70">
          Promote our AI funding coach and credit platform to your audience.
          Get paid every month they stay subscribed.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <FeatureCard
            Icon={Coins}
            title="25% recurring"
            body="Earn 25% on every paid subscription you refer, for 12 months."
          />
          <FeatureCard
            Icon={TrendingUp}
            title="Real-time dashboard"
            body="Track clicks, signups, and commissions in your own portal."
          />
          <FeatureCard
            Icon={ShieldCheck}
            title="60-day cookie"
            body="Last-touch attribution gives your link a long window to convert."
          />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20">
        <Card className="border-white/10 bg-white text-[#1a2840]">
          <CardHeader>
            <CardTitle className="text-2xl text-[#1a2840]">
              Apply to join
            </CardTitle>
            <p className="text-sm text-[#1a2840]/60">
              Fill this out and our team will review your application within
              2 business days.
            </p>
          </CardHeader>
          <CardContent>
            <AffiliateApplyForm
              userId={userId}
              requestedTier="external"
              defaultName={defaultName}
              defaultEmail={defaultEmail}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FeatureCard({
  Icon,
  title,
  body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5 backdrop-blur">
      <Icon className="mb-3 h-6 w-6 text-[#d4a574]" />
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-white/70">{body}</p>
    </div>
  );
}
