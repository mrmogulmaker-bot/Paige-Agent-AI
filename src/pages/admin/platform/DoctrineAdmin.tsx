import { ScrollText } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: read-only operating doctrine + amendments audit trail. */
export default function DoctrineAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={ScrollText}
      title="Doctrine"
      purpose="Read-only view of the operating doctrine and the amendments audit trail."
    />
  );
}
