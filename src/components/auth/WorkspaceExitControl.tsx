import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/hooks/useTenantContext";
import { WORKSPACE_CHOOSER_PATH } from "@/lib/auth/workspaceEntry";
import { shouldOfferAccountPicker } from "@/lib/auth/accountSelection";
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
 * WHERE IT IS MOUNTED, AND WHERE IT IS NOT (§13 — an earlier draft of this
 * comment claimed more than the code did). It is mounted in the Solo shell
 * (`SoloApp`) and in the legacy `/admin` shell (`AdminLayout`), which together
 * cover every Solo owner whether or not their tenant carries
 * `solo_shell_enabled`. It is NOT mounted in the sub-account shell: `/business/*`
 * renders `AgencyApp`, whose account slot resolves to `null` for a member who
 * owns no agency, and that shell is locked to the Claude Design pack verbatim
 * (`src/agency/CLAUDE.md`) — a PACK-FIRST search across every file in
 * `agency-mode-shell/` returned zero hits for such a control, so under §00 the
 * decision is Claude Design's, not this session's. Tracked as #808.
 *
 * So this control is the recovery path for the shells it is IN. What keeps an
 * owner out of the shell it is missing from is the entry rule, not this button:
 * `/admin` now asks a multi-context person which workspace they want instead of
 * resuming whichever one `active_tenant_id` was parked on.
 *
 * Its visibility does not depend on the current workspace's tier — the old
 * switcher rendered only when the active tenant was `standalone`, so it was
 * absent in exactly the situation an owner needed it. It is shown only to a
 * genuinely multi-context person: a single-workspace owner has nothing to
 * choose, and platform staff switch through the audited operator seam.
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

  // §18 — the "does this person have somewhere else to go?" rule already had a
  // home: `shouldOfferAccountPicker`, which `Auth.tsx` runs at sign-in to decide
  // whether the chooser appears at all. This control asks the SAME question, so
  // it calls the SAME predicate rather than a second copy that can drift.
  //
  // It must also count the SAME POPULATION the chooser will actually offer, which
  // is active tenants only. Counting the raw list would show this button to
  // someone whose second tenant is not active — they would click it, the chooser
  // would find fewer than two choices, and it would send them straight back into
  // the shell they were trying to leave. A recovery control that silently does
  // nothing is worse than one that is absent, because it spends the owner's trust.
  const reachable = tenants.filter((t) => t.status === "active").length;
  if (!shouldOfferAccountPicker({ activeMembershipCount: reachable, isPlatformStaff })) return null;

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
