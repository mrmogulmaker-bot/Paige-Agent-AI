import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useClientOnboardingStatus, describeBlockedReason } from "@/hooks/useClientOnboardingStatus";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  contactId: string;
  /** Kept for API back-compat; readiness is sourced from server-side status. */
  linkedUserId?: string | null;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
  label?: string;
};

/**
 * Opens the contact's `/app` workspace exactly as the client would see it,
 * scoped to the client's data. Hard-gated by `client_view_ready`: the button
 * is disabled — and the server RPC refuses — until the client has accepted
 * their invite, signed the agreement, and completed intake.
 */
export function ImpersonateClientButton({
  contactId,
  variant = "outline",
  size = "sm",
  className,
  label = "View as Client",
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { start } = useImpersonation();
  const { status, loading } = useClientOnboardingStatus(contactId);
  const [submitting, setSubmitting] = useState(false);

  const blockedReason = describeBlockedReason(status);
  const ready = !!status?.ready;
  const disabled = !ready || submitting || loading;

  const handleClick = async () => {
    if (!ready) {
      toast({
        title: "Client view unavailable",
        description: blockedReason ?? "Onboarding not complete.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const t = await start(contactId);
      try { sessionStorage.setItem("paige_stay_in_client_view", "1"); } catch {}
      toast({ title: `Viewing as ${t.targetName}`, description: "All actions are audit-logged." });
      navigate("/app?stay=1");
    } catch (e: any) {
      toast({
        title: "Couldn't open client view",
        description: e?.message ?? "You may not have access to this client.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const btn = (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={disabled}
    >
      {submitting ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : ready ? (
        <UserCircle2 className="h-4 w-4 mr-1" />
      ) : (
        <Lock className="h-4 w-4 mr-1" />
      )}
      {label}
    </Button>
  );

  if (ready) return btn;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
        <TooltipContent>{blockedReason ?? "Onboarding incomplete"}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
