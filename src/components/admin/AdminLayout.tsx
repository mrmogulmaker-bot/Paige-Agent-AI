import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, BarChart3, Settings, LogOut,
  TrendingUp, Menu, BookOpen, Wrench, Ticket, Briefcase, Brain, Building2, LifeBuoy,
  KanbanSquare, CheckSquare, UserCog, ChevronDown, MoreHorizontal, X, Plug, Bot, Rocket, ShieldCheck, FileSignature, Store, Send, LayoutTemplate, Radio, Wand2, CircleUser, Sprout,
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
import { OperatorHubStrip } from "@/components/admin/platform/OperatorTabs";
import { AdminBridgeBell } from "@/components/admin/AdminBridgeBell";
import { VoiceDeviceProvider } from "@/lib/voice/VoiceDeviceProvider";
import { DialPadTrigger } from "@/components/admin/voice/DialPadTrigger";
import { DialPadSurface } from "@/components/admin/voice/DialPadSurface";
import { IncomingCallOverlay } from "@/components/admin/voice/IncomingCallOverlay";
import { LiveTranscriptPanel } from "@/components/admin/voice/LiveTranscriptPanel";
import { AdminViewBanner } from "@/components/admin/AdminViewBanner";
import { TenantSwitcher } from "@/components/admin/TenantSwitcher";
import { AccountSwitcher } from "@/components/admin/AccountSwitcher";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTenantFeature } from "@/hooks/useTenantFeature";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";

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
  /** §13/§36: this destination renders an honest in-development placeholder, not a
   *  live surface. Marks the nav item with a "Soon" pill so a live-looking tab never
   *  dead-ends into "In active development" with no warning. */
  comingSoon?: boolean;
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
  //     Sub-Agents / Actions / Skills are now Paige sub-tabs (1c-vi), so the top-nav
  //     highlights Paige on those paths too.
  { label: "Paige", href: "/admin/playbook", icon: Bot, aliases: ["/admin/tenant-knowledge", "/admin/sub-agents", "/admin/actions", "/admin/skills"] },
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
      "/admin/calendar", "/admin/bookings", "/admin/clients-hub/portal",
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
      // sub-agents/actions/skills moved to the Paige hub aliases (1c-vi).
      "/admin/workflows", "/admin/integrations", "/admin/signatures", "/admin/social", "/admin/notifications",
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
type MoreItem = HubChild & { adminOnly?: boolean; funding?: boolean; comingSoon?: boolean };

const adminNavItems = hubs.flatMap((h) => [
  { label: h.label, href: h.href, icon: h.icon },
  ...(h.children ?? []),
]);

