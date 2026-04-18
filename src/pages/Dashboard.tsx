import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { CurrentDateTime } from "@/components/dashboard/CurrentDateTime";
import { CreditScoreOverview } from "@/components/dashboard/CreditScoreOverview";
import { BureauScorePanel } from "@/components/dashboard/BureauScorePanel";
import { DashboardCommandCenter } from "@/components/dashboard/DashboardCommandCenter";
import { AccelProgress } from "@/components/dashboard/AccelProgress";
import { BuildProgress } from "@/components/dashboard/BuildProgress";
import { PersonalBankAccountsOverview } from "@/components/dashboard/PersonalBankAccountsOverview";
import { PersonalTasksOverview } from "@/components/dashboard/PersonalTasksOverview";
import { BusinessCreditOverview } from "@/components/dashboard/BusinessCreditOverview";
import { BusinessBankAccountsOverview } from "@/components/dashboard/BusinessBankAccountsOverview";
import { BusinessTasksOverview } from "@/components/dashboard/BusinessTasksOverview";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { LearningVault } from "@/components/dashboard/LearningVault";
import { DisputesManager } from "@/components/dashboard/DisputesManager";
import { AccountsOverview } from "@/components/dashboard/AccountsOverview";
import { BuildProgramOutline } from "@/components/dashboard/BuildProgramOutline";
import { BuildProgramBusinessWrapper } from "@/components/dashboard/BuildProgramBusinessWrapper";
import { BusinessInfrastructureAssessment } from "@/components/dashboard/business-profile/BusinessInfrastructureAssessment";
import { PersonalBuildProgram } from "@/components/dashboard/PersonalBuildProgram";
import { AccelProgramOutline } from "@/components/dashboard/AccelProgramOutline";
import { PersonalSection } from "@/components/dashboard/PersonalSection";
import { BusinessCreditSection } from "@/components/dashboard/BusinessCreditSection";
import { OrganizationChart } from "@/components/dashboard/OrganizationChart";
import { BusinessDocumentsManager } from "@/components/dashboard/BusinessDocumentsManager";
import { ProfileSettings } from "@/components/dashboard/ProfileSettings";
import { ContactSupport } from "@/components/dashboard/ContactSupport";
import { OnboardingFlow } from "@/components/dashboard/OnboardingFlow";
import { PersonalDocuments } from "@/components/dashboard/PersonalDocuments";
import { BusinessDocuments } from "@/components/dashboard/BusinessDocuments";
import { TaskManager } from "@/components/dashboard/TaskManager";
import { PaymentHistory } from "@/components/dashboard/PaymentHistory";
import { AffiliateTracking } from "@/components/dashboard/AffiliateTracking";
import { ReportUploadTab } from "@/components/dashboard/ReportUploadTab";
import { Integrations } from "@/components/dashboard/Integrations";
import { BankAccountsManager } from "@/components/dashboard/BankAccountsManager";
import { FundingMarketplace } from "@/components/dashboard/FundingMarketplace";
import { LenderResearch } from "@/components/dashboard/LenderResearch";
import { Button } from "@/components/ui/button";
import { UpgradeBanner } from "@/components/dashboard/UpgradeBanner";
import { UpgradeModal } from "@/components/dashboard/UpgradeModal";
import { PlanGate } from "@/components/dashboard/PlanGate";
import { InstallPWA } from "@/components/InstallPWA";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageTransition } from "@/components/PageTransition";
import { PMEFundingReadiness } from "@/components/dashboard/PMEFundingReadiness";
import { FundingSecuredTracker } from "@/components/dashboard/FundingSecuredTracker";
import { WebhooksIntegrations } from "@/components/dashboard/WebhooksIntegrations";
import { OutreachCenter } from "@/components/dashboard/OutreachCenter";
import { ClientManagementDashboard } from "@/components/dashboard/ClientManagementDashboard";
import { ClientFileView } from "@/components/dashboard/ClientFileView";
import { InternalClientFileView } from "@/components/dashboard/InternalClientFileView";
import { AllCreditReportsView } from "@/components/dashboard/AllCreditReportsView";
import { QuickUploadReportModal } from "@/components/dashboard/QuickUploadReportModal";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import { performSignOut } from "@/lib/auth/signOut";

