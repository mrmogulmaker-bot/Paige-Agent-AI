import { DocumentUpload } from "./DocumentUpload";
import { PlanGate } from "./PlanGate";
import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";

export function BusinessDocuments() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <>
      <PlanGate 
        feature="business_document_upload"
        onUpgradeClick={() => setShowUpgradeModal(true)}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-foreground">
              Business Documents
            </h1>
            <p className="text-muted-foreground mt-2">
              Upload and manage your business verification documents
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <DocumentUpload 
              documentType="articles_of_incorporation" 
              label="Articles of Incorporation" 
              bucketName="business-documents"
            />
            <DocumentUpload 
              documentType="ein_letter" 
              label="EIN Letter" 
              bucketName="business-documents"
            />
            <DocumentUpload 
              documentType="operating_agreement" 
              label="Operating Agreement" 
              bucketName="business-documents"
            />
            <DocumentUpload 
              documentType="business_license" 
              label="Business License" 
              bucketName="business-documents"
            />
          </div>
        </div>
      </PlanGate>
      
      <UpgradeModal 
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </>
  );
}
