import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, BarChart3, Settings, LogOut,
  TrendingUp, Menu, BookOpen, Wrench, Share2, Briefcase, Brain, Building2, LifeBuoy,
  Contact, KanbanSquare, Inbox, CheckSquare, UserCog, ChevronDown, MoreHorizontal, X, Workflow, ClipboardCheck, Plug, Bot, Rocket, ShieldCheck, FileSignature, CalendarDays, CalendarClock, Store, Send, LayoutTemplate, Radio, Wand2, CircleUser, Sprout,
  type LucideIcon,
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
import { AccountSwitcher } from "@/components/admin/AccountSwitcher";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantFeature } from "@/hooks/useTenantFeature";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

import { useRoleLens } from "@/contexts/RoleLensContext";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { performSignOut } from "@/lib/auth/signOut";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PLATFORM } from "@/lib/platform/identity";
import { ThemeToggle } from "@/components/ThemeToggle";

// 7-hub top bar. Each hub has a primary route and optional sub-routes
// surfaced via a dropdown so power users can jump deep with one click.
// Every sub-route still has its own page — this is grouping, not consolidation.
type HubChild = { label: string; href: string; icon: LucideIcon };
type Hub = {
  label: string;
  href: string;
  icon: LucideIcon;
  children?: HubChild[];
  /** Extra path prefixes that should also highlight this hub. */
  aliases?: string[];
  /** §18 Playbook seam. Absent = universal (shown under every Playbook).
   *  "business" = this hub belongs to the BUSINESS Playbook only — a future
   *  household/portfolio Playbook would swap it for its own equivalent surface.
   *  Business is the only/default Playbook today, so the filter in `activeHubs`
   *  is a no-op; when Playbooks multiply, gate on the active Playbook there
   *  (one-line change), same shape as the funding filter. */
  playbook?: "business";
};

// The tenant top-nav — the 8-item target (Slice 1c-v). Five UNIVERSAL surfaces
// (Paige · Command Center · Marketplace · Analytics · Setup — work in any Paige-run
// context, §18 OS north-star) + three business-Playbook-specific surfaces
// (Clients · Team · Growth). Clients/Team/Setup are placeholder container LANDINGS
// this slice — their real sub-tab containers build in 1c-viii/ix/xi; until then each
// carries a §11 EmptyState with CTA links to the still-mounted surfaces it will
// absorb, so nothing is stranded (§11/§15). Every folded route stays mounted (no
// 404s); the `aliases` below keep the top-nav highlight + mobile title resolving
// when a tenant is on any absorbed surface.
const hubs: Hub[] = [
  // 1 — Paige (was "Your Paige"). URL STAYS /admin/playbook (ledger-drift avoidance).
  { label: "Paige", href: "/admin/playbook", icon: Bot, aliases: ["/admin/tenant-knowledge"] },
  // 2 — Command Center (was "Dashboard"). LABEL ONLY; content unchanged at /admin
  //     (the role-personalized reframe lands in 1c-vii).
  { label: "Command Center", href: "/admin", icon: BarChart3 },
  // 3 — Marketplace (universal OS App Store, §18 — repositioned to #3).
  { label: "Marketplace", href: "/admin/marketplace", icon: Store },
  // 4 — Clients (PLACEHOLDER landing; full container 1c-viii). Distinct route
  //     /admin/clients-hub so it NEVER hijacks the load-bearing /admin/clients
  //     client-file surface (B3). Aliases carry every folded client-facing surface.
  {
    label: "Clients",
    href: "/admin/clients-hub",
    icon: Users,
    aliases: [
      "/admin/clients", "/admin/contacts", "/admin/leads",
      "/admin/pipeline", "/admin/funding", "/admin/funding-pipeline", "/admin/funding-lens",
      "/admin/calendar", "/admin/bookings", "/admin/portal",
    ],
  },
  // 5 — Team (PLACEHOLDER landing; full live-ops floor 1c-ix). Also resolves the
  //     previously-dead /admin/team link (PaigeWhosHere "View all").
  {
    label: "Team",
    href: "/admin/team",
    icon: UserCog,
    aliases: ["/admin/members", "/admin/coaches"],
  },
  // 6 — Growth (unchanged from 1c-iv: keeps both children + the §18 playbook marker).
  {
    label: "Growth",
    href: "/admin/campaigns",
    icon: Sprout,
    playbook: "business",
    children: [
      { label: "Campaigns", href: "/admin/campaigns", icon: Rocket },
      { label: "Vibe Studio", href: "/admin/studio", icon: Wand2 },
    ],
    aliases: ["/admin/growth"],
  },
  // 7 — Analytics (was "Insights"). LABEL ONLY; content stays "Reports" at
  //     /admin/analytics (full tiered Analytics surface is 1c-x). The lone "Reports"
  //     child pointed at the hub's own href (already collapsed by activeHubs) — drop
  //     `children` so it renders as a plain link. Aliases preserved.
  { label: "Analytics", href: "/admin/analytics", icon: TrendingUp, aliases: ["/admin/observability"] },
  // 8 — Setup (PLACEHOLDER landing; full config/ops consolidation 1c-xi). Aliases
  //     carry every folded config/ops surface (Automation + its tools, agreements,
  //     support, maintenance, referrals, brokers, planning, settings).
  {
    label: "Setup",
    href: "/admin/setup",
    icon: Settings,
    aliases: [
      "/admin/settings",
      "/admin/workflows", "/admin/integrations", "/admin/sub-agents",
      "/admin/actions", "/admin/skills", "/admin/signatures", "/admin/social", "/admin/notifications",
      "/admin/agreement", "/admin/agreements", "/admin/support", "/admin/maintenance",
      "/admin/affiliates", "/admin/brokers", "/admin/planning", "/admin/tasks",
    ],
  },
];


