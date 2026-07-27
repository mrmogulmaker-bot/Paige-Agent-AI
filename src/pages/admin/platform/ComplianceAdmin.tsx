import { ShieldCheck } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: platform audit log, cross-tenant access review, integrity guardrails (§9/§17). */
export default function ComplianceAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={ShieldCheck}
      title="Compliance"
      purpose="Browse the platform audit log, review cross-tenant access, and check integrity guardrails."
    />
  );
}
