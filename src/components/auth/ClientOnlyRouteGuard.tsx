import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/** Roles allowed to access non-/app surfaces of the platform. */
const STAFF_ROLES = new Set([
  "admin",
  "super_admin",
  "owner",
  "coach",
  "sales_rep",
  "broker",
  "broker_team_member",
  "cs_rep",
  "finance",
  "moderator",
  "viewer",
  "developer",
]);

/** Routes a pure-client account is forbidden from. They get bounced to /app. */
const CLIENT_FORBIDDEN_PREFIXES = ["/admin", "/broker/app"];

/**
 * Hard guard: a signed-in account whose only role is `client` (or no role at all
 * while linked to a clients row) is locked to /app, /onboard, /auth, and public
 * pages. They cannot reach the admin, broker, or BTF workspace surfaces — even
 * if they paste a URL directly.
 */
export function ClientOnlyRouteGuard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isClientOnly, setIsClientOnly] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { setIsClientOnly(false); return; }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      const list = (roles ?? []).map((r: any) => String(r.role));
      const hasStaff = list.some((r) => STAFF_ROLES.has(r));
      setIsClientOnly(!hasStaff);
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-check on auth changes (sign-in / sign-out / role grant).
  useEffect(() => {
    const loadRoles = async (userId: string) => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const list = (roles ?? []).map((r: any) => String(r.role));
      setIsClientOnly(!list.some((r) => STAFF_ROLES.has(r)));
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) { setIsClientOnly(false); return; }
      // Keep Supabase queries out of the auth callback itself. Running them
      // synchronously here can deadlock session hydration on reload/sign-in.
      window.setTimeout(() => {
        void loadRoles(session.user.id);
      }, 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isClientOnly !== true) return;
    if (CLIENT_FORBIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p))) {
      navigate("/app", { replace: true });
    }
  }, [isClientOnly, location.pathname, navigate]);

  return null;
}
