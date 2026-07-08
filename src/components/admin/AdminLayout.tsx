import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, BarChart3, Settings, LogOut,
  TrendingUp, Menu, BookOpen, Wrench, Share2, Briefcase, Brain, Building2, LifeBuoy,
  Contact, KanbanSquare, Inbox, CheckSquare, UserCog, ChevronDown, MoreHorizontal, X, Workflow, ClipboardCheck, Plug, Bot, Rocket, ShieldCheck, FileSignature, CalendarDays,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminBridgeBell } from "@/components/admin/AdminBridgeBell";
import { AdminViewBanner } from "@/components/admin/AdminViewBanner";
import { TenantSwitcher } from "@/components/admin/TenantSwitcher";
import { useTenantContext } from "@/hooks/useTenantContext";

import { useRoleLens } from "@/contexts/RoleLensContext";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { performSignOut } from "@/lib/auth/signOut";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PLATFORM } from "@/lib/platform/identity";

// 7-hub top bar. Each hub has a primary route and optional sub-routes
// surfaced via a dropdown so power users can jump deep with one click.
// Every sub-route still has its own page — this is grouping, not consolidation.
type HubChild = { label: string; href: string; icon: any };
type Hub = {
  label: string;
  href: string;
  icon: any;
  children?: HubChild[];
  /** Extra path prefixes that should also highlight this hub. */
  aliases?: string[];
};

const hubs: Hub[] = [
  { label: "Dashboard", href: "/admin", icon: BarChart3 },
  {
    label: "Contacts",
    href: "/admin/contacts",
    icon: Contact,
    children: [
      { label: "All Contacts", href: "/admin/contacts", icon: Contact },
      { label: "Lead Enrichment", href: "/admin/leads/enrichment", icon: Contact },
      { label: "Client Files (Legacy)", href: "/admin/clients", icon: Users },
    ],
    aliases: ["/admin/leads", "/admin/clients"],
  },
  {
    label: "Pipeline",
    href: "/admin/pipeline",
    icon: KanbanSquare,
    children: [
      { label: "Deal Pipeline", href: "/admin/pipeline", icon: KanbanSquare },
      { label: "Funding Journey", href: "/admin/funding-pipeline", icon: Briefcase },
      { label: "Funding Portfolio", href: "/admin/funding", icon: DollarSign },
      { label: "Funding Readiness Lens", href: "/admin/funding-lens", icon: TrendingUp },
    ],
    aliases: ["/admin/funding", "/admin/funding-pipeline", "/admin/funding-lens"],
  },
  {
    label: "Calendar",
    href: "/admin/calendar",
    icon: CalendarDays,
    aliases: ["/admin/bookings"],
  },
  // Inbox hub dissolved — Conversations live per-contact under Contacts → [contact] → Comms tab.
  // Bookings rebuilt as personal Calendar (per-user Google/Apple). Support moved to the More menu.
  // Routes (/admin/communications, /admin/bookings, /admin/support) remain mounted for deep-link back-compat.
  // Tasks & Approvals removed from global nav — now scoped per-contact under Contacts → [contact] → Tasks / Approvals tabs.
  // Routes (/admin/tasks, /admin/approvals, /admin/approvals/:id) remain mounted for deep-link back-compat from notifications.
  {
    label: "Campaigns",
    href: "/admin/campaigns",
    icon: Rocket,
    aliases: ["/admin/growth"],
  },
  {
    label: "Automation",
    href: "/admin/workflows",
    icon: Workflow,
    children: [
      { label: "Workflows", href: "/admin/workflows", icon: Workflow },
      { label: "Paige Sub-Agents", href: "/admin/sub-agents", icon: Bot },
      { label: "Paige Skills", href: "/admin/skills", icon: Bot },
      { label: "Integrations", href: "/admin/integrations", icon: Plug },
      { label: "Knowledge Base", href: "/admin/knowledge-base", icon: Brain },
      { label: "Tenant Knowledge", href: "/admin/tenant-knowledge", icon: Brain },
      { label: "Network Insights", href: "/admin/network-kb", icon: BookOpen },
      { label: "Knowledge Review", href: "/admin/knowledge", icon: BookOpen },
    ],
    // Orphan tool routes that conceptually live under Automation.
    aliases: [
      "/admin/integrations",
      "/admin/sub-agents",
      "/admin/skills",
      "/admin/knowledge",
      "/admin/knowledge-base",
      "/admin/tenant-knowledge",
      "/admin/network-kb",
      "/admin/signatures",
      "/admin/social",
      "/admin/notifications",
    ],
  },
  {
    label: "Insights",
    href: "/admin/analytics",
    icon: TrendingUp,
    children: [
      { label: "Reports", href: "/admin/analytics", icon: TrendingUp },
      { label: "Usage Analytics", href: "/admin/observability/usage", icon: TrendingUp },
      { label: "Error Tracking", href: "/admin/observability/errors", icon: LifeBuoy },
    ],
    aliases: ["/admin/observability"],
  },
];