// `MoreItem` type retained for the GOD_MORE / GOD_STAFF_MORE operator overflow
// arrays below. The TENANT "... More" overflow was DELETED in Slice 1c-v — its
// items re-home under the Setup landing (and Coaches/Members under Team), each
// reached via a §11 EmptyState CTA on the placeholder while its route stays
// mounted. Legal Documents was already operator/God from Slice 1c-i.
type MoreItem = HubChild & { adminOnly?: boolean; funding?: boolean };

const adminNavItems = hubs.flatMap((h) => [
  { label: h.label, href: h.href, icon: h.icon },
  ...(h.children ?? []),
]);

// The God console (platform staff) gets its own nav: platform control (Fleet,
// Team) + the operator's own business tools (contacts=agencies/prospects, comms,
// campaigns, AI automation, calendar). It deliberately omits the client-servicing
// hubs (Pipeline/Funding/credit) — those are agency-tier, not the platform's job.
const GOD_HUBS: Hub[] = [
  { label: "Fleet", href: "/admin/platform/tenants", icon: Building2 },
  { label: "Team", href: "/admin/platform/team", icon: UserCog },
  { label: "Intelligence", href: "/admin/platform/intelligence", icon: Brain },
  { label: "Contacts", href: "/admin/contacts", icon: Contact, aliases: ["/admin/leads"] },
  { label: "Calendar", href: "/admin/calendar", icon: CalendarDays, aliases: ["/admin/bookings"] },
  { label: "Planning", href: "/admin/planning", icon: CalendarClock, aliases: ["/admin/tasks"] },
  { label: "Inbox", href: "/admin/communications", icon: Inbox },
  { label: "Campaigns", href: "/admin/campaigns", icon: Rocket, aliases: ["/admin/growth"] },
  {
    label: "Automation",
    href: "/admin/workflows",
    icon: Workflow,
    children: [
      { label: "Workflows", href: "/admin/workflows", icon: Workflow },
      { label: "Paige Sub-Agents", href: "/admin/sub-agents", icon: Bot },
      { label: "Paige Actions", href: "/admin/actions", icon: ClipboardCheck },
      { label: "Paige Skills", href: "/admin/skills", icon: Bot },
      { label: "Integrations", href: "/admin/integrations", icon: Plug },
      // Platform-level knowledge surfaces (§9) — the global canon plus the
      // review queues that approve tenant-shared docs into it. These stay
      // operator-only; tenants get their own KB + contribution status inside
      // Your Paige.
      { label: "Knowledge Base", href: "/admin/knowledge-base", icon: Brain },
      { label: "Network Review", href: "/admin/network-kb", icon: BookOpen },
      { label: "Review Queue", href: "/admin/knowledge", icon: BookOpen },
    ],
    aliases: ["/admin/sub-agents", "/admin/actions", "/admin/skills", "/admin/integrations", "/admin/knowledge-base", "/admin/network-kb", "/admin/knowledge"],
  },
];
// God "More" menu — calendar setup, support, security, and the platform settings
// hub (comms/SMS, providers, branding). Calendar lives here rather than a full
// top-level tab: it's a setup tool, not a daily-driver, so the top bar stays
// focused on the operational essentials.
const GOD_MORE: MoreItem[] = [
  { label: "Sends & Tier", href: "/admin/platform/sends", icon: Radio },
  { label: "Sending Identities", href: "/admin/platform/sending", icon: Send },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  { label: "Affiliates", href: "/admin/platform/affiliates", icon: Share2 },
  { label: "Usage Analytics", href: "/admin/observability/usage", icon: TrendingUp },
  { label: "Error Tracking", href: "/admin/observability/errors", icon: LifeBuoy },
  { label: "Legal Documents", href: "/admin/legal", icon: ShieldCheck },
  { label: "Security Canary", href: "/admin/security", icon: ShieldCheck },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];
