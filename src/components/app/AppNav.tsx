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
import { BarChart3, CreditCard, DollarSign, BookOpen, Building2, Settings, LogOut, User as UserIcon, Menu, ArrowLeft, MessageCircle, Eye, Briefcase, LifeBuoy, Landmark } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import { performSignOut } from "@/lib/auth/signOut";
import { useUnreadSupportCount } from "@/hooks/useUnreadSupportCount";
import paigeLogoTransparent from "@/assets/paige-logo-transparent.png";

const navItems = [
  { label: "Dashboard", href: "/app", icon: BarChart3 },
  { label: "Credit", href: "/app/credit", icon: CreditCard },
  { label: "Business Profile", href: "/app/business-profile", icon: Building2 },
  { label: "Financial Profile", href: "/app/financial-profile", icon: Landmark },
  { label: "Funding", href: "/app/funding", icon: DollarSign },
  { label: "Journey", href: "/app/funding-journey", icon: Briefcase },
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
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { isCoachOrAdmin, isAdmin, mode, setMode } = useDashboardMode();
  const { count: unreadSupport } = useUnreadSupportCount(user.id);

  const userRoleLabel = isAdmin ? "Admin" : isCoachOrAdmin ? "Coach" : "Client";
  const isViewingAsClient = isCoachOrAdmin && mode === "client";

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setMobileMenuOpen(false);
    setIsSigningOut(true);
    await performSignOut("/");
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
              <UserIcon className="w-4 h-4" />
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

