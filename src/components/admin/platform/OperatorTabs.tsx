// Operator (God console) sub-tab strips — Finding 4 IA restructure.
//
// The tenant nav uses a per-hub *SubTabs strip (ClientsSubTabs/PaigeSubTabs/SetupSubTabs).
// The operator hubs (Fleet · Intelligence · Compliance · Settings) get the SAME pattern —
// but since all four are structurally identical (gate-aware strip, full-path match, "Soon"
// pill) differing ONLY in their tab list, they share ONE primitive here (§18: one home, no
// four-way fork) with four config arrays. Paige reuses its own PaigeTabsLayout unchanged.
//
// GATE-AWARE (mirrors ClientsSubTabs): a tab shows iff its route would render for this user,
// so no tab ever dead-ends on a "Restricted area" card. The predicates MIRROR the route
// gates 1:1 — if a route gate changes, change the matching canSee here in lockstep.
//
// OPERATOR-ONLY GUARD (the inverse of the tenant strips): these render ONLY in godMode
// (isPlatformStaff && activeTenantId === null). A platform staffer who has SELECTED a tenant
// (godMode=false) and deep-links an operator route must NOT get operator chrome painted under
// the tenant top-bar — so we bail unless we're truly in the operator flow.
import { Link, useLocation } from "react-router-dom";
import {
  Building2, UserCog, Rocket, Radio, DollarSign, Plug, Wrench, LayoutTemplate,
  TrendingUp, ShieldCheck, BookOpen, FileSignature, LifeBuoy, Settings, Ticket, Send,
  type LucideIcon,
} from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTenantContext } from "@/hooks/useTenantContext";
import { cn } from "@/lib/utils";

type Access = { isAdmin: boolean; isPlatformOwner: boolean; isPlatformStaff: boolean };
export type OperatorTab = {
  label: string;
  href: string;
  icon: LucideIcon;
  canSee: (a: Access) => boolean;
  comingSoon?: boolean;
};

// Owner is platform staff too (useTenantContext), so `staff` admits the owner.
const staff = (a: Access) => a.isPlatformStaff;
// Mirror the PlatformOwnerOnly route gate.
const owner = (a: Access) => a.isPlatformOwner;

const FLEET_TABS: OperatorTab[] = [
  { label: "Tenants",       href: "/admin/platform/tenants",       icon: Building2, canSee: staff },
  { label: "Team",          href: "/admin/platform/team",          icon: UserCog,   canSee: staff },
  { label: "Deploy Health", href: "/admin/platform/deploy-health", icon: Rocket,    canSee: owner, comingSoon: true },
];

const INTELLIGENCE_TABS: OperatorTab[] = [
  { label: "Live Activity",    href: "/admin/platform/intelligence",     icon: Radio,          canSee: staff },
  { label: "Money Spine",      href: "/admin/platform/money",            icon: DollarSign,     canSee: owner, comingSoon: true },
  { label: "Model Router",     href: "/admin/platform/model-router",     icon: Plug,           canSee: staff, comingSoon: true },
  { label: "Prompt-Forge",     href: "/admin/platform/prompt-forge",     icon: Wrench,         canSee: owner, comingSoon: true },
  { label: "Content Defaults", href: "/admin/platform/content-defaults", icon: LayoutTemplate, canSee: owner, comingSoon: true },
  { label: "Usage Analytics",  href: "/admin/observability/usage",       icon: TrendingUp,     canSee: staff },
];

const COMPLIANCE_TABS: OperatorTab[] = [
  { label: "Compliance",      href: "/admin/platform/compliance",  icon: ShieldCheck,   canSee: owner, comingSoon: true },
  { label: "Doctrine",        href: "/admin/platform/doctrine",    icon: BookOpen,      canSee: owner, comingSoon: true },
  { label: "Legal Documents", href: "/admin/legal",                icon: FileSignature, canSee: staff },
  { label: "Security Canary", href: "/admin/security",             icon: ShieldCheck,   canSee: staff },
  { label: "Error Tracking",  href: "/admin/observability/errors", icon: LifeBuoy,      canSee: staff },
];

