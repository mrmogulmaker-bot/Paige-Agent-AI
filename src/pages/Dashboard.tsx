import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CreditScoreOverview } from "@/components/dashboard/CreditScoreOverview";
import { AccelProgress } from "@/components/dashboard/AccelProgress";
import { BuildProgress } from "@/components/dashboard/BuildProgress";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { LearningVault } from "@/components/dashboard/LearningVault";

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
          
          {activeSection === "disputes" && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Credit Disputes</h2>
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">Dispute management coming soon</p>
              </div>
            </div>
          )}
          
          {activeSection === "accounts" && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Account Overview</h2>
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">Account details coming soon</p>
              </div>
            </div>
          )}
          
          {activeSection === "build-steps" && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">BUILD Framework Steps</h2>
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">Detailed BUILD steps coming soon</p>
              </div>
            </div>
          )}
          
          {activeSection === "reports" && (
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-6">Credit Reports</h2>
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-muted-foreground">Credit reports coming soon</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
