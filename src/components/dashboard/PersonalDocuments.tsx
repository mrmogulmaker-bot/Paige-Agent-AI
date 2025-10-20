import { DocumentUpload } from "./DocumentUpload";
import { PlanGate } from "./PlanGate";
import { useState } from "react";
import { UpgradeModal } from "./UpgradeModal";

export function PersonalDocuments() {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  return (
    <>
      <PlanGate 
        feature="document_upload"
        onUpgradeClick={() => setShowUpgradeModal(true)}
      >
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-gold bg-clip-text text-transparent">
              Personal Documents
            </h1>
            <p className="text-muted-foreground mt-2">
              Upload and manage your personal verification documents
            </p>
          </div>

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
        </div>
      </PlanGate>
      
      <UpgradeModal 
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </>
  );
}
