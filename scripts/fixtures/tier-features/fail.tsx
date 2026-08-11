// FIXTURE (non-compliant) — every gate below MUST be flagged by tier-feature-lint.
// This file is a fixture only; it is never imported by the app and lives outside src/.
import { useTenantContext } from "@/hooks/useTenantContext";

export function BadPortalGate() {
  const { activeTenant } = useTenantContext();

  // OFFENDER 1: hardcoded account_type compare in a feature gate.
  const canInvite = activeTenant?.account_type === "standalone";

  // OFFENDER 2: another account_type compare (inequality).
  const isNotAgency = activeTenant?.account_type !== "agency";

  // OFFENDER 3: hardcoded tenant-UUID compare (a phantom).
  const isMo8ul = activeTenant?.id === "e7f1b157-1111-2222-3333-444455556666";

  return (
    <div>
      {canInvite && isNotAgency && !isMo8ul ? <button>Invite client</button> : null}
    </div>
  );
}
