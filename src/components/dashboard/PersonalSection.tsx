import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, CreditCard, BarChart3, FolderOpen } from "lucide-react";
import { DisputesManager } from "./DisputesManager";
import { AccountsOverview } from "./AccountsOverview";
import { ThreeBureauReport } from "./ThreeBureauReport";
import { DocumentUpload } from "./DocumentUpload";

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
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="documents" className="gap-2">
            <FolderOpen className="w-4 h-4" />
            Documents
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

        <TabsContent value="documents" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <DocumentUpload 
              documentType="drivers_license" 
              label="Driver's License" 
              bucketName="personal-documents"
            />
            <DocumentUpload 
              documentType="social_security_card" 
              label="Social Security Card" 
              bucketName="personal-documents"
            />
            <DocumentUpload 
              documentType="utility_bill" 
              label="Utility Bill" 
              description="Recent utility bill for address verification"
              bucketName="personal-documents"
            />
            <DocumentUpload 
              documentType="bank_statement" 
              label="Bank Statement" 
              description="Recent bank statement for financial verification"
              bucketName="personal-documents"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
