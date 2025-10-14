import { LayoutDashboard, FileText, CreditCard, TrendingUp, BarChart3, BookOpen, MessageSquare, Building2, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { title: "Disputes", icon: FileText, id: "disputes" },
  { title: "Accounts", icon: CreditCard, id: "accounts" },
  { title: "Business Credit", icon: Building2, id: "business-credit" },
  { title: "BUILD Steps", icon: TrendingUp, id: "build-steps" },
  { title: "Reports", icon: BarChart3, id: "reports" },
  { title: "Learning Vault", icon: BookOpen, id: "learning-vault" },
  { title: "PaigeAgent.ai", icon: MessageSquare, id: "paige-ai" },
  { title: "Settings", icon: Settings, id: "settings" },
];

interface AppSidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export function AppSidebar({ activeSection, setActiveSection }: AppSidebarProps) {
  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-6">
        <h2 className="text-2xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          PaigeAgent.ai
        </h2>
        <p className="text-sm text-sidebar-foreground/60">Mogul Maker Academy</p>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => setActiveSection(item.id)}
                    isActive={activeSection === item.id}
                    className="w-full"
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
