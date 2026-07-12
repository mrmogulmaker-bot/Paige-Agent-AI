import { Link, useLocation, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, BookOpen, Settings, LogOut, User as UserIcon, Menu, ArrowLeft, MessageCircle, Eye, LifeBuoy, ListChecks, ClipboardList, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useEffect, useState } from "react";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import { supabase } from "@/integrations/supabase/client";
import { performSignOut, customerSignOutTarget, cachePortalSlug } from "@/lib/auth/signOut";
import { useUnreadSupportCount } from "@/hooks/useUnreadSupportCount";
import { isAvatarBucketUrl } from "@/components/ui/avatar-uploader";
import { usePlaybook } from "@/lib/playbook";
import paigeLogoTransparent from "@/assets/paige-logo-transparent.png";

// The client portal nav is driven by the active Playbook's portal.modules
// (coaching default — no credit/funding language). Each module key is rendered
// ONLY if it maps to a route that actually exists, so a module the app can't
// route to is hidden rather than shipped as a dangling link. Credit / funding /
// financial-profile / disputes are absent from the coaching module set, so a
// coaching client never sees them.
const MODULE_ROUTES: Record<string, { href: string; icon: LucideIcon }> = {
  home: { href: "/app", icon: Home },
  learn: { href: "/app/learn", icon: BookOpen },
  resources: { href: "/app/learn", icon: BookOpen },
  approvals: { href: "/app/approvals", icon: ListChecks },
  actions: { href: "/app/actions", icon: ClipboardList },
  planning: { href: "/app/planning", icon: CalendarClock },
};

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface AppNavProps {
  user: User;
}

export function AppNav({ user }: AppNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { isCoachOrAdmin, isAdmin, mode, setMode } = useDashboardMode();
  const { count: unreadSupport } = useUnreadSupportCount(user.id);
  const pb = usePlaybook();
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setAvatarUrl((data as any)?.avatar_url || ""); });
    return () => { cancelled = true; };
  }, [user.id]);
  const avatarNode = isAvatarBucketUrl(avatarUrl)
    ? <img src={avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
    : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-accent"><UserIcon className="w-3.5 h-3.5" /></span>;

  // Cache this customer's portal slug so an involuntary logout (session expiry,
  // forced sign-out) can still return them to their tenant gateway, not the
  // Paige page (§9). No-ops for staff (get_client_portal_brand returns no row).
  useEffect(() => {
    if (isCoachOrAdmin) return;
    supabase.rpc("get_client_portal_brand").then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      cachePortalSlug((row as { tenant_slug?: string } | null)?.tenant_slug ?? null);
    }).catch(() => { /* non-blocking */ });
  }, [isCoachOrAdmin]);

  // Visible nav = the active Playbook's portal modules, filtered to those with a
  // real route. Labels come straight from the Playbook (neutral coaching copy).
  const navItems: NavItem[] = pb.portal.modules
    .map((m) => {
      const route = MODULE_ROUTES[m.key];
      return route ? { label: m.label, href: route.href, icon: route.icon } : null;
    })
    .filter((item): item is NavItem => item !== null);

  // "Action items" is the customer's side of the two-way action bus (§8) — a core
  // portal surface every client gets, regardless of what their Playbook's module
  // list happens to include. Slot it right after Home.
  if (!isCoachOrAdmin && !navItems.some((i) => i.href === "/app/actions")) {
    const homeIdx = navItems.findIndex((i) => i.href === "/app");
    navItems.splice(homeIdx >= 0 ? homeIdx + 1 : 0, 0, {
      label: "Action items", href: "/app/actions", icon: ClipboardList,
    });
  }

  // Planning is the Task Manager — where every reminder/task/milestone Paige
  // sets actually lives, and the landing spot for a fired reminder's
  // notification. Staff always get it (plan_list is tenant-member scoped, so a
  // pure client can't use it yet — the client view ships separately).
  if (isCoachOrAdmin && !navItems.some((i) => i.href === "/app/planning")) {
    navItems.push({ label: "Planning", href: "/app/planning", icon: CalendarClock });
  }

  const userRoleLabel = isAdmin ? "Admin" : isCoachOrAdmin ? "Coach" : "Client";
  const isViewingAsClient = isCoachOrAdmin && mode === "client";

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setMobileMenuOpen(false);
    setIsSigningOut(true);
    // Customers land back on their coach's branded gateway; staff exit to root.
    const target = await customerSignOutTarget("/");
    await performSignOut(target);
  };

  if (isMobile) {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground border-b border-border">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-light">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-primary text-primary-foreground w-64 p-0">
            <div className="p-4 border-b border-sidebar-border">
              <img src={paigeLogoTransparent} alt="PaigeAgent.ai" className="h-8" />
            </div>
            <nav className="p-2 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => { navigate(item.href); setMobileMenuOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    location.pathname === item.href
                      ? "bg-sidebar-accent text-accent"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
              <button
                onClick={() => { navigate("/app/support"); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <LifeBuoy className="w-4 h-4" />
                <span className="flex-1 text-left">Support</span>
                {unreadSupport > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                    {unreadSupport > 9 ? "9+" : unreadSupport}
                  </span>
                )}
              </button>
              <button
                onClick={() => { navigate("/app/settings"); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <div className="border-t border-sidebar-border my-2" />
              <button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" />
                {isSigningOut ? "Signing Out..." : "Sign Out"}
              </button>
            </nav>
          </SheetContent>
        </Sheet>

        <span className="font-bold text-base sm:text-lg truncate">PaigeAgent</span>

        <div className="flex items-center gap-1">
          <NotificationBell />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-6 py-2 bg-primary text-primary-foreground border-b border-sidebar-border">
      <div className="flex items-center gap-8">
        <Link to="/app" className="flex items-center gap-2">
          <img src={paigeLogoTransparent} alt="PaigeAgent.ai" className="h-7" />
        </Link>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                location.pathname === item.href
                  ? "bg-sidebar-accent text-accent font-medium"
                  : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-[10px] font-medium capitalize border-accent/30 text-accent hidden sm:inline-flex">
          {userRoleLabel}
        </Badge>

        {isViewingAsClient && (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50 gap-1.5 text-xs"
            onClick={() => { setMode("internal"); navigate("/admin"); }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Exit Client View
          </Button>
        )}

        {!isCoachOrAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50 gap-1.5 text-xs"
            onClick={() => navigate("/app")}
            title="Ask Paige to connect you with your advisor"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Contact Advisor</span>
          </Button>
        )}

        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-sidebar-accent gap-2 px-2"
            >
              {avatarNode}
              <span className="hidden md:inline text-xs max-w-[140px] truncate">
                {user.email}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">
              {user.email}
            </div>
            <DropdownMenuSeparator />
            {isCoachOrAdmin && !isViewingAsClient && (
              <>
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <Eye className="w-4 h-4 mr-2" />
                  Admin Workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => navigate("/app/support")}>
              <LifeBuoy className="w-4 h-4 mr-2" />
              <span className="flex-1">Support</span>
              {unreadSupport > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                  {unreadSupport > 9 ? "9+" : unreadSupport}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/app/settings")}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} className="text-red-500 focus:text-red-500 focus:bg-red-500/10">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="hidden lg:inline-flex text-primary-foreground/70 hover:text-primary-foreground hover:bg-red-500/20 gap-1.5 text-xs disabled:opacity-60"
        >
          <LogOut className="w-3.5 h-3.5" />
          {isSigningOut ? "Signing Out..." : "Sign Out"}
        </Button>
      </div>
    </div>
  );
}

