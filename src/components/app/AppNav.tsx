import { Link, useLocation, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
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
import { BarChart3, CreditCard, DollarSign, BookOpen, FileText, Building2, Settings, LogOut, User as UserIcon, Menu, ArrowLeft, MessageCircle, Eye } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import paigeLogoTransparent from "@/assets/paige-logo-transparent.png";

const navItems = [
  { label: "Dashboard", href: "/app", icon: BarChart3 },
  { label: "Credit", href: "/app/credit", icon: CreditCard },
  { label: "Funding", href: "/app/funding", icon: DollarSign },
  { label: "Disputes", href: "/app/disputes", icon: FileText },
  { label: "Business", href: "/app/business", icon: Building2 },
  { label: "Learn", href: "/app/learn", icon: BookOpen },
];

interface AppNavProps {
  user: User;
}

export function AppNav({ user }: AppNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isCoachOrAdmin, isAdmin, mode, setMode } = useDashboardMode();

  const userRoleLabel = isAdmin ? "Admin" : isCoachOrAdmin ? "Coach" : "Client";
  const isViewingAsClient = isCoachOrAdmin && mode === "client";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
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
                onClick={() => { navigate("/app/settings"); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </nav>
          </SheetContent>
        </Sheet>

        <span className="font-bold text-lg">PaigeAgent</span>

        <div className="flex items-center gap-2">
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
        {/* Role badge */}
        <Badge variant="outline" className="text-[10px] font-medium capitalize border-accent/30 text-accent hidden sm:inline-flex">
          {userRoleLabel}
        </Badge>

        {/* Return to admin for admin/coach in client view */}
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

        {/* Contact Advisor for clients */}
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
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-sidebar-accent">
              <UserIcon className="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isCoachOrAdmin && !isViewingAsClient && (
              <>
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <Eye className="w-4 h-4 mr-2" />
                  Admin Workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => navigate("/app/settings")}>
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
