// Broker workspace sidebar — items adapt based on team-member permissions.
// Commissions hidden when permissions.can_view_commissions is false (team
// members) so they never see broker-only commission data in navigation.

import { NavLink, useLocation } from "react-router-dom";
import {
  Users,
  DollarSign,
  Settings,
  Briefcase,
  LayoutDashboard,
  Brain,
  UserPlus,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useBrokerContext } from "@/hooks/useBrokerContext";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  end: boolean;
  show: () => boolean;
}

export function BrokerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isTeamMember, permissions } = useBrokerContext();

  const items: NavItem[] = [
    { title: "Overview", url: "/broker/app", icon: LayoutDashboard, end: true, show: () => true },
    { title: "Clients", url: "/broker/app/clients", icon: Users, end: false, show: () => true },
    { title: "Paige Sessions", url: "/broker/app/sessions", icon: Brain, end: false, show: () => true },
    {
      title: "Commissions",
      url: "/broker/app/commissions",
      icon: DollarSign,
      end: false,
      // Hide entirely for team members without commission visibility.
      show: () => !isTeamMember || permissions.can_view_commissions,
    },
    { title: "MCC Services", url: "/broker/app/mcc", icon: Briefcase, end: false, show: () => true },
    { title: "Team", url: "/broker/app/team", icon: UserPlus, end: false, show: () => true },
    { title: "Settings", url: "/broker/app/settings", icon: Settings, end: false, show: () => true },
  ];

  const visibleItems = items.filter((i) => i.show());

  const isActive = (path: string, end: boolean) =>
    end ? location.pathname === path : location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Broker Workspace</span>
              <span className="text-xs text-muted-foreground">PaigeAgent</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const active = isActive(item.url, item.end);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url} end={item.end}>
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
