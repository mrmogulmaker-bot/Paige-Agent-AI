// Onboarding gate — /onboarding
//
// Where a signed-in user with no workspace yet stands one up. This is the
// landing target `resolveLandingRoute` hands role-less, client-less, tenant-less
// users (e.g. accounts created before the tenant front door existed). It reuses
// the same WorkspaceProvisioner the signup flow uses, so there is exactly one
// path from "account" to "owns a tenant."
//
// Self-forwarding: if the user already has a workspace (or is platform staff),
// there's nothing to onboard — send them straight to /admin. Unauthenticated
// visitors are bounced to the front door.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHead } from "@/components/seo/PageHead";
import { WorkspaceProvisioner } from "@/components/onboarding/WorkspaceProvisioner";
import { Loader2 } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "ready">("checking");

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (!uid) {
        navigate("/signup", { replace: true });
        return;
      }

      // Already a tenant operator (staff, owner, or member) or a linked client?
      // Then there's nothing to provision — forward to their real home.
      const [{ data: staff }, { data: owned }, { data: member }, { data: client }] = await Promise.all([
        supabase.rpc("is_platform_admin"),
        supabase.from("tenants").select("id").eq("owner_user_id", uid).limit(1).maybeSingle(),
        supabase.from("tenant_members").select("tenant_id").eq("user_id", uid).limit(1).maybeSingle(),
        supabase.from("clients").select("id").eq("linked_user_id", uid).limit(1).maybeSingle(),
      ]);
      if (!mounted) return;
      if (staff || owned?.id || member?.tenant_id) {
        window.location.assign("/admin");
        return;
      }
      if (client?.id) {
        window.location.assign("/app");
        return;
      }
      setStatus("ready");
    })();
    return () => { mounted = false; };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHead
        title="Set up your workspace"
        description="Stand up your own Paige workspace — pick how you'll run it and name your business."
        path="/onboarding"
      />
      <div className="max-w-2xl mx-auto px-6 py-12">
        {status === "checking" ? (
          <div className="flex items-center gap-3 text-muted-foreground py-20 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" /> Getting things ready…
          </div>
        ) : (
          <>
            <header className="mb-8">
              <h1 className="font-[Playfair_Display] text-4xl md:text-5xl tracking-tight">
                Let's set up your workspace.
              </h1>
              <p className="mt-3 text-muted-foreground">
                Pick how you'll run it, then name the business. You can invite your team and add
                sub-accounts once you're in — and change any of this later as you grow.
              </p>
            </header>
            <WorkspaceProvisioner />
          </>
        )}
      </div>
    </div>
  );
}
