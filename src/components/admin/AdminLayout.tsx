import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, DollarSign, BarChart3, Settings, LogOut,
  TrendingUp, Eye, Menu, BookOpen, Wrench, Share2, Briefcase, Brain, Building2, LifeBuoy,
} from "lucide-react";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { performSignOut } from "@/lib/auth/signOut";
import paigeLogoTransparent from "@/assets/paige-logo-transparent.png";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: BarChart3 },
  { label: "Client Management", href: "/admin/clients", icon: Users },
  { label: "Funding Pipeline", href: "/admin/funding", icon: DollarSign },
  { label: "Funding Journey", href: "/admin/funding-pipeline", icon: Briefcase },
  { label: "Analytics", href: "/admin/analytics", icon: TrendingUp },
  { label: "Knowledge Base", href: "/admin/knowledge-base", icon: Brain },
  { label: "Knowledge Review", href: "/admin/knowledge", icon: BookOpen },
  { label: "Affiliates", href: "/admin/affiliates", icon: Share2 },
  { label: "Brokers", href: "/admin/brokers", icon: Briefcase },
  { label: "Support", href: "/admin/support", icon: LifeBuoy },
  { label: "Maintenance", href: "/admin/maintenance", icon: Wrench },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setMobileSidebarOpen(false);
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

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full bg-primary text-primary-foreground ${mobile ? "w-64" : sidebarOpen ? "w-64" : "w-16"} transition-all duration-200`}>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
        <img src={paigeLogoTransparent} alt="PaigeAgent" className="h-8 w-8 object-contain flex-shrink-0" />
        {(sidebarOpen || mobile) && (
          <span className="font-bold text-sm tracking-tight">PaigeAgent Admin</span>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {adminNavItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => mobile && setMobileSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              isActive(item.href)
                ? "bg-sidebar-accent text-accent font-medium"
                : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50"
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {(sidebarOpen || mobile) && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <button
          onClick={handleSwitchToClientView}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <Eye className="w-4 h-4 flex-shrink-0" />
          {(sidebarOpen || mobile) && <span>Switch to Client View</span>}
        </button>
        {canAccessBrokerWorkspace && (
          <button
            onClick={() => { setMobileSidebarOpen(false); navigate("/broker/app"); }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-accent hover:bg-sidebar-accent/50 transition-colors"
          >
            <Building2 className="w-4 h-4 flex-shrink-0" />
            {(sidebarOpen || mobile) && <span>Broker Workspace</span>}
          </button>
        )}
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50 transition-colors disabled:opacity-60"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(sidebarOpen || mobile) && <span>{isSigningOut ? "Signing Out..." : "Sign Out"}</span>}
        </button>
      </div>
    </div>
  );

  // Determine the current section label for the mobile header
  const currentSection =
    adminNavItems.find((i) => isActive(i.href))?.label ?? "Admin";

  return (
    <div className="h-dvh flex bg-background overflow-x-hidden">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative z-10 h-full">
            <Sidebar mobile />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-2 px-3 md:px-6 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => {
                if (window.innerWidth < 768) setMobileSidebarOpen(true);
                else setSidebarOpen(!sidebarOpen);
              }}
              className="p-1.5 rounded-md hover:bg-muted transition-colors flex-shrink-0"
              aria-label="Toggle navigation"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
            <span className="font-semibold text-sm text-foreground truncate md:hidden">
              {currentSection}
            </span>
            <Badge
              variant="outline"
              className="hidden md:inline-flex text-xs font-medium capitalize border-accent/30 text-accent"
            >
              {userRole}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              disabled={isSigningOut}
              aria-label="Sign out"
              className="hidden sm:inline-flex"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {children}
        </div>
      </div>
    </div>
  );
}
