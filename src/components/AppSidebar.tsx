import { LayoutDashboard, FileText, CreditCard, TrendingUp, BarChart3, BookOpen, MessageSquare, Building2, Settings, FolderOpen, CheckSquare, Receipt, Users, Plug, Shield, PhoneCall } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

const mainMenuItem = { title: "Dashboard", icon: LayoutDashboard, id: "dashboard" };

const personalMenuItems = [
  { title: "Personal Credit", icon: CreditCard, id: "personal" },
  { title: "BUILD Program", icon: TrendingUp, id: "personal-build" },
  { title: "Bank Accounts", icon: BarChart3, id: "personal-bank-accounts" },
  { title: "Documents", icon: FolderOpen, id: "personal-documents" },
  { title: "Tasks", icon: CheckSquare, id: "tasks" },
];

const businessMenuItems = [
  { title: "Business Credit", icon: Building2, id: "business-credit" },
  { title: "BUILD Program", icon: TrendingUp, id: "build-steps" },
  { title: "Bank Accounts", icon: BarChart3, id: "business-bank-accounts" },
  { title: "Documents", icon: FolderOpen, id: "business-documents" },
  { title: "Tasks", icon: CheckSquare, id: "business-tasks" },
  { title: "Organization Chart", icon: Building2, id: "business-organization" },
];

const generalMenuItems = [
  { title: "Payments", icon: Receipt, id: "payments" },
  { title: "Affiliate", icon: Users, id: "affiliate" },
  { title: "Integrations", icon: Plug, id: "integrations" },
  { title: "Learning Vault", icon: BookOpen, id: "learning-vault" },
  { title: "PaigeAgent.ai", icon: MessageSquare, id: "paige-ai" },
  { title: "Contact & Support", icon: PhoneCall, id: "contact" },
  { title: "Settings", icon: Settings, id: "settings" },
];

interface AppSidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export function AppSidebar({ activeSection, setActiveSection }: AppSidebarProps) {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  const checkAdminStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .single();

      setIsAdmin(!!data);
    } catch (error) {
      console.error("Error checking admin status:", error);
    }
  };

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
        {/* Main Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setActiveSection(mainMenuItem.id)}
                  isActive={activeSection === mainMenuItem.id}
                  className={`w-full px-3 py-2 rounded-lg transition-all ${
                    activeSection === mainMenuItem.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted text-sidebar-foreground"
                  }`}
                >
                  <mainMenuItem.icon className="w-5 h-5" />
                  <span className="text-sm">{mainMenuItem.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold text-gold uppercase tracking-wider">
            Personal Credit
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {personalMenuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => setActiveSection(item.id)}
                    isActive={activeSection === item.id}
                    className={`w-full px-3 py-2 rounded-lg transition-all ${
                      activeSection === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-sidebar-foreground"
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

        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold text-gold uppercase tracking-wider">
            Business Credit
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {businessMenuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => setActiveSection(item.id)}
                    isActive={activeSection === item.id}
                    className={`w-full px-3 py-2 rounded-lg transition-all ${
                      activeSection === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-sidebar-foreground"
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

        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold text-gold uppercase tracking-wider">
            General
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {generalMenuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    onClick={() => setActiveSection(item.id)}
                    isActive={activeSection === item.id}
                    className={`w-full px-3 py-2 rounded-lg transition-all ${
                      activeSection === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted text-sidebar-foreground"
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

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-xs font-semibold text-gold uppercase tracking-wider">
              Administration
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigate("/admin")}
                    className="w-full px-3 py-2 rounded-lg transition-all hover:bg-muted text-sidebar-foreground"
                  >
                    <Shield className="w-5 h-5" />
                    <span className="text-sm">Admin Panel</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
