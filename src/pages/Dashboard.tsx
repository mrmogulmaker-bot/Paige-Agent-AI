import { useState } from "react";
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

const Dashboard = () => {
  const [activeSection, setActiveSection] = useState("dashboard");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeSection={activeSection} setActiveSection={setActiveSection} />
        <main className="flex-1 p-8 bg-background overflow-auto">
          {activeSection === "dashboard" && (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div>
                <h1 className="text-4xl font-bold mb-2 bg-gradient-gold bg-clip-text text-transparent">
                  Welcome Back, Mentee
                </h1>
                <p className="text-muted-foreground">Track your journey to financial empowerment</p>
              </div>
              
              <CreditScoreOverview />
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <AccelProgress />
                <BuildProgress />
              </div>
            </div>
          )}
          
          {activeSection === "paige-ai" && <PaigeAIChat />}
          {activeSection === "learning-vault" && <LearningVault />}
          
          {activeSection === "disputes" && <DisputesManager />}
          {activeSection === "accounts" && <AccountsOverview />}
          {activeSection === "build-steps" && <BuildSteps />}
          {activeSection === "reports" && <ReportsView />}
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
