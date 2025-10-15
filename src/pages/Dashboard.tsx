import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CreditScoreOverview } from "@/components/dashboard/CreditScoreOverview";
import { AccelProgress } from "@/components/dashboard/AccelProgress";
import { BuildProgress } from "@/components/dashboard/BuildProgress";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { LearningVault } from "@/components/dashboard/LearningVault";
import { DisputesManager } from "@/components/dashboard/DisputesManager";
import { AccountsOverview } from "@/components/dashboard/AccountsOverview";
import { BuildSteps } from "@/components/dashboard/BuildSteps";
import { BuildProgramOutline } from "@/components/dashboard/BuildProgramOutline";
import { AccelProgramOutline } from "@/components/dashboard/AccelProgramOutline";
import { PersonalSection } from "@/components/dashboard/PersonalSection";
import { BusinessCreditSection } from "@/components/dashboard/BusinessCreditSection";
import { ProfileSettings } from "@/components/dashboard/ProfileSettings";
import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { DocumentsManager } from "@/components/dashboard/DocumentsManager";
import { TaskManager } from "@/components/dashboard/TaskManager";
import { PaymentHistory } from "@/components/dashboard/PaymentHistory";
import { AffiliateTracking } from "@/components/dashboard/AffiliateTracking";
import { Button } from "@/components/ui/button";
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
      
      <SidebarProvider defaultOpen={true}>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar activeSection={activeSection} setActiveSection={setActiveSection} />
          
          <div className="flex-1 flex flex-col">
            {/* Top Header Bar */}
            <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="-ml-2" />
                <h1 className="text-xl font-semibold">
                  {activeSection === "dashboard" && "Dashboard"}
                  {activeSection === "personal" && "Personal Credit"}
                  {activeSection === "accel-program" && "ACCEL Program"}
                  {activeSection === "tasks" && "Tasks"}
                  {activeSection === "paige-ai" && "PaigeAgent.ai"}
                  {activeSection === "learning-vault" && "Learning Vault"}
                  {activeSection === "business-credit" && "Business Credit"}
                  {activeSection === "build-steps" && "BUILD Program"}
                  {activeSection === "documents" && "Documents"}
                  {activeSection === "payments" && "Payment History"}
                  {activeSection === "affiliate" && "Affiliate Program"}
                  {activeSection === "settings" && "Settings"}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  Logout
                </Button>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto">
              <div className="p-6 max-w-7xl mx-auto w-full">
                {activeSection === "dashboard" && (
                  <div className="space-y-6">
                    <UpgradeBanner onUpgradeClick={() => setShowUpgradeModal(true)} />
                    
                    <div className="grid gap-6">
                      <CreditScoreOverview />
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  </div>
                )}
                
                {activeSection === "personal" && <PersonalSection />}
                {activeSection === "accel-program" && (
                  <div className="space-y-8">
                    <AccelProgramOutline />
                    <AccelProgress onToggle={() => {}} />
                  </div>
                )}
                {activeSection === "tasks" && <TaskManager businessMode={false} />}
                {activeSection === "paige-ai" && <PaigeAIChat />}
                {activeSection === "learning-vault" && <LearningVault />}
                {activeSection === "business-credit" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <BusinessCreditSection />
                  </PlanGate>
                )}
                {activeSection === "build-steps" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <div className="space-y-8">
                      <BuildProgramOutline />
                      <BuildSteps />
                    </div>
                  </PlanGate>
                )}
                {activeSection === "documents" && <DocumentsManager />}
                {activeSection === "payments" && <PaymentHistory />}
                {activeSection === "affiliate" && <AffiliateTracking />}
                {activeSection === "settings" && <ProfileSettings />}
              </div>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default Dashboard;
