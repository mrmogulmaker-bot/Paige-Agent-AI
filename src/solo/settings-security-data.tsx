import React, { useState } from "react";
import { FileDown, FileLock2, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { AccountSecurityPanel } from "@/components/settings/AccountSecurityPanel";
import { downloadMyUserData } from "@/lib/downloadMyUserData";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";

/**
 * SoloSecurityDataView — the Security & Data tab for the Solo owner
 * (PR-C adoption of existing capabilities, §18 one home):
 *
 * - Account security rides the ONE canonical AccountSecurityPanel (password,
 *   TOTP two-factor, sign-out-everywhere) unchanged — the same panel the
 *   client dashboard and the admin settings hub mount.
 * - "Download my personal data" rides the ONE user-scoped export helper the
 *   client portal uses, labeled with its exact scope.
 * - "Request deletion of my personal data" rides the existing
 *   request-data-deletion edge: an authenticated, user-scoped pending request
 *   processed within 30 days by the compliance cron. It is a REQUEST over
 *   personal data — it is not workspace deletion, and it never claims to be.
 * - Workspace deletion is honestly UNAVAILABLE: no tenant/workspace deletion
 *   capability exists on main, so this screen shows copy, not a dead or
 *   mislabeled destructive button.
 *
 * Every control here is user-scoped by construction (supabase.auth.* and
 * user_id-keyed reads; no tenant-addressed write exists in this view), which
 * is why switching workspaces can never redirect any of these acts.
 */

export function SoloSecurityDataView() {
  return (
    <div className="ss-secdata">
      <section className="ss-card ss-secdata-security">
        <div className="sd-card-hd">
          <span className="sd-eyebrow"><ShieldCheck /> Account security</span>
          <p>Your login, your second factor, and your active sessions.</p>
        </div>
        <AccountSecurityPanel />
      </section>

      <SoloPersonalDataCard />

      <section className="ss-card ss-secdata-vaultnote">
        <div className="sd-card-hd">
          <span className="sd-eyebrow"><KeyRound /> Credential storage</span>
        </div>
        <p>Vault is not a password manager. Raw passwords and secrets must not enter Vault records, PAIGE memory, or conversation content. Use proven OAuth/provider flows or an external password manager.</p>
      </section>
    </div>
  );
}

function SoloPersonalDataCard() {
  const [downloading, setDownloading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadMyUserData();
      toast.success("Your personal data export has been downloaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download data");
    } finally {
      setDownloading(false);
    }
  };

  const handleDeletionRequest = async () => {
    if (requesting || submittedRequestId) return;
    setRequesting(true);
    setRequestError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in to request data deletion.");
      const { data, error } = await supabase.functions.invoke("request-data-deletion");
      if (error) throw error;
      if (!data?.success || !data?.requestId) throw new Error("The deletion request did not complete.");
      // Success is the request id read back from the compliance ledger — never
      // claimed merely because the button was pressed. The id is kept on
      // screen and the request control is replaced, so a double click cannot
      // file a second request.
      setSubmittedRequestId(String(data.requestId));
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : "Failed to submit deletion request. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <section className="ss-card ss-secdata-privacy">
      <div className="sd-card-hd">
        <span className="sd-eyebrow"><FileLock2 /> Personal data</span>
        <p>Controls for the personal data tied to your login. These acts apply to you, not to your workspace.</p>
      </div>
      <div className="ss-grid">
        <div className="ss-secdata-row">
          <div>
            <b><FileDown /> Download my personal data</b>
            <p>Exports the personal data tied to your login — your profile, scores, owned business records, recent chat messages, and financial profile — as a JSON file. This is not a workspace export: your business records (clients, deals, strategic plays) are workspace data and are not included.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={downloading}>
            {downloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
            Download JSON
          </Button>
        </div>

        <div className="ss-secdata-row ss-secdata-danger">
          <div>
            <b><Trash2 /> Request deletion of my personal data</b>
            <p>Files a formal deletion request for the personal data tied to your login. The request is processed within 30 days by our compliance process. Your workspace and its business records are not deleted by this request.</p>
          </div>
          {submittedRequestId ? (
            <p className="ss-secdata-submitted" role="status">
              Request submitted. Reference: <code>{submittedRequestId}</code>. You'll receive a confirmation; no further request is needed.
            </p>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={requesting}>
                  {requesting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  Request deletion
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Request deletion of your personal data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This files a formal deletion request for the personal data tied to your login, processed within 30 days. Your workspace and its business records are not deleted. This does not cancel billing or close your account.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={requesting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleDeletionRequest()} disabled={requesting}>
                    {requesting ? "Submitting…" : "Submit deletion request"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {requestError && <p className="ss-secdata-err" role="alert">{requestError}</p>}
        </div>

        <div className="ss-secdata-row">
          <div>
            <b><Trash2 /> Delete this workspace</b>
            <p>Workspace deletion is not available from this screen yet. To stop billing, cancel your subscription from the Billing tab; to remove workspace data, contact support. There is no button here because no safe workspace-deletion capability exists yet.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
