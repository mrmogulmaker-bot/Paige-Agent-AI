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
    href: "/admin/clients-hub/delivery",
    icon: CalendarDays,
    aliases: ["/admin/calendar", "/admin/bookings", "/admin/planning", "/admin/tasks"],
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

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveTenantShellDestination(pathname: string): TenantShellDestination {
  // Calendar is intentionally checked before Clients because its canonical route
  // lives under /admin/clients-hub while Calendar owns delivery and scheduling.
  const ordered = [
    TENANT_SHELL_DESTINATIONS[2],
    ...TENANT_SHELL_DESTINATIONS.filter((destination) => destination.id !== "calendar"),
  ];
  return (
    ordered.find(
      (destination) =>
        pathMatches(pathname, destination.href) ||
        destination.aliases.some((alias) => pathMatches(pathname, alias)),
    ) ?? TENANT_SHELL_DESTINATIONS[0]
  );
}
