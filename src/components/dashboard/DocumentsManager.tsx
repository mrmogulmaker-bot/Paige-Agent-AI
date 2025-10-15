import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "./DocumentUpload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface DocumentsManagerProps {
  businessId?: string;
}

export const DocumentsManager = ({ businessId }: DocumentsManagerProps) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Document Management</h2>
        <p className="text-muted-foreground">
          Upload and manage your personal and business documents securely.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          All documents are encrypted and stored securely. Maximum file size: 10MB.
          Accepted formats: JPEG, PNG, WebP, PDF.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal">Personal Documents</TabsTrigger>
          <TabsTrigger value="business">Business Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DocumentUpload
              documentType="ssn_card"
              label="Social Security Card"
              description="Upload a clear photo or scan of your SSN card"
              bucketName="personal-documents"
            />
            <DocumentUpload
              documentType="drivers_license"
              label="Driver's License / ID"
              description="Upload a photo of your government-issued ID"
              bucketName="personal-documents"
            />
            <DocumentUpload
              documentType="utility_bill"
              label="Utility Bill"
              description="Upload a recent utility bill for address verification"
              bucketName="personal-documents"
            />
          </div>
        </TabsContent>

        <TabsContent value="business" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <DocumentUpload
              documentType="articles_of_incorporation"
              label="Articles of Incorporation"
              description="Company registration or formation document"
              bucketName="business-documents"
              businessId={businessId}
            />
            <DocumentUpload
              documentType="operating_agreement"
              label="Operating Agreement"
              description="Operating or shareholder agreement"
              bucketName="business-documents"
              businessId={businessId}
            />
            <DocumentUpload
              documentType="ein_form"
              label="EIN Confirmation (SS-4)"
              description="IRS EIN confirmation letter"
              bucketName="business-documents"
              businessId={businessId}
            />
            <DocumentUpload
              documentType="company_bill_1"
              label="Company Bill #1"
              description="Upload business utility or service bill"
              bucketName="business-documents"
              businessId={businessId}
            />
            <DocumentUpload
              documentType="company_bill_2"
              label="Company Bill #2"
              description="Upload another business bill"
              bucketName="business-documents"
              businessId={businessId}
            />
            <DocumentUpload
              documentType="company_bill_3"
              label="Company Bill #3"
              description="Upload additional business bill"
              bucketName="business-documents"
              businessId={businessId}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
