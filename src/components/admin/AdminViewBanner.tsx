import { ArrowLeft, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useImpersonation } from "@/contexts/ImpersonationContext";
import { useTenantContext } from "@/hooks/useTenantContext";
import { workspaceRootForTenant, WORKSPACE_CHOOSER_PATH } from "@/lib/auth/workspaceEntry";

export function AdminViewBanner() {
  const { isImpersonating, target, stop } = useImpersonation();
  const navigate = useNavigate();
  const { activeTenant } = useTenantContext();

  if (!isImpersonating || !target) return null;

  const handleExit = async () => {
    const contactId = target.contactId;
    await stop();
    try { sessionStorage.removeItem("paige_stay_in_client_view"); } catch { /* best-effort cleanup */ }
    const landing = workspaceRootForTenant(activeTenant);
    const clients = landing?.replace(/\/command-center$/, "/clients/people");
    navigate(clients ? `${clients}${contactId ? `?contact=${encodeURIComponent(contactId)}` : ""}` : WORKSPACE_CHOOSER_PATH);
  };


  return (
    <div className="bg-accent text-primary flex items-center justify-between px-4 py-2 text-sm font-medium z-50">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span className="truncate">
          Viewing as <strong className="font-semibold">{target.targetName}</strong> · all actions are audit-logged
        </span>
      </div>
      <button
        onClick={handleExit}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary-light transition-colors text-xs font-semibold flex-shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Exit Client View
      </button>
    </div>
  );
}
