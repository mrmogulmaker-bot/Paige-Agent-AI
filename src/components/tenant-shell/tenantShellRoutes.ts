import {
  BarChart3,
  CalendarDays,
  Settings,
  Sparkles,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

type TenantDestination = "command" | "clients" | "calendar" | "studio" | "insights" | "settings";

export interface TenantShellDestination {
  id: TenantDestination;
  label: string;
  href: string;
  icon: LucideIcon;
  aliases: string[];
}

type TenantRouteRoot = "agency" | "business" | "enterprise" | "solo";

export interface TenantAccountContext {
  accountName?: string | null;
  accountType?: string | null;
  parentTenantId?: string | null;
}

export interface ResolvedTenantAccountContext {
  accountName: string;
  accountType: string | null;
  accountTypeLabel: string;
}

const TENANT_ROUTE_PATTERN = /^\/(agency|business|enterprise|solo)\/([^/]+)/;
const AGENCY_ACTING_CHILD_ROUTE_PATTERN = /^\/agency\/([^/]+)\/sub\/(\d+)(?:\/|$)/;

const TENANT_BRANCHES: Record<TenantDestination, { slug: string; aliases: string[] }> = {
  command: { slug: "command-center", aliases: ["paige", "trust-compass", "automations"] },
  clients: { slug: "clients", aliases: ["client-support", "billing"] },
  calendar: { slug: "calendar", aliases: [] },
  studio: { slug: "growth", aliases: [] },
  insights: { slug: "analytics", aliases: [] },
  settings: { slug: "setup", aliases: ["marketplace", "business-vault", "integrations", "team"] },
};

/** Translate internal account_type values into the owner-locked tenant-facing taxonomy. */
export function tenantAccountTypeLabel(accountType?: string | null): string {
  switch (accountType?.trim().toLowerCase()) {
    case "standalone":
      return "Solo";
    case "sub_account":
      return "Sub-account";
    case "agency":
      return "Agency Parent";
    case "enterprise":
      return "Enterprise";
    default:
      return accountType?.split("_").join(" ") || "Account";
  }
}

/**
 * Present authenticated account context atomically. The route account number is
 * intentionally not accepted here: a URL is an address, never tenant authority.
 */
export function resolveTenantAccountContext(
  context?: TenantAccountContext | null,
): ResolvedTenantAccountContext {
  const accountName = context?.accountName?.trim() || "Your workspace";
  const accountType = context?.parentTenantId
    ? "sub_account"
    : context?.accountType?.trim().toLowerCase() || null;

  return {
    accountName,
    accountType,
    accountTypeLabel: tenantAccountTypeLabel(accountType),
  };
}

/**
 * The tenant platform's six global destinations. Existing pages remain mounted at
 * their canonical routes; aliases only answer the shell question "where am I?".
 */
export const TENANT_SHELL_DESTINATIONS: TenantShellDestination[] = [
  { id: "command", label: "Command Center", href: "/admin", icon: Sparkles, aliases: ["/admin/playbook"] },
  {
    id: "clients",
    label: "Clients",
    href: "/admin/clients-hub",
    icon: Users,
    aliases: ["/admin/contacts", "/admin/clients", "/admin/leads", "/admin/pipeline"],
  },
  {
    id: "calendar",
    label: "Calendar",
    href: "/admin/calendar",
    icon: CalendarDays,
    aliases: ["/admin/bookings", "/admin/planning", "/admin/tasks"],
  },
  {
    id: "studio",
    label: "Studio",
    href: "/admin/studio",
    icon: WandSparkles,
    aliases: ["/admin/campaigns", "/admin/growth"],
  },
  {
    id: "insights",
    label: "Insights",
    href: "/admin/analytics",
    icon: BarChart3,
    aliases: ["/admin/observability"],
  },
  {
    id: "settings",
    label: "Settings",
    href: "/admin/setup",
    icon: Settings,
    aliases: [
      "/admin/settings",
      "/admin/team",
      "/admin/members",
      "/admin/coaches",
      "/admin/marketplace",
      "/admin/integrations",
      "/admin/workflows",
      "/admin/agreement",
      "/admin/agreements",
      "/admin/support",
    ],
  },
];

/**
 * Resolve only the address prefix owned by the current tenant route. Identity
 * and authorization remain server-derived in the route owner; this helper
 * preserves an already-confirmed acting-child address when building links.
 */
export function tenantRoutePrefixForPath(pathname: string): string | null {
  const actingChildMatch = pathname.match(AGENCY_ACTING_CHILD_ROUTE_PATTERN);
  if (actingChildMatch) {
    const [, parentAccount, childAccount] = actingChildMatch;
    return `/agency/${parentAccount}/sub/${childAccount}`;
  }

  const tenantMatch = pathname.match(TENANT_ROUTE_PATTERN);
  if (!tenantMatch) return null;

  const [, routeRoot, account] = tenantMatch as [string, TenantRouteRoot, string];
  return `/${routeRoot}/${account}`;
}

/** Keep the six shell homes inside the route tree that owns the active account. */
export function tenantShellDestinationsForPath(
  pathname: string,
  accountType?: string | null,
): TenantShellDestination[] {
  const root = tenantRoutePrefixForPath(pathname);
  const relationshipLabel = ["agency", "enterprise"].includes(accountType?.trim().toLowerCase() ?? "")
    ? "Relationships"
    : "Clients";
  const destinations = TENANT_SHELL_DESTINATIONS.map((destination) =>
    destination.id === "clients" ? { ...destination, label: relationshipLabel } : destination,
  );
  if (!root) return destinations;

  return destinations.map((destination) => {
    const branch = TENANT_BRANCHES[destination.id];
    return {
      ...destination,
      href: `${root}/${branch.slug}`,
      aliases: branch.aliases.map((slug) => `${root}/${slug}`),
    };
  });
}

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveTenantShellDestination(
  pathname: string,
  accountType?: string | null,
): TenantShellDestination {
  const destinations = tenantShellDestinationsForPath(pathname, accountType);
  return (
    destinations.find(
      (destination) =>
        pathMatches(pathname, destination.href) ||
        destination.aliases.some((alias) => pathMatches(pathname, alias)),
    ) ?? destinations[0]
  );
}
