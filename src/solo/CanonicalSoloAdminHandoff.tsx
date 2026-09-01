import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState, PageSkeleton } from "@/components/ui/page";
import type { CanonicalSoloAdminOwnerDecision } from "@/solo/canonicalSoloTenant";

export function CanonicalSoloAdminHandoff({
  decision,
  onRetry,
}: {
  decision: Exclude<CanonicalSoloAdminOwnerDecision, { kind: "not_solo" }>;
  onRetry: () => void;
}) {
  if (decision.kind === "resolving") return <PageSkeleton />;

  if (decision.kind === "redirect") {
    return <Navigate to={decision.target} replace />;
  }
  const contextBlocked = decision.kind === "blocked_context";


  return (
    <div className="grid min-h-[60vh] place-items-center p-6" role="alert">
      <EmptyState
        title={contextBlocked ? "Couldn't confirm your workspace" : "Couldn't open your Solo workspace"}
        description={contextBlocked
          ? "PAIGE couldn't confirm which workspace belongs to this sign-in. Try again before continuing."
          : "PAIGE couldn't confirm this account's permanent workspace address. Try again before continuing."}
        action={
          <Button variant="gold" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
