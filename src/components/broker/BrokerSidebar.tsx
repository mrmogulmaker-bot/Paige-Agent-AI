// Broker workspace sidebar — 6 tabs per Phase 2 spec.
// Phase 2a wires Clients + Settings to real screens; the rest are stub
// placeholders that ship in Phase 2b but exist now so navigation never breaks.

import { NavLink, useLocation } from "react-router-dom";
import {
  Users,
  MessageSquareText,
  Users2,
  DollarSign,
  Settings,
  Briefcase,
  LayoutDashboard,
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

// NOTE: "Paige Sessions" and "Team" tabs are intentionally hidden until
// Phase 3 ships. Routes still exist for direct-link compatibility but we
// don't surface them in navigation to avoid showing prospects placeholders.
const items = [
  { title: "Overview", url: "/broker/app", icon: LayoutDashboard, end: true },
  { title: "Clients", url: "/broker/app/clients", icon: Users, end: false },
  { title: "Commissions", url: "/broker/app/commissions", icon: DollarSign, end: false },
  { title: "MCC Services", url: "/broker/app/mcc", icon: Briefcase, end: false },
  { title: "Settings", url: "/broker/app/settings", icon: Settings, end: false },
];

export function BrokerSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

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
              {items.map((item) => {
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
