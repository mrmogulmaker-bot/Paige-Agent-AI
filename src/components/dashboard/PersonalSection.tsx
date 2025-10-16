import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, FileText, CreditCard, BarChart3 } from "lucide-react";
import { PersonalCreditDashboard } from "./PersonalCreditDashboard";
import { DisputesManager } from "./DisputesManager";
import { AccountsOverview } from "./AccountsOverview";
import { ThreeBureauReport } from "./ThreeBureauReport";

export function PersonalSection() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="accel" className="gap-2">
            <FileText className="w-4 h-4" />
            ACCEL
          </TabsTrigger>
          <TabsTrigger value="accounts" className="gap-2">
            <CreditCard className="w-4 h-4" />
            Credit Accounts
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Credit Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <PersonalCreditDashboard />
        </TabsContent>

        <TabsContent value="accel" className="mt-6">
          <DisputesManager personalOnly={true} />
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <AccountsOverview personalOnly={true} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ThreeBureauReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
