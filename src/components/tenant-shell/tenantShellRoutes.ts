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

const TENANT_ROUTE_PATTERN = /^\/(agency|business|enterprise|solo)\/([^/]+)/;

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
      return "Business";
    case "agency":
      return "Agency";
    case "enterprise":
      return "Enterprise";
    default:
      return accountType?.split("_").join(" ") || "tenant";
  }
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

/** Keep the six shell homes inside the route tree that owns the active account. */
export function tenantShellDestinationsForPath(pathname: string): TenantShellDestination[] {
  const match = pathname.match(TENANT_ROUTE_PATTERN);
  if (!match) return TENANT_SHELL_DESTINATIONS;

  const [, routeRoot, account] = match as [string, TenantRouteRoot, string];
  const root = `/${routeRoot}/${account}`;
  return TENANT_SHELL_DESTINATIONS.map((destination) => {
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

export function resolveTenantShellDestination(pathname: string): TenantShellDestination {
  const destinations = tenantShellDestinationsForPath(pathname);
  return (
    destinations.find(
      (destination) =>
        pathMatches(pathname, destination.href) ||
        destination.aliases.some((alias) => pathMatches(pathname, alias)),
    ) ?? destinations[0]
  );
}
