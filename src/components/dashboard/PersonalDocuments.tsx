import { DocumentUpload } from "./DocumentUpload";

export function PersonalDocuments() {
  return (
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
  );
}