// Tools that don't belong to a daily-use hub — tucked into "More".
// `adminOnly` items are hidden from coaches in the toolbar to match the
// route-level RoleGate enforcement in Admin.tsx.
type MoreItem = HubChild & { adminOnly?: boolean };
const moreNavItems: MoreItem[] = [
  { label: "Coaches", href: "/admin/coaches", icon: UserCog },
  { label: "Members & Roles", href: "/admin/members", icon: UserCog, adminOnly: true },
  { label: "Affiliates", href: "/admin/affiliates", icon: Share2 },
  { label: "Brokers", href: "/admin/brokers", icon: Briefcase, adminOnly: true },
  { label: "Support Tickets", href: "/admin/support", icon: LifeBuoy, adminOnly: true },
  { label: "Maintenance", href: "/admin/maintenance", icon: Wrench, adminOnly: true },
  { label: "Security Canary", href: "/admin/security", icon: ShieldCheck, adminOnly: true },
  { label: "Legal Documents", href: "/admin/legal", icon: ShieldCheck, adminOnly: true },
  { label: "Agreements", href: "/admin/agreements", icon: FileSignature, adminOnly: true },
  { label: "Settings", href: "/admin/settings", icon: Settings, adminOnly: true },
];

const adminNavItems = [
  ...hubs.flatMap((h) => [{ label: h.label, href: h.href, icon: h.icon }, ...(h.children ?? [])]),
  ...moreNavItems,
];

// The God console (platform staff) gets its own nav: platform control (Fleet,
// Team) + the operator's own business tools (contacts=agencies/prospects, comms,
// campaigns, AI automation, calendar). It deliberately omits the client-servicing
// hubs (Pipeline/Funding/credit) — those are agency-tier, not the platform's job.
const GOD_HUBS: Hub[] = [
  { label: "Fleet", href: "/admin/platform/tenants", icon: Building2 },
  { label: "Team", href: "/admin/platform/team", icon: UserCog },
  { label: "Contacts", href: "/admin/contacts", icon: Contact, aliases: ["/admin/leads"] },
  { label: "Inbox", href: "/admin/communications", icon: Inbox },
  { label: "Campaigns", href: "/admin/campaigns", icon: Rocket, aliases: ["/admin/growth"] },
  {
    label: "Automation",
    href: "/admin/workflows",
    icon: Workflow,
    children: [
      { label: "Workflows", href: "/admin/workflows", icon: Workflow },
      { label: "Paige Sub-Agents", href: "/admin/sub-agents", icon: Bot },
      { label: "Paige Skills", href: "/admin/skills", icon: Bot },
      { label: "Integrations", href: "/admin/integrations", icon: Plug },
    ],
    aliases: ["/admin/sub-agents", "/admin/skills", "/admin/integrations"],
  },
];
// God "More" menu — calendar setup, support, security, and the platform settings
// hub (comms/SMS, providers, branding). Calendar lives here rather than a full
// top-level tab: it's a setup tool, not a daily-driver, so the top bar stays
// focused on the operational essentials.
const GOD_MORE: MoreItem[] = [
  { label: "Calendar", href: "/admin/calendar", icon: CalendarDays },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  { label: "Security Canary", href: "/admin/security", icon: ShieldCheck },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];
// Scoped Platform Admins run the fleet — comms/campaigns/settings stay owner-only.
const GOD_STAFF_HUBS: Hub[] = [
  { label: "Fleet", href: "/admin/platform/tenants", icon: Building2 },
  { label: "Team", href: "/admin/platform/team", icon: UserCog },
];
const GOD_STAFF_MORE: MoreItem[] = [
  { label: "Calendar", href: "/admin/calendar", icon: CalendarDays },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  userRole: "admin" | "coach";
}

