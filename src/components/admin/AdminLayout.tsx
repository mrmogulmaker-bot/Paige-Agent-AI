import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users, FileText, DollarSign, BarChart3, Settings, LogOut,
  Gavel, TrendingUp, Eye, ArrowLeft, Menu, X, BookOpen,
} from "lucide-react";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import paigeLogoTransparent from "@/assets/paige-logo-transparent.png";

const adminNavItems = [
  { label: "Overview", href: "/admin", icon: BarChart3 },
  { label: "Client Management", href: "/admin/clients", icon: Users },
  { label: "Dispute Center", href: "/admin/disputes", icon: Gavel },
  { label: "Funding Pipeline", href: "/admin/funding", icon: DollarSign },
  { label: "Analytics", href: "/admin/analytics", icon: TrendingUp },
  { label: "Knowledge Review", href: "/admin/knowledge", icon: BookOpen },
  { label: "Maintenance", href: "/admin/maintenance", icon: Settings },
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
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
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
        <img src={paigeLogoTransparent} alt="PaigeAgent" className="h-8 w-8 object-contain flex-shrink-0" />
        {(sidebarOpen || mobile) && (
          <span className="font-bold text-sm tracking-tight">PaigeAgent Admin</span>
        )}
      </div>

      {/* Nav items */}
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

      {/* Bottom actions */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <button
          onClick={handleSwitchToClientView}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <Eye className="w-4 h-4 flex-shrink-0" />
          {(sidebarOpen || mobile) && <span>Switch to Client View</span>}
        </button>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm text-primary-foreground/70 hover:text-primary-foreground hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {(sidebarOpen || mobile) && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative z-10 h-full">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth < 768) setMobileSidebarOpen(true);
                else setSidebarOpen(!sidebarOpen);
              }}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <Menu className="w-5 h-5 text-muted-foreground" />
            </button>
            <Badge variant="outline" className="text-xs font-medium capitalize border-accent/30 text-accent">
              {userRole}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
