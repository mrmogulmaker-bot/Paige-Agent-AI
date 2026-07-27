import { Network } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: multi-LLM router — provider status, routing tiers, cost caps (§14/§34). */
export default function ModelRouterAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={Network}
      title="Model Router"
      purpose="Provider status, routing tiers, and cost caps across the multi-LLM router."
      relatedLabel="Live model/provider status in Intelligence"
      relatedHref="/admin/platform/intelligence"
    />
  );
}