// The operator (God) console nav — the OPERATOR-ONLY surface set (Super Admin
// restructure, Option B). Selecting "Platform" in the top-right TenantSwitcher
// puts a platform-staff user here; selecting any tenant drops them into the
// UNCHANGED tenant `hubs` array above (the §45 dogfood — one home per capability,
// §18). This set deliberately DROPS the tenant-business hubs it used to carry
// (Contacts, Calendar, Planning, Inbox, Campaigns, Automation) — those live in
// tenant mode now; their routes stay mounted (no 404s), only the operator nav
// items move. LEAN top bar (§11/§67): five hubs — the platform-control trio
// (Fleet · Team · Intelligence) plus the two non-owner-restricted new surfaces
// (Marketplace · Analytics). Owner-only new console surfaces route through
// GOD_MORE below.
// The operator (God) console nav — restructured into 7 hub-and-sub-tab destinations
// mirroring the TENANT hub pattern (Clients → People/Pipeline/…). The old 16-item
// "Workspace tools" overflow ("More" dropdown) is DELETED; every destination now lands
// under exactly ONE hub, its sub-tabs surfaced by a gate-aware *SubTabs strip (the proven
// ClientsSubTabs primitive, §18 reuse) below the hub bar — never a junk-drawer dropdown.
// Hubs carry `aliases` so the top-bar highlight follows onto any sub-tab path (hubIsActive).
const GOD_HUBS: Hub[] = [
  // 1 — Paige. Reuses the existing PaigeTabsLayout strip (Chat · Sub-Agents · Actions ·
  //     Skills). Aliases carry the three absorbed leaves so Paige highlights on them.
  { label: "Paige", href: "/admin/playbook", icon: Bot,
    aliases: ["/admin/sub-agents", "/admin/actions", "/admin/skills"] },
  // 2 — Fleet. Absorbs the standalone Team hub + Deploy Health.
  { label: "Fleet", href: "/admin/platform/tenants", icon: Building2,
    aliases: ["/admin/platform/team", "/admin/platform/deploy-health"] },
  // 3 — Intelligence. Live Activity index + the model/money/forge/defaults/usage tools.
  { label: "Intelligence", href: "/admin/platform/intelligence", icon: Brain,
    aliases: [
      "/admin/platform/money", "/admin/platform/model-router",
      "/admin/platform/prompt-forge", "/admin/platform/content-defaults",
      "/admin/observability/usage",
    ] },
  // 4 — Compliance. Compliance + Doctrine (owner) + Legal/Security/Error (staff).
  { label: "Compliance", href: "/admin/platform/compliance", icon: ShieldCheck,
    aliases: [
      "/admin/platform/doctrine", "/admin/legal",
      "/admin/security", "/admin/observability/errors",
    ] },
  // 5 — Marketplace (fleet-wide moderation/revenue). In development → "Soon"; no strip yet.
  { label: "Marketplace", href: "/admin/platform/marketplace", icon: Store, comingSoon: true },
  // 6 — Analytics (fleet funnel/conversion). In development → "Soon"; no strip yet.
  { label: "Analytics", href: "/admin/platform/analytics", icon: TrendingUp, comingSoon: true },
  // 7 — Settings. Platform config + invites + support + send pipes/identities.
  { label: "Settings", href: "/admin/platform/settings", icon: Settings,
    aliases: [
      "/admin/platform/invites", "/admin/support",
      "/admin/platform/sends", "/admin/platform/sending",
    ] },
];
// Scoped Platform Admins run the fleet at a minimal tier. They see the SAME 7 hubs —
// the gate-aware *SubTabs strips filter owner-only sub-tabs out per-tab (canSee), and a
// strip with ≤1 visible tab hides itself, so staff automatically get the lean subset with
// no separate array to drift. The ONLY divergence is the Compliance hub's default href:
// GOD_HUBS points it at the owner-only /admin/platform/compliance overview, which would
// show a "Restricted area" card to staff — so staff land on the first staff-visible tab
// (/admin/legal) instead. All owner-only console surfaces (Money Spine, Doctrine,
// Prompt-Forge, Compliance overview, Content Defaults, Deploy Health) stay off the staff
// strips via canSee AND are enforced owner-only server-side by PlatformOwnerOnly (§9).
const GOD_STAFF_HUBS: Hub[] = [
  { label: "Paige", href: "/admin/playbook", icon: Bot,
    aliases: ["/admin/sub-agents", "/admin/actions", "/admin/skills"] },
  { label: "Fleet", href: "/admin/platform/tenants", icon: Building2,
    aliases: ["/admin/platform/team", "/admin/platform/deploy-health"] },
  { label: "Intelligence", href: "/admin/platform/intelligence", icon: Brain,
    aliases: [
      "/admin/platform/money", "/admin/platform/model-router",
      "/admin/platform/prompt-forge", "/admin/platform/content-defaults",
      "/admin/observability/usage",
    ] },
  // Staff land on Legal (their first visible Compliance tab), NOT the owner-only overview.
  { label: "Compliance", href: "/admin/legal", icon: ShieldCheck,
    aliases: [
      "/admin/platform/compliance", "/admin/platform/doctrine",
      "/admin/security", "/admin/observability/errors",
    ] },
  { label: "Marketplace", href: "/admin/platform/marketplace", icon: Store, comingSoon: true },
  { label: "Analytics", href: "/admin/platform/analytics", icon: TrendingUp, comingSoon: true },
  { label: "Settings", href: "/admin/platform/settings", icon: Settings,
    aliases: [
      "/admin/platform/invites", "/admin/support",
      "/admin/platform/sends", "/admin/platform/sending",
    ] },
];

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
  // Clients Hub owns a nested tab shell. Keep the viewport height on this main
  // flex item and let each child surface choose its one scroll owner; padding
  // belongs inside ClientsTabsLayout so a negative-margin compensation is never needed.
  const isClientsHub = location.pathname.startsWith("/admin/clients-hub");
  const { hasBrokerAccess, profile: brokerProfile } = useBrokerProfile();
  const { isPlatformOwner, isPlatformStaff, activeTenantId, activeTenant } = useTenantContext();
  // Funding surfaces are an opt-in tenant offer (§2/§9) — hidden unless this
  // tenant has chosen the funding preset (which flips the funding_readiness
  // feature). Generic coaching/consulting/agency tenants never see them.
  const { enabled: fundingEnabled } = useTenantFeature("funding_readiness");
  // Option B — the top-right TenantSwitcher IS the mode switch. Platform staff are
  // in OPERATOR mode (the God console) ONLY while no tenant is selected; the moment
  // they pick a tenant, godMode flips false and the UNCHANGED tenant `hubs` render
  // (the §45 dogfood — same tenant IA a real tenant sees). The switcher stays
  // visible in BOTH modes (rendered below on isPlatformStaff) so "Platform" is
  // always one click away. NOTE (§9): this gate is PRESENTATION only — the real
  // authorization boundary is the server-side PlatformStaffOnly route wrappers +
  // RLS; tenant_id is always server-derived, never trusted from the client.
  const godMode = isPlatformStaff && activeTenantId === null;
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
  // #219 "Role IS the view": a user's view is a function of the roles they hold —
  // there is no manual "View as" lens. effectiveRole is simply the caller-resolved
  // role (a multi-hat admin+coach resolves to the admin superset and sees the union).
  // Real permissions always come from RLS. (Per-role "customize view" is the gated
  // §219-B Roles slice; richer multi-role identity display lands there too.)
  const effectiveRole: "admin" | "coach" = userRole;
  // Both the tenant "... More" overflow (Slice 1c-v) AND the God console "Workspace
  // tools" overflow (Finding 4) are now DELETED — every operator destination re-homes
  // under one of the 7 hubs + its gate-aware sub-tab strip. No surface uses the More
  // dropdown anymore; keep the empty list so the (now dead) dropdown JSX self-removes
  // via its `visibleMore.length > 0` guard.
  const visibleMore: MoreItem[] = [];

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
    ? (activeHubs.find(hubIsActive)?.label
        ?? visibleMore.find((i) => isActive(i.href))?.label
        ?? "Platform")
    : (adminNavItems.find((i) => isActive(i.href))?.label
        ?? activeHubs.find(hubIsActive)?.label
        ?? "Admin");

  return (
    <VoiceDeviceProvider>
    {/* #140 A2 — the ONE dialer surface (a viewport Sheet), rendered once so every
        trigger + click-to-call opens the SAME pad on ANY breakpoint (§18). */}
    <DialPadSurface />
    {/* #140 A3 — the ONE inbound ringing overlay. Rendered once so an incoming call
        pops the same accept/reject surface on ANY route/breakpoint (§18/§47). */}
    <IncomingCallOverlay />
    {/* #140 B2 — the ONE live-call co-pilot transcript panel. Rendered once so it
        appears on ANY surface the moment a call goes live (§18/§47/§48). */}
    <LiveTranscriptPanel />
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      {/* Banner intentionally omitted on /admin — it's redundant when already on
          the admin dashboard. AppShell still renders it inside the client view. */}
      {/* Top bar — Pipedrive-style horizontal CRM nav. Hidden on Vibe Studio (immersive room). */}
      {!isStudio && (
      <header className="shrink-0 z-40 bg-primary text-primary-foreground border-b border-sidebar-border">
        {/* Elevated-mode signal (§11 — gold spent on the "on" state): a thin gold
            top edge shown ONLY in operator mode. In tenant mode it's absent, so the
            header reads as ordinary tenant chrome. Not a resting decoration — it
            marks the active elevated platform mode. */}
        {godMode && <div className="h-0.5 w-full bg-accent" aria-hidden />}
        {/* Row 1: brand + utilities */}
        <div className="flex items-center justify-between gap-3 px-3 md:px-6 h-14">
          <Link to="/admin" className="flex items-center gap-2 min-w-0">
            <PaigeMark className="h-8 w-8 flex-shrink-0" />
            <span className="font-bold text-sm tracking-tight truncate">{PLATFORM.adminName}</span>
            {/* Passive identity chip only — shows the caller's role. #219 "role IS
                the view" removed the "View as" lens switcher entirely; this is a
                plain status indicator, never an affordance. */}
            {godMode ? (
              <>
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex ml-2 text-[10px] font-medium uppercase tracking-wide border-accent/40 text-accent bg-transparent"
                >
                  {isPlatformOwner ? "Operator" : "Platform Admin"}
                </Badge>
                {/* Explicit mode label (§36 — self-explanatory). Gold lives on the
                    band/pill; this text stays neutral. */}
                <span className="hidden lg:inline ml-1.5 text-[10px] text-primary-foreground/50">
                  Platform view
                </span>
              </>
            ) : isPlatformStaff && activeTenant ? (
              // Tenant mode for a platform-staff user: neutral tenant chrome (the
              // tenant's name), NO gold — gold is reserved for the elevated mode.
              <Badge
                variant="outline"
                className="hidden sm:inline-flex ml-2 max-w-[160px] truncate text-[10px] font-medium border-primary-foreground/30 text-primary-foreground/70 bg-transparent"
              >
                {activeTenant.name}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex ml-2 text-[10px] font-medium capitalize border-accent/40 text-accent bg-transparent"
              >
                {userRole}
              </Badge>
            )}
          </Link>

          {/* Mobile: current section + dialer + menu trigger */}
          <div className="flex md:hidden items-center gap-2">
            <span className="text-sm font-medium truncate max-w-[120px]">{currentSection}</span>
            {/* #140 A2 — dialer reachable on mobile too (§36). Same shared pad Sheet
                as desktop; click-to-call from a contact row on a phone opens a real,
                dismissible pad, not a detached popover. */}
            <DialPadTrigger />
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
            {/* The mode switch (Option B). Visible for ALL platform staff in BOTH
                modes — NOT gated on godMode, or picking a tenant would make it
                vanish and trap the user in tenant mode with no way back to
                "Platform". Regular tenant/agency shells use the AccountSwitcher
                above; this one is platform-staff only. */}
            {isPlatformStaff && <TenantSwitcher />}
            {/* #140 A2 — the ONE global dialer trigger (§18/§21). Drives the single
                Device in VoiceDeviceProvider; click-to-call anywhere pops this pad. */}
            <DialPadTrigger />
            <AdminBridgeBell />
            <ThemeToggle variant="on-primary" />

            {/* Profile dropdown (Slice 1c-iii): identity + Workspace settings
                (admin-only) + Sign out. Replaces the bare Sign-out icon. The
                "View as" lens switcher was removed (#219 "role IS the view").
                Personal settings + Help/Docs are intentionally omitted — no
                destination exists yet (filed follow-ups); shipping them would be
                dead links (§11/§13). */}
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
                {hub.comingSoon && (
                  <span className="rounded-full bg-primary-foreground/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary-foreground/65">
                    Soon
                  </span>
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
                  <span className="flex-1">{item.label}</span>
                  {item.comingSoon && (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  )}
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

      {/* Operator hub sub-tab strip (Finding 4) — sits directly beneath the dark hub bar
          on desktop, mirroring the tenant sub-tab strips. Self-hides outside godMode and
          on hubs without a strip (Paige has its own via PaigeTabsLayout; Marketplace /
          Analytics are bare). Desktop-only, matching the row-2 hub bar (mobile uses the drawer). */}
      {!isStudio && (
        <div className="hidden md:block shrink-0">
          <OperatorHubStrip />
        </div>
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
              {/* Mode switch on mobile (§36 — the switch must be reachable on EVERY
                  surface, or a staff user with a persisted active tenant is trapped
                  in tenant mode on a phone with no way back to Platform). Same control
                  as the desktop utilities row; the dropdown portals above the drawer. */}
              {isPlatformStaff && (
                <div className="px-1 pb-2 mb-1 border-b border-sidebar-border">
                  <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/40">
                    Mode
                  </div>
                  <TenantSwitcher />
                </div>
              )}
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
                      <span className="flex-1">{item.label}</span>
                      {hub.comingSoon && (
                        <span className="rounded-full bg-primary-foreground/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary-foreground/65">
                          Soon
                        </span>
                      )}
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
                      <span className="flex-1">{item.label}</span>
                      {item.comingSoon && (
                        <span className="rounded-full bg-primary-foreground/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-primary-foreground/65">
                          Soon
                        </span>
                      )}
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
          // Immersive Studio and the nested Clients Hub each own their internal
          // height/scroll contract. Every other route keeps the padded document
          // scroller. min-h-0 is required so every flex child may actually shrink.
          isStudio
            ? "min-h-0 flex-1 overflow-hidden"
            : isClientsHub
              ? "min-h-0 flex-1 overflow-hidden"
              : `min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[calc(env(safe-area-inset-bottom)+1rem)] p-3 sm:p-4 md:p-6`
        }
      >
        {children}
      </main>
    </div>
    </VoiceDeviceProvider>
  );
}
