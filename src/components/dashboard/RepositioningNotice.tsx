import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Download, Compass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

/**
 * Replaces the legacy DisputesManager. Shown for 30 days during the
 * repositioning transition (see paige_repositioning_spec.md §10 step 6, §9).
 *
 * Provides:
 *  1. Clear notice that Paige is no longer a credit repair organization
 *  2. Link to the CFPB free self-help dispute resources
 *  3. CSV export of the user's historical dispute data so they can take it
 *     elsewhere before the legacy tables are archived.
 */
export function RepositioningNotice() {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("You must be signed in to export your data.");
        return;
      }

      const [disputesRes, lettersRes, outcomesRes] = await Promise.all([
        supabase.from("disputes").select("*").eq("user_id", user.id),
        supabase.from("dispute_letters").select("*").eq("user_id", user.id),
        supabase.from("dispute_outcomes").select("*").eq("user_id", user.id),
      ]);

      const disputes = disputesRes.data || [];
      const letters = lettersRes.data || [];
      const outcomes = outcomesRes.data || [];

      if (disputes.length === 0 && letters.length === 0 && outcomes.length === 0) {
        toast.info("No historical dispute data to export.");
        return;
      }

      const toCsv = (rows: any[]): string => {
        if (rows.length === 0) return "";
        const headers = Object.keys(rows[0]);
        const escape = (v: any) => {
          if (v === null || v === undefined) return "";
          const s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return `"${s.replace(/"/g, '""')}"`;
        };
        return [
          headers.join(","),
          ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
        ].join("\n");
      };

      const sections = [
        { name: "disputes", rows: disputes },
        { name: "dispute_letters", rows: letters },
        { name: "dispute_outcomes", rows: outcomes },
      ];

      const blob = new Blob(
        [
          sections
            .map((s) => `=== ${s.name.toUpperCase()} (${s.rows.length} rows) ===\n${toCsv(s.rows)}`)
            .join("\n\n"),
        ],
        { type: "text/csv" }
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paigeagent-historical-disputes-${new Date()
        .toISOString()
        .split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Historical dispute data exported.");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Export failed. Please contact support.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <Badge className="bg-accent/10 text-accent border-accent/20">
          We've Repositioned
        </Badge>
        <h1 className="text-3xl font-bold text-foreground">
          Paige is now a Funding Intelligence Platform
        </h1>
        <p className="text-muted-foreground">
          We no longer offer credit dispute services. Paige is focused on
          helping you understand your credit profile and qualify for business
          funding.
        </p>
      </div>

      <Card className="p-6 bg-card border-border space-y-4">
        <div className="flex items-start gap-3">
          <Compass className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
          <div>
            <h2 className="font-semibold text-foreground mb-1">
              Looking for credit repositioning services?
            </h2>
            <p className="text-sm text-muted-foreground">
              For credit repositioning services please visit Mogul Credit AI.
            </p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              asChild
            >
              <a
                href="https://mogulcredit.ai"
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Mogul Credit AI
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
            <p className="text-xs text-muted-foreground mt-3">
              You can also use the CFPB's free self-help dispute tools at{" "}
              <a
                href="https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                consumerfinance.gov
              </a>.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border space-y-4">
        <div className="flex items-start gap-3">
          <Download className="w-5 h-5 text-accent mt-1 flex-shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold text-foreground mb-1">
              Export your historical dispute data
            </h2>
            <p className="text-sm text-muted-foreground">
              You have 30 days to download any dispute records, letters, and
              outcomes that are still on file before they're archived.
            </p>
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download CSV
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-gradient-to-br from-accent/5 to-gold/5 border-accent/20">
        <h2 className="font-semibold text-foreground mb-2">
          What Paige does now
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Paige helps small business owners understand how their personal and
          business credit affects their funding eligibility — and connects them
          to capital sources they qualify for.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => navigate("/app/credit")}
            className="bg-gradient-gold text-primary"
          >
            View Credit Intelligence
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app/funding")}
          >
            See Funding Matches
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/app")}
          >
            Ask Paige
          </Button>
        </div>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Questions about this change? Email{" "}
        <a href="mailto:support@paigeagent.ai" className="underline">
          support@paigeagent.ai
        </a>
      </p>
    </div>
  );
}
