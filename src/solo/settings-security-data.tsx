import React, { useState } from "react";
import { FileDown, FileLock2, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { AccountSecurityPanel } from "@/components/settings/AccountSecurityPanel";
import { downloadMyUserData } from "@/lib/downloadMyUserData";
import { toast } from "sonner";
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
 * - Personal-data deletion is honestly UNAVAILABLE: the request-intake edge
 *   exists, but its processor (process-data-deletion) is NOT deployed and no
 *   schedule executes requests (provider-verified 2026-09-19), so no request
 *   control is offered and no processing timeframe is promised. Enabling a
 *   deletion lifecycle here requires INT-070: secure the processor with an
 *   internal-caller gate → deploy it → schedule it → provider-verify → a
 *   controlled end-to-end proof. Until then this screen states the gap.
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
            <p>Exports the personal data tied to your login — your profile, scores, owned business records, recent chat messages, and financial profile — as a JSON file. This is not a workspace export: your workspace records (clients, deals, strategic plays) are workspace data and are not included.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={downloading}>
            {downloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
            Download JSON
          </Button>
        </div>

        <div className="ss-secdata-row ss-secdata-danger">
          <div>
            <b><Trash2 /> Delete my personal data</b>
            <p>Personal-data deletion is not available from this screen yet. We are not accepting deletion requests here because the processing side is not live, and we will not queue a request we cannot honestly execute. To have personal data removed in the meantime, contact support. There is no button here for that reason.</p>
          </div>
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
