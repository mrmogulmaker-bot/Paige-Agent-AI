// Broker workspace shell — gates access to /broker/app/*.
// Loads the broker_profiles row, redirects users without broker access to
// /broker (apply page) or /auth (signed out). Renders sidebar + outlet.

import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BrokerSidebar } from "@/components/broker/BrokerSidebar";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BrokerWorkspace = () => {
  const { profile, isBroker, loading } = useBrokerProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isStaff, setIsStaff] = useState(false);

  // Bounce signed-out users to /auth and detect admin/coach role for "Back to Admin" button.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!sess) navigate("/auth", { replace: true });
    });
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const roleList = (roles || []).map((r: any) => r.role);
      setIsStaff(roleList.includes("admin") || roleList.includes("coach"));
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Signed in but no broker profile → bounce to apply page.
  if (!isBroker || !profile) {
    toast({
      title: "Broker account required",
      description: "Apply for the Broker Workspace to access this area.",
    });
    return <Navigate to="/broker" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <BrokerSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{profile.business_name}</span>
                <span className="text-xs text-muted-foreground">
                  {profile.referral_code ? `Code: ${profile.referral_code}` : "Pending setup"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isStaff && (
                <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Admin Dashboard
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default BrokerWorkspace;
