import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import {
  FLEET_COMMUNICATIONS_DESTINATION,
  parseOperatorWorkspace,
} from "@/lib/platform/fleetCommunications";

/**
 * Transient God -> Paige Operations scope switch.
 *
 * This route deliberately owns no capability UI. After the verified switch it
 * replaces itself with the existing Clients -> Conversations home, whose native
 * tabs remain the only People / Pipeline / Conversations / Delivery / Portal taxonomy.
 */
export default function PlatformFleetCommunications() {
  const navigate = useNavigate();
  const { switchTenant } = useTenantContext();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;

    const returnToFleet = (message: string) => {
      toast.error(message);
      navigate("/admin/platform/tenants", { replace: true });
    };

    void (async () => {
      // The RPC ships in the Fleet migration; generated database types update after deployment.
      const { data, error } = await supabase.rpc("resolve_platform_operator_workspace" as never);
      if (cancelled) return;
      const workspace = error ? null : parseOperatorWorkspace(data);
      if (!workspace) {
        returnToFleet("Paige Operations is unavailable. No tenant context was changed.");
        return;
      }

      const switched = await switchTenant(workspace.id);
      if (cancelled) return;
      if (!switched) {
        returnToFleet("Paige Operations could not be opened. Your platform view was not changed.");
        return;
      }

      navigate(FLEET_COMMUNICATIONS_DESTINATION, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [navigate, switchTenant]);

  return (
    <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Opening Paige Operations…
    </div>
  );
}
