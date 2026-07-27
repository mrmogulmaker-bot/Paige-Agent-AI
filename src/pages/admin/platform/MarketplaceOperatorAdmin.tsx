import { Store } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: fleet-wide Marketplace moderation & revenue-share (§9 platform surface). */
export default function MarketplaceOperatorAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={Store}
      title="Marketplace"
      purpose="Approve, moderate, feature, and set revenue-share on Marketplace items across the fleet."
    />
  );
}