const Dashboard = () => {
  const { mode, isCoachOrAdmin } = useDashboardMode();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedInternalClientId, setSelectedInternalClientId] = useState<string | null>(null);
  const [showAccel, setShowAccel] = useState(true);
  const [showBuild, setShowBuild] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showQuickUpload, setShowQuickUpload] = useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIsLoading(false);

        if (!nextSession?.user) {
          navigate("/auth", { replace: true });
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);

      if (!currentSession?.user) {
        navigate("/auth", { replace: true });
      } else {
        checkOnboardingStatus(currentSession.user.id);
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

    if (!profile?.full_name) {
      setShowOnboarding(true);
    }
  };

  const handleLogout = async () => {
    await performSignOut("/");
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
      <QuickUploadReportModal open={showQuickUpload} onOpenChange={setShowQuickUpload} />
      
      <SidebarProvider defaultOpen={!isMobile}>
        <div className="min-h-screen flex w-full bg-background">
          <InstallPWA />
          <AppSidebar activeSection={activeSection} setActiveSection={setActiveSection} />
          
          <div className="flex-1 flex flex-col">
            {/* Top Header Bar */}
            <header className="h-14 md:h-16 border-b border-border bg-card px-3 md:px-6 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2 md:gap-4">
                <SidebarTrigger className="-ml-1 md:-ml-2" />
                <h1 className="text-base md:text-xl font-semibold truncate">
                  {activeSection === "dashboard" && "Dashboard"}
                  {activeSection === "personal" && "Personal Credit"}
                  {activeSection === "personal-build" && "BUILD Program - Personal"}
                  {activeSection === "personal-bank-accounts" && "Personal Bank Accounts"}
                  {activeSection === "personal-documents" && "Personal Documents"}
                  {activeSection === "tasks" && "Personal Tasks"}
                  {activeSection === "paige-ai" && "PaigeAgent.ai"}
                  {activeSection === "learning-vault" && "Learning Vault"}
                  {activeSection === "funding-marketplace" && "Funding Marketplace"}
                  {activeSection === "business-credit" && "Business Credit"}
                  {activeSection === "build-steps" && "BUILD Program - Business"}
                  {activeSection === "business-bank-accounts" && "Business Bank Accounts"}
                  {activeSection === "business-documents" && "Business Documents"}
                  {activeSection === "business-tasks" && "Business Tasks"}
                  {activeSection === "business-organization" && "Business Organization"}
                  {activeSection === "payments" && "Payment History"}
                  {activeSection === "affiliate" && "Affiliate Program"}
                  {activeSection === "integrations" && "Integrations"}
                  {activeSection === "settings" && "Settings"}
                  {activeSection === "contact" && "Contact & Support"}
                  {activeSection === "report-upload" && "Report Upload & AI Analysis"}
                  {activeSection === "lender-research" && "Lender Research"}
                  {activeSection === "funding-secured" && "Funding Secured"}
                  {activeSection === "webhooks" && "Webhooks & Integrations"}
                  {activeSection === "outreach" && "Outreach Draft Center"}
                  {activeSection === "credit-reports-all" && "Credit Reports"}
                  {activeSection === "client-file" && "Client File"}
                </h1>
              </div>
              <div className="flex items-center gap-2 md:gap-4">
                <CurrentDateTime />
                <NotificationBell />
                <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs md:text-sm">
                  {isMobile ? "Out" : "Logout"}
                </Button>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto">
              <PageTransition>
                <div className="p-3 md:p-6 max-w-7xl mx-auto w-full">
                  {activeSection === "dashboard" && mode === "internal" && isCoachOrAdmin && (
                    <ClientManagementDashboard
                      onViewClient={(clientId) => {
                        setSelectedClientId(clientId);
                        setActiveSection("client-file");
                      }}
                      onViewInternalClient={(clientId) => {
                        setSelectedInternalClientId(clientId);
                        setActiveSection("internal-client-file");
                      }}
                    />
                  )}
                  {activeSection === "dashboard" && (mode !== "internal" || !isCoachOrAdmin) && user && (
                    <DashboardCommandCenter userId={user.id} onNavigate={setActiveSection} />
                  )}
                {activeSection === "personal" && <PersonalSection />}
                {activeSection === "personal-build" && (
                  <div className="space-y-8">
                    <PersonalBuildProgram />
                  </div>
                )}
                {activeSection === "personal-documents" && <PersonalDocuments />}
                {activeSection === "personal-bank-accounts" && <BankAccountsManager businessMode={false} />}
                {activeSection === "tasks" && <TaskManager businessMode={false} />}
                {activeSection === "paige-ai" && <PaigeAIChat />}
                {activeSection === "learning-vault" && <LearningVault />}
                {activeSection === "business-credit" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <BusinessInfrastructureAssessment />
                  </PlanGate>
                )}
                {activeSection === "build-steps" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <BusinessInfrastructureAssessment />
                  </PlanGate>
                )}
                {activeSection === "business-documents" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <BusinessDocuments />
                  </PlanGate>
                )}
                {activeSection === "business-bank-accounts" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <BankAccountsManager businessMode={true} />
                  </PlanGate>
                )}
                {activeSection === "business-tasks" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <TaskManager businessMode={true} />
                  </PlanGate>
                )}
                {activeSection === "business-organization" && (
                  <PlanGate feature="business_credit" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <div className="space-y-6">
                      <OrganizationChart />
                      <BusinessDocumentsManager />
                    </div>
                  </PlanGate>
                )}
                {activeSection === "funding-marketplace" && (
                  <PlanGate feature="funding_tools" onUpgradeClick={() => setShowUpgradeModal(true)}>
                    <div className="space-y-8">
                      <FundingMarketplace />
                      <FundingSecuredTracker />
                    </div>
                  </PlanGate>
                )}
                {activeSection === "payments" && <PaymentHistory />}
                {activeSection === "report-upload" && <ReportUploadTab />}
                {activeSection === "affiliate" && <AffiliateTracking />}
                {activeSection === "integrations" && <Integrations />}
                {activeSection === "lender-research" && <LenderResearch />}
                {activeSection === "funding-secured" && <FundingSecuredTracker />}
                {activeSection === "webhooks" && <WebhooksIntegrations />}
                {activeSection === "outreach" && selectedClientId && <OutreachCenter clientUserId={selectedClientId} />}
                {activeSection === "outreach" && !selectedClientId && (
                  <div className="p-8 text-center border border-border rounded-lg">
                    <p className="text-muted-foreground">Select a client from the Client Management dashboard first to generate outreach drafts.</p>
                    <Button variant="outline" className="mt-4" onClick={() => setActiveSection("dashboard")}>Go to Client Management</Button>
                  </div>
                )}
                {activeSection === "credit-reports-all" && (
                  <AllCreditReportsView onViewClient={(clientId) => {
                    setSelectedClientId(clientId);
                    setActiveSection("client-file");
                  }} />
                )}
                {activeSection === "client-file" && selectedClientId && (
                  <ClientFileView
                    clientUserId={selectedClientId}
                    onBack={() => setActiveSection("dashboard")}
                  />
                )}
                {activeSection === "internal-client-file" && selectedInternalClientId && (
                  <InternalClientFileView
                    clientId={selectedInternalClientId}
                    onBack={() => { setSelectedInternalClientId(null); setActiveSection("dashboard"); }}
                  />
                )}

                  {activeSection === "settings" && <ProfileSettings />}
                  {activeSection === "contact" && <ContactSupport />}
                </div>
              </PageTransition>
            </main>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
};

export default Dashboard;