// Scoped Platform Admins run the fleet — comms/campaigns/settings stay owner-only.
const GOD_STAFF_HUBS: Hub[] = [
  { label: "Fleet", href: "/admin/platform/tenants", icon: Building2 },
  { label: "Team", href: "/admin/platform/team", icon: UserCog },
  { label: "Intelligence", href: "/admin/platform/intelligence", icon: Brain },
  { label: "Calendar", href: "/admin/calendar", icon: CalendarDays, aliases: ["/admin/bookings"] },
  { label: "Planning", href: "/admin/planning", icon: CalendarClock, aliases: ["/admin/tasks"] },
];
const GOD_STAFF_MORE: MoreItem[] = [];

interface AdminLayoutProps {
  children: React.ReactNode;
  userRole: "admin" | "coach";
}

export function AdminLayout({ children, userRole }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  // Vibe Studio is its own immersive room (owner: Antonio, 2026-07-16): the admin top nav +
  // mobile drawer step aside and StudioLayout owns the whole viewport with its own left rail.
  // Covers the bare home (exact) AND every builder sub-route. No effect on any other route.
  const isStudio =
    location.pathname === "/admin/studio" || location.pathname.startsWith("/admin/studio/");
  const { lens, setLens, canSwitch } = useRoleLens();
  const { hasBrokerAccess, profile: brokerProfile } = useBrokerProfile();
  const { isPlatformOwner, isPlatformStaff } = useTenantContext();
  // Funding surfaces are an opt-in tenant offer (§2/§9) — hidden unless this
  // tenant has chosen the funding preset (which flips the funding_readiness
  // feature). Generic coaching/consulting/agency tenants never see them.
  const { enabled: fundingEnabled } = useTenantFeature("funding_readiness");
  // Platform staff (owner + Platform Admin) run the God console — its own nav of
  // fleet/platform concerns, not the agency CRM hubs.
  const godMode = isPlatformStaff;
  // The agency operator side is its OWN top-level shell (`/agency`, §9), reached
  // through the AccountSwitcher's "Agency view" row — it is no longer a tab spliced
  // into the tenant menu. This bar is purely "run this one practice."
  const FUNDING_NAV_HREFS = new Set(["/admin/funding", "/admin/funding-pipeline", "/admin/funding-lens"]);
  // §18 Playbook seam: business is the only Playbook today, so this is a no-op.
  // When Playbooks multiply, resolve the active Playbook here and any playbook-scoped
  // hub (e.g. Growth) filters out for tenants not running it — same shape as the
  // fundingEnabled filter below. One-line change, no engine.
  const activePlaybook: Hub["playbook"] = "business";
  const activeHubs = (godMode ? (isPlatformOwner ? GOD_HUBS : GOD_STAFF_HUBS) : hubs)
    .filter((h) => !h.playbook || h.playbook === activePlaybook)
    .map((h) =>
      fundingEnabled ? h : { ...h, children: h.children?.filter((c) => !FUNDING_NAV_HREFS.has(c.href)) },
    )
    // Collapse a dropdown that no longer earns its caret: once funding surfaces are
    // filtered out, Pipeline (and any hub) can be left with zero children or a single
    // child that just points back at the hub's own page. A one-item menu to the same
    // route is pointless UI — strip `children` so the hub renders as a plain direct
    // link. Hubs with a genuinely distinct second child (Contacts, Automation, Insights)
    // keep their dropdown untouched.
    .map((h) => {
      const kids = h.children;
      if (!kids || kids.length === 0) return { ...h, children: undefined };
      if (kids.length === 1 && kids[0].href === h.href) return { ...h, children: undefined };
      return h;
    });
  const canAccessBrokerWorkspace = hasBrokerAccess && !!brokerProfile?.id;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  // Publish this staff member's live presence while they're in the admin
  // workspace (#148). The heartbeat self-resolves auth.uid() server-side.
  usePresenceHeartbeat(true);
  // When a multi-hat user picks the Coach lens, treat the UI as coach-scoped
  // even if their real role is admin. Real permissions still come from RLS.
  const effectiveRole: "admin" | "coach" =
    userRole === "admin" && canSwitch && lens === "coach" ? "coach" : userRole;
  // The tenant "... More" overflow was deleted in Slice 1c-v — its items re-home
  // under the Setup/Team landings. Only the God console still carries a More group.
  const visibleMore = godMode
    ? (isPlatformOwner ? GOD_MORE : GOD_STAFF_MORE)
    : [];

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

  // Alias-aware hub match — the single source of truth for BOTH the desktop
  // highlight and the mobile section title, so a folded surface reached via a
  // placeholder CTA (e.g. /admin/contacts) still lights up its parent (Clients)
  // and resolves a real title instead of the "Admin" fallback (Slice 1c-v).
  const hubIsActive = (hub: Hub) =>
    isActive(hub.href) ||
    (hub.children?.some((c) => isActive(c.href)) ?? false) ||
    (hub.aliases?.some((a) => isActive(a)) ?? false);

  const currentSection = godMode
    ? (activeHubs.find(hubIsActive)?.label ?? "Platform")
    : (adminNavItems.find((i) => isActive(i.href))?.label
        ?? activeHubs.find(hubIsActive)?.label
        ?? "Admin");

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Banner intentionally omitted on /admin — it's redundant when already on
          the admin dashboard. AppShell still renders it inside the client view. */}
      {/* Top bar — Pipedrive-style horizontal CRM nav. Hidden on Vibe Studio (immersive room). */}
      {!isStudio && (
      <header className="shrink-0 z-40 bg-primary text-primary-foreground border-b border-sidebar-border">
        {/* Row 1: brand + utilities */}
        <div className="flex items-center justify-between gap-3 px-3 md:px-6 h-14">
          <Link to={godMode ? "/admin/platform/tenants" : "/admin"} className="flex items-center gap-2 min-w-0">
            <PaigeMark className="h-8 w-8 flex-shrink-0" />
            <span className="font-bold text-sm tracking-tight truncate">{PLATFORM.adminName}</span>
            {/* Passive identity chip only. The multi-hat "View as" switcher used
                to live here as a DropdownMenu nested INSIDE this <Link> — its
                trigger click bubbled to the anchor and navigated. It's relocated
                to the header profile dropdown per handoff §4 (Slice 1c-iii); the
                chip that hosted it was a switcher affordance, not a lens-status
                indicator, so nothing ambient is lost for the canSwitch case. */}
            {godMode ? (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex ml-2 text-[10px] font-medium uppercase tracking-wide border-accent/40 text-accent bg-transparent"
              >
                {isPlatformOwner ? "Operator" : "Platform Admin"}
              </Badge>
            ) : !canSwitch ? (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex ml-2 text-[10px] font-medium capitalize border-accent/40 text-accent bg-transparent"
              >
                {userRole}
              </Badge>
            ) : null}
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
            {/* Agency-owner-only sub-account switcher (§9). Self-gates: renders
                null unless the caller owns/admins an agency, so a plain
                sub-account user never sees it. */}
            <AccountSwitcher />
            {/* God-level "active tenant / all tenants" filter — lives ONLY in the
                God console header. Tenant and agency shells use the one
                AccountSwitcher above. */}
            {godMode && <TenantSwitcher />}
            <AdminBridgeBell />
            <ThemeToggle variant="on-primary" />

            {/* Profile dropdown (Slice 1c-iii): identity + View-as (relocated) +
                Workspace settings (admin-only) + Sign out. Replaces the bare
                Sign-out icon. Personal settings + Help/Docs are intentionally
                omitted — no destination exists yet (filed follow-ups); shipping
                them would be dead links (§11/§13). */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Account menu"
                  className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
                >
                  <CircleUser className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>

              {godMode ? (
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal text-muted-foreground">Platform</span>
                    <span>{isPlatformOwner ? "Operator" : "Platform Admin"}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {isSigningOut ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              ) : (
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="text-xs font-normal text-muted-foreground">Signed in as</span>
                    <span className="capitalize">{userRole}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  {canSwitch && (
                    <>
                      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        View as
                      </DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setLens("admin")} className={lens === "admin" ? "bg-muted" : ""}>
                        <UserCog className="w-4 h-4 mr-2" /> Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setLens("coach")} className={lens === "coach" ? "bg-muted" : ""}>
                        <Users className="w-4 h-4 mr-2" /> Coach
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {effectiveRole === "admin" && (
                    <>
                      <DropdownMenuItem
                        onClick={() => navigate("/admin/settings")}
                        className={isActive("/admin/settings") ? "bg-muted" : ""}
                      >
                        <Settings className="w-4 h-4 mr-2" /> Workspace settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  <DropdownMenuItem onClick={handleSignOut} disabled={isSigningOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {isSigningOut ? "Signing out…" : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: 7-hub primary nav (desktop) */}
        <div className="hidden md:flex items-center gap-1 px-3 md:px-6 h-11 overflow-x-auto no-scrollbar border-t border-sidebar-border/60">
          {activeHubs.map((hub) => {
            const hubActive = hubIsActive(hub);

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
              {/* Platform Fleet/Team are God-console-only (§9) — they used to be
                  appended here into the tenant "More" group, which duplicated the
                  God nav into a tenant surface. Removed; the operator reaches them
                  via the God console. */}
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </header>
      )}

      {/* Mobile dropdown drawer */}
      {!isStudio && mobileNavOpen && (
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
                {/* Workspace settings: relocated off the desktop "More" overflow
                    into the profile dropdown (Slice 1c-iii); the mobile drawer
                    keeps a direct admin-gated link so /admin/settings stays
                    reachable without a mobile profile menu. */}
                {effectiveRole === "admin" && (
                  <button
                    onClick={() => { setMobileNavOpen(false); navigate("/admin/settings"); }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-primary-foreground/80 hover:bg-sidebar-accent/50"
                  >
                    <Settings className="w-4 h-4" /> Workspace settings
                  </button>
                )}
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
      <main
        className={
          // Vibe Studio (home AND builder) is an immersive full-bleed room — StudioLayout owns
          // the viewport, its own left rail, and all internal scroll. `overflow-hidden` lets its
          // h-full/min-h-0 resolve against this flex-1 main inside the h-dvh column. Every other
          // route keeps the exact padded, scrollable content well it had before.
          isStudio
            ? "flex-1 overflow-hidden"
            : `flex-1 overflow-y-auto overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+1rem)] p-3 sm:p-4 md:p-6`
        }
      >
        {children}
      </main>
    </div>
  );
}
