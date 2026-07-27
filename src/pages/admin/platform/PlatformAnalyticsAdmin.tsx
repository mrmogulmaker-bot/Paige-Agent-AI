import { LineChart } from "lucide-react";
import { OperatorSurfacePlaceholder } from "@/components/admin/platform/OperatorSurfacePlaceholder";

/** Operator: fleet-wide analytics — onboarding funnel, trial-to-paid, revenue-stage graduation (§17). */
export default function PlatformAnalyticsAdmin() {
  return (
    <OperatorSurfacePlaceholder
      icon={LineChart}
      title="Analytics"
      purpose="Onboarding funnel, trial-to-paid conversion, and revenue-stage graduation across the fleet."
      relatedLabel="Current operator analytics"
      relatedHref="/admin/analytics"
    />
  );
}