const PLATFORM_SETTINGS_TABS: OperatorTab[] = [
  { label: "Platform Settings",  href: "/admin/platform/settings", icon: Settings, canSee: staff },
  { label: "Invites",            href: "/admin/platform/invites",  icon: Ticket,   canSee: staff },
  { label: "Support",            href: "/admin/support",           icon: LifeBuoy, canSee: staff },
  { label: "Sends & Tier",       href: "/admin/platform/sends",    icon: Radio,    canSee: staff },
  { label: "Sending Identities", href: "/admin/platform/sending",  icon: Send,     canSee: staff },
];

function OperatorSubTabs({ ariaLabel, tabs }: { ariaLabel: string; tabs: OperatorTab[] }) {
  const { pathname } = useLocation();
  const roles = useUserRoles();
  const tenant = useTenantContext();

  // Hold the strip until access is known — a mid-resolution false would flash the wrong subset.
  if (roles.loading || tenant.loading) return null;

  // Operator-ONLY: render exactly in godMode (platform staff, no active tenant). The INVERSE of
  // the tenant strips — never paint operator chrome under a selected-tenant top-bar.
  if (!(tenant.isPlatformStaff && !tenant.activeTenantId)) return null;

  const access: Access = {
    isAdmin: roles.isAdmin,
    isPlatformOwner: tenant.isPlatformOwner,
    isPlatformStaff: tenant.isPlatformStaff,
  };

  // Operator paths are mutually non-prefixing, so a simple exact-or-nested match is safe
  // (no exact-vs-index special case needed, unlike the tenant Clients/Paige index tabs).
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const visible = tabs.filter((t) => t.canSee(access));
  if (visible.length <= 1) return null; // nothing to switch between → no strip clutter

  // If the current route isn't one this user can see as a tab, don't wrap the gated surface
  // in a strip that disowns it — let the route's own gate speak.
  if (!visible.some((t) => isActive(t.href))) return null;

  return (
    <nav
      aria-label={ariaLabel}
      className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-border bg-background px-3 sm:px-4 md:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {visible.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            to={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-t-md px-3 text-sm",
              "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            <span>{t.label}</span>
            {t.comingSoon && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            )}
            {/* Indigo underline — nav-active is not an ACT, so never gold (§11). */}
            {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-primary" />}
          </Link>
        );
      })}
    </nav>
  );
}

// The operator sub-tab strip, mounted once in AdminLayout directly beneath the dark hub
// bar (Finding 4). Unlike the tenant strips (mounted via a pathless *TabsLayout route that
// wraps CONTIGUOUS routes), the operator surfaces are flat siblings scattered across the
// router — gathering them under layout routes would risk a 404 regression on a headless
// pass that can't render-verify. So instead we render all four strips here and let each
// self-hide: OperatorSubTabs returns null unless (a) we're in godMode and (b) the current
// path is one of ITS tabs. Operator hub paths never overlap, so exactly one strip (or zero,
// on Paige/Marketplace/Analytics) shows. Same primitive, same UX, zero route surgery.
// (Paige keeps its own PaigeTabsLayout strip — Chat/Sub-Agents/Actions/Skills — unchanged.)
export function OperatorHubStrip() {
  return (
    <>
      <OperatorSubTabs ariaLabel="Fleet" tabs={FLEET_TABS} />
      <OperatorSubTabs ariaLabel="Intelligence" tabs={INTELLIGENCE_TABS} />
      <OperatorSubTabs ariaLabel="Compliance" tabs={COMPLIANCE_TABS} />
      <OperatorSubTabs ariaLabel="Settings" tabs={PLATFORM_SETTINGS_TABS} />
    </>
  );
}
