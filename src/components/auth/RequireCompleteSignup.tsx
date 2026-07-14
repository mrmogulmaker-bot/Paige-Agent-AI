// RequireCompleteSignup — defense-in-depth gate for the app shells (Task #187)
//
// resolveLandingRoute already sends a signed-in-but-workspace-less user to
// /onboarding on login, and provision_tenant enforces the agreement hard-stop
// server-side. This wrapper closes the remaining hole: a signed-in user who has
// NOT completed signup typing /admin, /agency, or /app directly. It bounces them
// to the /onboarding gate to finish (pick a lane + sign the agreement).
//
// Fail-open by construction (§13): it renders children immediately and only
// redirects when is_signup_complete() returns EXACTLY false. On any error, while
// loading, or when signed-out (other guards own that case), it leaves children
// alone — so a false negative can never strand a real, completed user. It also
// agrees with /onboarding's own forward logic, so there is no redirect ping-pong.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function RequireCompleteSignup({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) return; // not signed in — auth guards handle this
        const { data, error } = await supabase.rpc("is_signup_complete");
        if (!active || error) return; // errors fail open — never strand a user
        if (data === false) {
          setRedirecting(true);
          navigate("/onboarding", { replace: true });
        }
      } catch {
        /* fail open */
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  // Don't flash app chrome once we've decided to send them to onboarding.
  if (redirecting) return null;
  return <>{children}</>;
}
