import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FundingReadinessLens } from "@/components/funding-lens/FundingReadinessLens";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function WorkspaceFundingReadiness() {
  const { user } = useAuth();
  const [contactId, setContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("linked_user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!cancel) {
        setContactId(data?.id || null);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading your readiness profile…
      </div>
    );
  }

  if (!contactId) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-sm">
            We haven't set up your funding readiness profile yet. Your coach will reach out shortly to get this started.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Funding Readiness</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your live picture of credit, banking, cash flow and document status — refreshed as new data comes in.
        </p>
      </div>
      <FundingReadinessLens contactId={contactId} mode="client" />
    </div>
  );
}
