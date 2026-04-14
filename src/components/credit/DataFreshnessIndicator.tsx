import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import { format } from "date-fns";

type Status = "fresh" | "stale" | "none";

export function DataFreshnessIndicator() {
  const { data: status } = useQuery({
    queryKey: ["data-freshness"],
    queryFn: async (): Promise<{ status: Status; date: string | null; message: string }> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return { status: "none", date: null, message: "No credit data found — upload your report to get started" };

      // Check last analyzed report
      const { data: uploads } = await supabase
        .from("credit_report_uploads")
        .select("last_analyzed_at, created_at")
        .eq("user_id", session.user.id)
        .in("analysis_status", ["completed", "complete"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (!uploads || uploads.length === 0) {
        return { status: "none", date: null, message: "No credit data found — upload your report to get started" };
      }

      const lastDate = uploads[0].last_analyzed_at || uploads[0].created_at;
      const daysSince = differenceInDays(new Date(), new Date(lastDate));

      // Check null field percentage
      const { data: accounts } = await supabase
        .from("credit_accounts")
        .select("id, account_number, original_amount, payment_history_json, account_open_date")
        .eq("user_id", session.user.id);

      let nullPct = 0;
      if (accounts && accounts.length > 0) {
        let nullCount = 0;
        for (const a of accounts) {
          const fields = [a.account_number, a.original_amount, a.payment_history_json, a.account_open_date];
          if (fields.filter(f => f == null).length >= 2) nullCount++;
        }
        nullPct = (nullCount / accounts.length) * 100;
      }

      if (daysSince > 30 || nullPct > 20) {
        return {
          status: "stale",
          date: lastDate,
          message: "Some data may be incomplete — click Refresh Analysis for the most accurate results",
        };
      }

      return {
        status: "fresh",
        date: lastDate,
        message: `Data current as of ${format(new Date(lastDate), "MMM d, yyyy")}`,
      };
    },
  });

  if (!status) return null;

  const dotColor = status.status === "fresh"
    ? "bg-green-500"
    : status.status === "stale"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${dotColor} inline-block`} />
      <span>{status.message}</span>
    </div>
  );
}
