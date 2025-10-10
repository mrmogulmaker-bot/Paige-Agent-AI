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
import { ThreeBureauReport } from "@/components/dashboard/ThreeBureauReport";
import { Button } from "@/components/ui/button";
import { FileUp, Bell } from "lucide-react";

const Dashboard = () => {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [showAccel, setShowAccel] = useState(true);
  const [showBuild, setShowBuild] = useState(true);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeSection={activeSection} setActiveSection={setActiveSection} />
        <main className="flex-1 p-8 bg-background overflow-auto">
          {activeSection === "dashboard" && (
            <div className="space-y-8 max-w-7xl mx-auto">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-4xl font-bold mb-2 bg-gradient-gold bg-clip-text text-transparent">
                    Welcome Back, Mentee
                  </h1>
                  <p className="text-muted-foreground">Track your journey to financial empowerment</p>
                </div>
                <div className="flex gap-3">
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
          {activeSection === "build-steps" && <BuildSteps />}
          {activeSection === "reports" && <ReportsView />}
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
