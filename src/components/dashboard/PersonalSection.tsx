import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, CreditCard, BarChart3 } from "lucide-react";
import { PersonalCreditDashboard } from "./PersonalCreditDashboard";
import { AccountsOverview } from "./AccountsOverview";
import { ThreeBureauReport } from "./ThreeBureauReport";

// [§194] Credit monitoring surface only. Dispute/ACCEL-repair tab removed.
export function PersonalSection() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Overview
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
