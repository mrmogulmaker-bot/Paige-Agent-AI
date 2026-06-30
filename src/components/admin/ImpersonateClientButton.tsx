import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useImpersonation } from "@/contexts/ImpersonationContext";

type Props = {
  contactId: string;
  linkedUserId: string | null;
  /** Visual variants */
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
  className?: string;
  label?: string;
};

/**
 * Opens the contact's `/app` workspace exactly as the client would see it,
 * scoped to the client's data. Tenant staff & platform admins only — gated
 * server-side by `start_client_impersonation` + `can_access_contact`.
 */
export function ImpersonateClientButton({
  contactId,
  linkedUserId,
  variant = "outline",
  size = "sm",
  className,
  label = "View as Client",
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { start } = useImpersonation();
  const [loading, setLoading] = useState(false);

  const disabled = !linkedUserId || loading;

  const handleClick = async () => {
    if (!linkedUserId) {
      toast({
        title: "Client hasn't activated yet",
        description: "They need to accept their invite and set a password first.",
      });
      return;
    }
    setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={disabled}
      title={!linkedUserId ? "Client hasn't accepted their invite yet" : "Open this client's workspace"}
    >
      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserCircle2 className="h-4 w-4 mr-1" />}
      {label}
    </Button>
  );
}
