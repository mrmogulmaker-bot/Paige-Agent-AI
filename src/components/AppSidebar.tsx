import { LayoutDashboard, FileText, CreditCard, TrendingUp, BarChart3, BookOpen, MessageSquare, Building2, Settings, FolderOpen } from "lucide-react";
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
  { title: "Documents", icon: FolderOpen, id: "documents" },
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
    <Sidebar className="border-r border-sidebar-border bg-card">
      <SidebarHeader className="border-b border-sidebar-border p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <div>
            <h2 className="text-lg font-bold">PaigeAgent.ai</h2>
            <p className="text-xs text-muted-foreground">Mogul Maker Academy</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => setActiveSection(item.id)}
                    isActive={activeSection === item.id}
                    className={`w-full px-3 py-2 rounded-lg transition-all ${
                      activeSection === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-sm">{item.title}</span>
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
