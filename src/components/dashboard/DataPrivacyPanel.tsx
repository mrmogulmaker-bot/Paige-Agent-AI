import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Download, Trash2, ShieldOff, Bell, FileText, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SecurityBadge } from "@/components/security/SecurityBadge";
import { Link } from "react-router-dom";

export function DataPrivacyPanel() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeletingCredit, setIsDeletingCredit] = useState(false);

  const handleDownloadData = async () => {
    setIsDownloading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      // Fetch all user-owned data in parallel
      const [profile, scores, fundability, businesses, sessions, financialProfile] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("build_scores").select("*").eq("user_id", user.id),
        supabase.from("build_progress").select("*").eq("user_id", user.id),
        supabase.from("businesses").select("*").eq("owner_user_id", user.id),
        supabase.from("chat_messages").select("*").eq("user_id", user.id).limit(500),
        supabase.from("banking_relationships").select("*").eq("user_id", user.id),
      ]);

      const exportPayload = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        email: user.email,
        profile: profile.data ?? null,
        build_scores: scores.data ?? [],
        build_progress: fundability.data ?? [],
        businesses: businesses.data ?? [],
        banking_relationships: financialProfile.data ?? [],
        recent_chat_messages: sessions.data ?? [],
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paigeagent-data-export-${user.id.slice(0, 8)}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("Your data export has been downloaded.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to download data");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDeleteCreditData = async () => {
    setIsDeletingCredit(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");

      const { data, error } = await supabase.functions.invoke("factory-credit-reset", {
        body: { source: "settings_data_privacy" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      if (!data?.success) throw new Error("Reset did not complete");

      // Reset consent flag so the user re-confirms before any future upload
      await supabase
        .from("profiles")
        .update({
          credit_report_consent: false,
          credit_report_consent_timestamp: null,
        })
        .eq("user_id", session.user.id);

      toast.success("Credit data deleted. Fundability scores have been reset.");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to delete credit data");
    } finally {
      setIsDeletingCredit(false);
    }
  };

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ShieldOff className="w-5 h-5 text-accent" />
            Data &amp; Privacy
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your data, exercise your privacy rights, and review how PaigeAgent protects you.
          </p>
        </div>
        <SecurityBadge />
      </div>

      <div className="grid gap-4">
        {/* Download */}
        <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-accent" />
              <p className="font-medium">Download My Data</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Export all data PaigeAgent holds about you as JSON — credit scores, fundability
              scores, account data, Paige session summaries, and financial profile.
            </p>
          </div>
          <Button onClick={handleDownloadData} disabled={isDownloading} variant="outline" size="sm">
            {isDownloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Download JSON
          </Button>
        </div>

        {/* Delete Credit Data */}
        <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-amber-600" />
              <p className="font-medium">Delete Credit Data</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Removes all extracted credit report data and resets your fundability scores to a
              locked state. Your account stays active. This cannot be undone without re-uploading.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-amber-700 dark:text-amber-400">
                <Trash2 className="w-4 h-4 mr-1" /> Delete Credit Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all credit data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes extracted credit accounts, scores, and analysis. Your
                  account stays active but fundability scores reset until you re-upload a report.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteCreditData}
                  disabled={isDeletingCredit}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isDeletingCredit && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  Delete Credit Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Delete Account */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              <p className="font-medium">Delete Account</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Permanent deletion of your account and all associated data. Processed within 30
              days. This cannot be undone.
            </p>
          </div>
          <Button asChild variant="destructive" size="sm">
            <a href="mailto:privacy@paigeagent.ai?subject=Account%20Deletion%20Request">
              Request Deletion
            </a>
          </Button>
        </div>

        {/* Communication preferences */}
        <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-accent" />
              <p className="font-medium">Communication Preferences</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Control which emails, SMS, and push notifications you receive from PaigeAgent.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/settings?tab=notifications">Manage</Link>
          </Button>
        </div>

        {/* Privacy Policy */}
        <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-accent" />
              <p className="font-medium">Privacy Policy</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Read how we collect, use, protect, and never sell your financial data.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/privacy" target="_blank" rel="noreferrer">
              View Policy <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
