// FIXTURE (compliant) — tier-feature-lint MUST produce ZERO offenders here.
// This file is a fixture only; it is never imported by the app and lives outside src/.
import { useTierFeatures } from "@/hooks/useTierFeatures";
import { useTenantContext } from "@/hooks/useTenantContext";

export function GoodPortalGate() {
  // The compliant path: read the §60 baseline through the hook, no hardcode.
  const { has } = useTierFeatures();
  const canInvite = has("customer_portal_invite");

  // Legitimate tier ROUTING (which surface to show), exempted with a reason.
  const { activeTenant } = useTenantContext();
  const isAgencyBook = activeTenant?.account_type === "agency"; // tier-feature-exempt: routing (which book surface), not a feature toggle

  // Exempt marker may also sit on the line ABOVE the compare:
  // tier-feature-exempt: operator-scope routing, not a feature toggle
  const isGodScope = activeTenant?.id === "00000000-0000-0000-0000-000000000000";

  return (
    <div>
      {canInvite ? <button>Invite client</button> : null}
      {isAgencyBook ? <span>Sub-accounts</span> : null}
      {isGodScope ? <span>Fleet</span> : null}
    </div>
  );
}
