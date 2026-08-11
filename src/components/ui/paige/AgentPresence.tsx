import { useTenantContext } from "@/hooks/useTenantContext";
import { canOwnSubaccounts } from "@/lib/agency/accountCapabilities";
import { AgentRail } from "./AgentRail";
import { CommandLauncher } from "./CommandLauncher";
import { resolveAgentPersona, type AgentAccountType, type AgentPersona } from "./persona";

/**
 * AgentPresence — the single integration point for the Paige presence chrome
 * (Wave 4 Slice 4a.1). Mounts the docked right-rail + the universal ⌘K launcher and
 * feeds them the account-type-aware persona (spec §5a). Host shells (AdminLayout
 * now; AgencyLayout in a fast-follow) render this once, inside
 * {@link AgentPresenceProvider}, on their AUTH-GATED, non-Studio surfaces.
 *
 * ACCOUNT-TYPE derivation is PRESENTATION-ONLY (§9): it never authorizes anything —
 * the real tenant/operator boundary is server-side (RLS + PlatformStaffOnly). It only
 * picks which chrome/identity the rail shows:
 *   • God / platform tier (no active tenant) → super_admin → "Paige Operator"
 *   • active tenant is a top-level agency/enterprise → agency (scope-switcher slot)
 *   • active tenant has a parent → sub_account (identical rail to solo, spec §5a)
 *   • otherwise → solo
 *
 * VP-persona binding is a SEAM (persona.ts): the default identity is resolved here;
 * a tenant-authored Playbook persona (§7) or a later VP binding overrides via props
 * with NO change to the rail.
 */

export interface AgentPresenceProps {
  /**
   * Override the resolved persona (e.g. a tenant-authored Playbook persona, §7).
   * Absent → the platform default for the derived account type (persona.ts seam).
   */
  persona?: AgentPersona;
  /** The chat "ask" seam handed to the launcher (spec §11 non-goal — wired later). */
  onAsk?: (text: string) => void;
  /**
   * Host top-bar height in rem, forwarded to the rail so it docks BELOW the host
   * header (no overlap / no z-fight, §39 S1). Default 0 = full-height for a host with
   * no top bar.
   */
  topOffsetRem?: number;
}

function deriveAccountType(args: {
  isPlatformStaff: boolean;
  activeTenantId: string | null;
  activeTenant: { account_type: string; parent_tenant_id: string | null } | null;
}): AgentAccountType {
  const { isPlatformStaff, activeTenantId, activeTenant } = args;
  // God/platform tier: platform staff operating with NO tenant selected (mirrors
  // AdminLayout's `godMode`). Presentation-only — server-side gates are authoritative.
  if (isPlatformStaff && activeTenantId === null) return "super_admin";
  if (activeTenant) {
    // §51 invariant: a child (parent_tenant_id set) is NEVER an agency. Check parent first.
    if (activeTenant.parent_tenant_id) return "sub_account";
    // §18: parent-capable check via the ONE shared predicate (not a re-inlined literal).
    if (canOwnSubaccounts(activeTenant.account_type)) return "agency";
  }
  return "solo";
}

export function AgentPresence({ persona, onAsk, topOffsetRem }: AgentPresenceProps) {
  const { isPlatformStaff, activeTenantId, activeTenant } = useTenantContext();

  const accountType = deriveAccountType({ isPlatformStaff, activeTenantId, activeTenant });
  const resolvedPersona = persona ?? resolveAgentPersona(accountType);

  return (
    <>
      <AgentRail
        persona={resolvedPersona}
        accountType={accountType}
        topRem={topOffsetRem}
        // Agency scope-switcher slot (spec §5a / owed-work #7) wires in a later slice.
        // Left undefined here so only agency-parent operators ever see the slot, and
        // the rail stays identical for solo/sub-account (spec §5a).
        scopeSwitcher={undefined}
      />
      <CommandLauncher persona={resolvedPersona} onAsk={onAsk} />
    </>
  );
}
