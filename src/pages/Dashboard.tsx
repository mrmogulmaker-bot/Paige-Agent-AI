import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CreditScoreOverview } from "@/components/dashboard/CreditScoreOverview";
import { AccelProgress } from "@/components/dashboard/AccelProgress";
import { BuildProgress } from "@/components/dashboard/BuildProgress";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { LearningVault } from "@/components/dashboard/LearningVault";
import { DisputesManager } from "@/components/dashboard/DisputesManager";
import { AccountsOverview } from "@/components/dashboard/AccountsOverview";
import { BuildSteps } from "@/components/dashboard/BuildSteps";
import { ReportsView } from "@/components/dashboard/ReportsView";
import { ThreeBureauReport } from "@/components/dashboard/ThreeBureauReport";
import { BusinessCreditReport } from "@/components/dashboard/BusinessCreditReport";
import { ProfileSettings } from "@/components/dashboard/ProfileSettings";
import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { DocumentsManager } from "@/components/dashboard/DocumentsManager";
import { Button } from "@/components/ui/button";
import { FileUp, Bell } from "lucide-react";
import { UpgradeBanner } from "@/components/dashboard/UpgradeBanner";
import { UpgradeModal } from "@/components/dashboard/UpgradeModal";
import { PlanGate } from "@/components/dashboard/PlanGate";

const Dashboard = () => {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [showAccel, setShowAccel] = useState(true);
  const [showBuild, setShowBuild] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      
      if (!session?.user) {
        navigate("/auth");
      } else {
        // Check if user needs onboarding
        checkOnboardingStatus(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkOnboardingStatus = async (userId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();
    
    // Show onboarding if profile is incomplete
    if (!profile?.full_name) {
      setShowOnboarding(true);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <OnboardingFlow open={showOnboarding} onComplete={() => setShowOnboarding(false)} />
      <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />
      
      <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeSection={activeSection} setActiveSection={setActiveSection} />
        <main className="flex-1 p-8 bg-background overflow-auto">
          {activeSection === "dashboard" && (
            <div className="space-y-8 max-w-7xl mx-auto">
              <UpgradeBanner onUpgradeClick={() => setShowUpgradeModal(true)} />
              
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-4xl font-bold mb-2 bg-gradient-gold bg-clip-text text-transparent">
                    Welcome Back, {user?.user_metadata?.full_name || "Mentee"}
                  </h1>
                  <p className="text-muted-foreground">Track your journey to financial empowerment</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="gap-2" onClick={handleLogout}>
                    Logout
                  </Button>
                  <Button variant="outline" className="gap-2">
                    <Bell className="w-4 h-4" />
                    Import Your Report
                  </Button>
                  <Button className="gap-2 bg-gradient-gold hover:opacity-90">
                    <FileUp className="w-4 h-4" />
                    Import Credit Report
                  </Button>
                </div>
              </div>
              
              <CreditScoreOverview />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {showAccel && <AccelProgress onToggle={() => setShowAccel(false)} />}
                {showBuild && <BuildProgress onToggle={() => setShowBuild(false)} />}
              </div>
              
              {!showAccel && !showBuild && (
                <div className="flex gap-4 justify-center">
                  <Button onClick={() => setShowAccel(true)} variant="outline">
                    Show A.C.C.E.L.
                  </Button>
                  <Button onClick={() => setShowBuild(true)} variant="outline">
                    Show B.U.I.L.D.
                  </Button>
                </div>
              )}
            </div>
          )}
          
          {activeSection === "paige-ai" && <PaigeAIChat />}
          {activeSection === "learning-vault" && <LearningVault />}
          
          {activeSection === "disputes" && <ThreeBureauReport />}
          {activeSection === "accounts" && <AccountsOverview />}
          {activeSection === "business-credit" && (
            <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
              <BusinessCreditReport />
            </PlanGate>
          )}
          {activeSection === "build-steps" && (
            <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
              <BuildSteps />
            </PlanGate>
          )}
          {activeSection === "reports" && <ReportsView />}
          {activeSection === "documents" && <DocumentsManager />}
          {activeSection === "settings" && <ProfileSettings />}
        </main>
      </div>
    </SidebarProvider>
    </>
  );
};

export default Dashboard;
