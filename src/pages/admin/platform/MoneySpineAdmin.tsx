import { CircleDollarSign } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: platform revenue rails Paige holds (§38) — subs, marketplace, metered usage. */
export default function MoneySpineAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={CircleDollarSign}
      title="Money Spine"
      purpose="Platform revenue: subscriptions, marketplace transactions, metered usage, dunning and refunds."
      relatedLabel="Platform financials in Analytics"
      relatedHref="/admin/analytics"
    />
  );
}
