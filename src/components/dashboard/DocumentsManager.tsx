import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "./DocumentUpload";
import { FileText, Building } from "lucide-react";

export const DocumentsManager = () => {
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    loadBusinessId();
  }, []);

  const loadBusinessId = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (data) {
        setBusinessId(data.id);
      }
    } catch (error) {
      console.error("Error loading business ID:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Document Management</h2>
        <p className="text-muted-foreground">
          Securely store and manage your personal and business documents
        </p>
      </div>

      <Tabs defaultValue="personal" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Personal Documents
          </TabsTrigger>
          <TabsTrigger value="business" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Business Documents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <DocumentUpload
              documentType="social_security_card"
              label="Social Security Card"
              description="Upload an image of your Social Security card"
              bucketName="personal-documents"
            />
            <DocumentUpload
              documentType="drivers_license"
              label="Driver's License / ID"
              description="Upload an image of your driver's license or government-issued ID"
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
          <div className="grid gap-4 md:grid-cols-2">
            <DocumentUpload
              documentType="articles_of_incorporation"
              label="Articles of Incorporation"
              description="Upload your company's articles of incorporation or registration document"
              bucketName="business-documents"
              businessId={businessId || undefined}
            />
            <DocumentUpload
              documentType="operating_agreement"
              label="Operating Agreement"
              description="Upload your operating agreement or shareholder agreement"
              bucketName="business-documents"
              businessId={businessId || undefined}
            />
            <DocumentUpload
              documentType="ein_form"
              label="EIN Form (SS-4)"
              description="Upload your EIN confirmation letter or Form SS-4"
              bucketName="business-documents"
              businessId={businessId || undefined}
            />
            <DocumentUpload
              documentType="company_bills"
              label="Company Bills"
              description="Upload bills and invoices for your business"
              bucketName="business-documents"
              businessId={businessId || undefined}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
