import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, CreditCard, BarChart3 } from "lucide-react";
import { DisputesManager } from "./DisputesManager";
import { AccountsOverview } from "./AccountsOverview";
import { ThreeBureauReport } from "./ThreeBureauReport";

export function PersonalSection() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
          Personal Credit
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage all aspects of your personal credit profile
        </p>
      </div>

      <Tabs defaultValue="accel" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
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
