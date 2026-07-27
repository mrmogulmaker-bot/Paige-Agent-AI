import { LayoutTemplate } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: coaching-generic Playbook seeds, form templates, Studio gallery shipped to every tenant (§2/§9). */
export default function ContentDefaultsAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={LayoutTemplate}
      title="Content Defaults"
      purpose="The coaching-generic Playbook seeds, form templates, and Studio template gallery that ship to every tenant."
    />
  );
}
