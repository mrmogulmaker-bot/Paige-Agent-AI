import { ArrowLeft, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardMode } from "@/contexts/DashboardModeContext";

export function AdminViewBanner() {
  const { isCoachOrAdmin, mode } = useDashboardMode();
  const navigate = useNavigate();

  // Only show when admin/coach is viewing client mode
  if (!isCoachOrAdmin || mode !== "client") return null;

  const handleReturn = () => {
    try { sessionStorage.removeItem("paige_stay_in_client_view"); } catch {}
    navigate("/admin");
  };

  return (
    <div className="bg-accent text-primary flex items-center justify-between px-4 py-2 text-sm font-medium z-50">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" />
        <span>You're viewing the client experience</span>
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
