import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, BarChart3, Settings, LogOut,
  TrendingUp, Eye, Menu, BookOpen, Wrench, Share2, Briefcase, Brain, Building2, LifeBuoy,
  Contact, KanbanSquare, Inbox, CheckSquare, UserCog, ChevronDown, MoreHorizontal, X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { performSignOut } from "@/lib/auth/signOut";
import paigeLogoTransparent from "@/assets/paige-logo-transparent.png";

// Pipedrive-style: primary CRM verbs live in the top bar.
const crmNavItems = [
  { label: "Dashboard", href: "/admin", icon: BarChart3 },
  { label: "Contacts", href: "/admin/contacts", icon: Contact },
  { label: "Pipeline", href: "/admin/pipeline", icon: KanbanSquare },
  { label: "Communications", href: "/admin/communications", icon: Inbox },
  { label: "Tasks", href: "/admin/tasks", icon: CheckSquare },
  { label: "Coaches", href: "/admin/coaches", icon: UserCog },
  { label: "Reports", href: "/admin/analytics", icon: TrendingUp },
];

// Secondary workspace tools — tucked into a "More" menu to keep the bar clean.
const workspaceNavItems = [
  { label: "Client Files (Legacy)", href: "/admin/clients", icon: Users },
  { label: "Funding Portfolio", href: "/admin/funding", icon: DollarSign },
  { label: "Funding Journey", href: "/admin/funding-pipeline", icon: Briefcase },
  { label: "Knowledge Base", href: "/admin/knowledge-base", icon: Brain },
  { label: "Knowledge Review", href: "/admin/knowledge", icon: BookOpen },
  { label: "Affiliates", href: "/admin/affiliates", icon: Share2 },
  { label: "Brokers", href: "/admin/brokers", icon: Briefcase },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  { label: "Maintenance", href: "/admin/maintenance", icon: Wrench },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

const adminNavItems = [...crmNavItems, ...workspaceNavItems];

interface AdminLayoutProps {
  children: React.ReactNode;
  userRole: "admin" | "coach";
}

export function AdminLayout({ children, userRole }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setMode } = useDashboardMode();
  const { hasBrokerAccess, profile: brokerProfile } = useBrokerProfile();
  const canAccessBrokerWorkspace = hasBrokerAccess && !!brokerProfile?.id;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setMobileNavOpen(false);
    setIsSigningOut(true);
    await performSignOut("/");
  };

  const handleSwitchToClientView = () => {
    setMode("client");
    navigate("/app");
  };

  const isActive = (href: string) => {
    if (href === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(href);
  };

  const currentSection =
    adminNavItems.find((i) => isActive(i.href))?.label ?? "Admin";

  return (
    <div className="min-h-dvh flex flex-col bg-background overflow-x-hidden">
      {/* Top bar — Pipedrive-style horizontal CRM nav */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground border-b border-sidebar-border">
        {/* Row 1: brand + utilities */}
        <div className="flex items-center justify-between gap-3 px-3 md:px-6 h-14">
          <Link to="/admin" className="flex items-center gap-2 min-w-0">
            <img src={paigeLogoTransparent} alt="PaigeAgent" className="h-8 w-8 object-contain flex-shrink-0" />
            <span className="font-bold text-sm tracking-tight truncate">PaigeAgent Admin</span>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex ml-2 text-[10px] font-medium capitalize border-accent/40 text-accent bg-transparent"
            >
              {userRole}
            </Badge>
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
            <div className="text-primary-foreground">
              <NotificationBell />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
                >
                  <Eye className="w-4 h-4 mr-1.5" />
                  Views
                  <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSwitchToClientView}>
                  <Eye className="w-4 h-4 mr-2" /> Client view
                </DropdownMenuItem>
                {canAccessBrokerWorkspace && (
                  <DropdownMenuItem onClick={() => navigate("/broker/app")}>
                    <Building2 className="w-4 h-4 mr-2" /> Broker workspace
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

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

        {/* Row 2: primary nav (desktop) */}
        <div className="hidden md:flex items-center gap-1 px-3 md:px-6 h-11 overflow-x-auto scrollbar-none border-t border-sidebar-border/60">
          {crmNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`relative flex items-center gap-2 px-3 h-11 text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "text-accent font-medium"
                    : "text-primary-foreground/70 hover:text-primary-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t-full" />
                )}
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center gap-1.5 px-3 h-11 text-sm whitespace-nowrap transition-colors ${
                  workspaceNavItems.some((i) => isActive(i.href))
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
              {workspaceNavItems.map((item) => (
                <DropdownMenuItem
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  className={isActive(item.href) ? "bg-muted" : ""}
                >
                  <item.icon className="w-4 h-4 mr-2" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/40">
                CRM
              </div>
              {crmNavItems.map((item) => (
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

              <div className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/40">
                Workspace
              </div>
              {workspaceNavItems.map((item) => (
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

              <div className="mt-2 pt-2 border-t border-sidebar-border space-y-1">
                <button
                  onClick={handleSwitchToClientView}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-primary-foreground/80 hover:bg-sidebar-accent/50"
                >
                  <Eye className="w-4 h-4" /> Switch to Client View
                </button>
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