export function AdminLayout({ children, userRole }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { lens, setLens, canSwitch } = useRoleLens();
  const { hasBrokerAccess, profile: brokerProfile } = useBrokerProfile();
  const { isPlatformOwner, isPlatformStaff } = useTenantContext();
  // Platform staff (owner + Platform Admin) run the God console — its own nav of
  // fleet/platform concerns, not the agency CRM hubs.
  const godMode = isPlatformStaff;
  const activeHubs = godMode ? (isPlatformOwner ? GOD_HUBS : GOD_STAFF_HUBS) : hubs;
  const canAccessBrokerWorkspace = hasBrokerAccess && !!brokerProfile?.id;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { items: pendingApprovals } = usePendingApprovals({ scope: "all" });
  const pendingCount = pendingApprovals.length;
  // When a multi-hat user picks the Coach lens, treat the UI as coach-scoped
  // even if their real role is admin. Real permissions still come from RLS.
  const effectiveRole: "admin" | "coach" =
    userRole === "admin" && canSwitch && lens === "coach" ? "coach" : userRole;
  const visibleMore = godMode
    ? (isPlatformOwner ? GOD_MORE : GOD_STAFF_MORE)
    : moreNavItems.filter((i) => !i.adminOnly || effectiveRole === "admin");

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setMobileNavOpen(false);
    setIsSigningOut(true);
    await performSignOut("/");
  };




  const isActive = (href: string) => {
    if (href === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(href);
  };

  const currentSection = godMode
    ? (activeHubs.find((i) => isActive(i.href))?.label ?? "Platform")
    : (adminNavItems.find((i) => isActive(i.href))?.label ?? "Admin");

  return (
    <div className="min-h-dvh flex flex-col bg-background overflow-x-hidden">
      {/* Banner intentionally omitted on /admin — it's redundant when already on
          the admin dashboard. AppShell still renders it inside the client view. */}
      {/* Top bar — Pipedrive-style horizontal CRM nav */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground border-b border-sidebar-border">
        {/* Row 1: brand + utilities */}
        <div className="flex items-center justify-between gap-3 px-3 md:px-6 h-14">
          <Link to={godMode ? "/admin/platform/tenants" : "/admin"} className="flex items-center gap-2 min-w-0">
            <PaigeMark className="h-8 w-8 flex-shrink-0" />
            <span className="font-bold text-sm tracking-tight truncate">{PLATFORM.adminName}</span>
            {godMode ? (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex ml-2 text-[10px] font-medium uppercase tracking-wide border-accent/40 text-accent bg-transparent"
              >
                {isPlatformOwner ? "Operator" : "Platform Admin"}
              </Badge>
            ) : canSwitch ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden sm:inline-flex ml-2 items-center gap-1 rounded-full border border-accent/40 bg-transparent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent hover:bg-accent/10 transition-colors"
                    aria-label="Switch role lens"
                  >
                    {lens} lens
                    <ChevronDown className="w-3 h-3 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>View as</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLens("admin")} className={lens === "admin" ? "bg-muted" : ""}>
                    <UserCog className="w-4 h-4 mr-2" /> Admin lens
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLens("coach")} className={lens === "coach" ? "bg-muted" : ""}>
                    <Users className="w-4 h-4 mr-2" /> Coach lens
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex ml-2 text-[10px] font-medium capitalize border-accent/40 text-accent bg-transparent"
              >
                {userRole}
              </Badge>
            )}
          </Link>

          {/* Mobile: current section + menu trigger */}
          <div className="flex md:hidden items-center gap-2">
            <span className="text-sm font-medium truncate max-w-[140px]">{currentSection}</span>
            <button
              onClick={() => setMobileNavOpen((v) => !v)}
              className="p-1.5 rounded-md hover:bg-sidebar-accent/50"
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Desktop utilities */}
          <div className="hidden md:flex items-center gap-1">
            <TenantSwitcher />
            <AdminBridgeBell />




            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              disabled={isSigningOut}
              aria-label="Sign out"
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: 7-hub primary nav (desktop) */}
        <div className="hidden md:flex items-center gap-1 px-3 md:px-6 h-11 overflow-x-auto scrollbar-none border-t border-sidebar-border/60">
          {activeHubs.map((hub) => {
            const hubActive =
              isActive(hub.href) ||
              (hub.children?.some((c) => isActive(c.href)) ?? false) ||
              (hub.aliases?.some((a) => isActive(a)) ?? false);
            const showBadge =
              (hub.href === "/admin/tasks" || hub.children?.some((c) => c.href === "/admin/approvals")) &&
              pendingCount > 0;


            const pill = (
              <div
                className={`relative flex items-center gap-2 px-3 h-11 text-sm whitespace-nowrap transition-colors ${
                  hubActive
                    ? "text-accent font-medium"
                    : "text-primary-foreground/70 hover:text-primary-foreground"
                }`}
              >
                <hub.icon className="w-4 h-4" />
                <span>{hub.label}</span>
                {showBadge && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] bg-accent text-accent-foreground">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </Badge>
                )}
                {hub.children && <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
                {hubActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t-full" />
                )}
              </div>
            );

            if (!hub.children) {
              return (
                <Link key={hub.href} to={hub.href}>
                  {pill}
                </Link>
              );
            }

            return (
              <DropdownMenu key={hub.href}>
                <DropdownMenuTrigger asChild>
                  <button type="button">{pill}</button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>{hub.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hub.children.map((c) => (
                    <DropdownMenuItem
                      key={c.href}
                      onClick={() => navigate(c.href)}
                      className={isActive(c.href) ? "bg-muted" : ""}
                    >
                      <c.icon className="w-4 h-4 mr-2" />
                      {c.label}
                      {c.href === "/admin/approvals" && pendingCount > 0 && (
                        <Badge variant="secondary" className="ml-auto h-4 min-w-4 px-1 text-[10px] bg-accent text-accent-foreground">
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          {visibleMore.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-1.5 px-3 h-11 text-sm whitespace-nowrap transition-colors ${
                  visibleMore.some((i) => isActive(i.href))
                    ? "text-accent font-medium"
                    : "text-primary-foreground/70 hover:text-primary-foreground"
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
                <span>More</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Workspace tools</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleMore.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  className={isActive(item.href) ? "bg-muted" : ""}
                >
                  <item.icon className="w-4 h-4 mr-2" />
                  {item.label}
                </DropdownMenuItem>
              ))}
              {isPlatformOwner && !godMode && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Platform</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => navigate("/admin/platform/tenants")}
                    className={isActive("/admin/platform/tenants") ? "bg-muted" : ""}
                  >
                    <Building2 className="w-4 h-4 mr-2" />
                    Tenants
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/admin/platform/team")}
                    className={isActive("/admin/platform/team") ? "bg-muted" : ""}
                  >
                    <UserCog className="w-4 h-4 mr-2" />
                    Team
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </header>

      {/* Mobile dropdown drawer */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="relative z-10 bg-primary text-primary-foreground shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border">
              <span className="font-semibold text-sm">Menu</span>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-md hover:bg-sidebar-accent/50"
                aria-label="Close navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2">
              {activeHubs.map((hub) => (
                <div key={hub.href}>
                  <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/40">
                    {hub.label}
                  </div>
                  {(hub.children ?? [{ label: hub.label, href: hub.href, icon: hub.icon }]).map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                        isActive(item.href)
                          ? "bg-sidebar-accent text-accent font-medium"
                          : "text-primary-foreground/70 hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}

              {visibleMore.length > 0 && (
                <>
                  <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/40">
                    More
                  </div>
                  {visibleMore.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm ${
                        isActive(item.href)
                          ? "bg-sidebar-accent text-accent font-medium"
                          : "text-primary-foreground/70 hover:bg-sidebar-accent/50"
                      }`}
                    >
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  ))}
                </>
              )}


              <div className="mt-2 pt-2 border-t border-sidebar-border space-y-1">
                {/* Generic "Switch to Client View" removed — use Impersonate
                    from a specific contact's portal panel instead. */}
                {canAccessBrokerWorkspace && (
                  <button
                    onClick={() => { setMobileNavOpen(false); navigate("/broker/app"); }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-accent hover:bg-sidebar-accent/50"
                  >
                    <Building2 className="w-4 h-4" /> Broker Workspace
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-primary-foreground/80 hover:bg-sidebar-accent/50 disabled:opacity-60"
                >
                  <LogOut className="w-4 h-4" />
                  {isSigningOut ? "Signing Out..." : "Sign Out"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {children}
      </main>
    </div>
  );
}
