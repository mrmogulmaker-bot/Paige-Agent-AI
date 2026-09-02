import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/hooks/useTenantContext";
import { WORKSPACE_CHOOSER_PATH, shouldOfferWorkspaceExit } from "@/lib/auth/workspaceEntry";
import { toast } from "sonner";

/**
 * WorkspaceExitControl — the ONLY account affordance a locked workspace shell may
 * carry (owner ruling 2026-09-02).
 *
 * It is deliberately NOT a picker. It selects nothing, switches nothing, and
 * changes no scope: it navigates OUT to the authorized entry chooser, which is
 * the single place a workspace is chosen. That is the ruling's own recovery
 * path — "returning to another authorized top-level workspace means explicitly
 * leaving the current workspace and re-entering through the chooser."
 *
 * WHAT IT REPLACES, AND WHY THAT IS NOT A REGRESSION (§58). The Solo shell
 * previously mounted `MemberAccountSwitcher`, which rendered EVERY tenant the
 * caller could read — sub-accounts and agencies included, with no status filter —
 * and on selection PERSISTED `profiles.active_tenant_id` before hard-navigating
 * to `/admin`, landing the person in whichever shell the new tier implied. That
 * is the in-shell account picker the ruling forbids, and it is how an owner left
 * Solo without meaning to. The capability to reach another authorized workspace
 * is preserved here in full; only the place the choice happens has moved, from
 * inside the shell to the entry chooser.
 *
 * It also closes the other half of the reported defect. The old switcher rendered
 * only when the active tenant was `standalone`, so it was ABSENT in exactly the
 * situation an owner needed it — parked in a sub-account with no way back. This
 * control's visibility does not depend on the current workspace's tier at all.
 *
 * Shown only to a genuinely multi-context person: a single-workspace owner has
 * nothing to choose, and platform staff switch through the audited operator seam.
 */
export function WorkspaceExitControl() {
  const navigate = useNavigate();
  const { tenants = [], isPlatformStaff } = useTenantContext();

  // The switcher this replaces stashed a post-switch toast for the destination
  // to show. Keep draining that key so a notice written before this shipped is
  // still delivered once, rather than lingering in session storage forever.
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem("paige.accountSwitch.notice");
      if (!notice) return;
      sessionStorage.removeItem("paige.accountSwitch.notice");
      toast.success(notice);
    } catch {
      // Feedback is best-effort when session storage is unavailable.
    }
  }, []);

  if (!shouldOfferWorkspaceExit({ authorizedContextCount: tenants.length, isPlatformStaff })) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigate(WORKSPACE_CHOOSER_PATH)}
      aria-label="Leave this workspace and choose another"
    >
      <LogOut className="mr-1.5 h-4 w-4" />
      Switch workspace
    </Button>
  );
}
