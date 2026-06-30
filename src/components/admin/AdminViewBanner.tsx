import { ArrowLeft, Shield, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardMode } from "@/contexts/DashboardModeContext";
import { useImpersonation } from "@/contexts/ImpersonationContext";

export function AdminViewBanner() {
  const { isCoachOrAdmin, mode } = useDashboardMode();
  const { isImpersonating, target, stop } = useImpersonation();
  const navigate = useNavigate();

  // Highest priority: viewing as a specific client.
  if (isImpersonating && target) {
    const handleExit = async () => {
      await stop();
      try { sessionStorage.removeItem("paige_stay_in_client_view"); } catch {}
      navigate("/admin");
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

  // Fallback: generic "preview as client" toggle from AdminLayout.
  if (!isCoachOrAdmin || mode !== "client") return null;

  const handleReturn = () => {
    try { sessionStorage.removeItem("paige_stay_in_client_view"); } catch {}
    navigate("/admin");
  };

  return (
    <div className="bg-accent text-primary flex items-center justify-between px-4 py-2 text-sm font-medium z-50">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" />
        <span>You're previewing the client experience (no client selected)</span>
      </div>
      <button
        onClick={handleReturn}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary-light transition-colors text-xs font-semibold"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Return to Admin
      </button>
    </div>
  );
}
