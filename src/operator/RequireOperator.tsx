import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageSkeleton } from "@/components/ui/page";

/**
 * RequireOperator — the ONE guard above the whole `/operator/{section}` subtree (§53).
 *
 * The design pack's own handoff note is explicit that the guard "belongs above the router,
 * not per route", and that is also how every other tier subtree already works here — so this
 * is one instance wrapping 78 routes, never 78 copies.
 *
 * WHICH PREDICATE. `isPlatformStaff` is populated from `is_platform_admin()`, which is
 * `role = 'platform_admin' OR role = 'super_admin'` — semantically IDENTICAL to §53's
 * `is_platform_operator()`. So the correct operator predicate is ALREADY resolved in context:
 * no new RPC, no second async hop, no fork of the four-RPC waterfall `AgencyLayout` runs
 * (§18). We accept `isPlatformStaff || isPlatformOwner` because an owner is by definition
 * staff, and a partial resolution (owner flag committed before the staff flag) must never
 * flash a denial — the same reasoning `PlatformStaffOnly` carries in Admin.tsx.
 *
 * WHY THE `loading` GATE IS UNCONDITIONAL AND FIRST. This exact bug has already shipped once:
 * `useTenantContext` records that a null `getUser()` on a cold hard-load used to latch
 * `{loading:false, isPlatformStaff:false}` for the whole session — "the operator 'Restricted
 * area' bug on /admin/platform/*". Deciding before `loading` resolves reproduces it HERE, at a
 * subtree root, where the blast radius is all 78 routes at once instead of one page. So we
 * render a skeleton until the flags are real, never `null` (a blank is indistinguishable from
 * a crash, §32) and never a bare "Loading…" (§11).
 *
 * WHY A SEPARATE SESSION READ. Context exposes no session, so it cannot tell signed-OUT from
 * signed-in-but-not-an-operator. `PlatformStaffOnly` conflates them, which is tolerable on one
 * page and wrong at a subtree root: a signed-out operator opening a bookmarked
 * `/operator/fleet/tenants` would get a "Restricted area" card instead of the login form. We
 * read the session ourselves and send them to the door with `?next=` so the deep link
 * round-trips.
 *
 * WHAT THIS IS NOT. A UI guard is not the security boundary. The real boundary stays
 * server-side — RLS plus the `is_platform_operator()`-gated RPCs. This only decides what to
 * paint.
 */
export default function RequireOperator({ children }: { children: React.ReactNode }) {
  const { loading, isPlatformStaff, isPlatformOwner } = useTenantContext();
  const location = useLocation();
  // null = still resolving; true/false = a real answer.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setHasSession(!!data.session);
      })
      .catch(() => {
        // Fail toward the door, not toward a blank: an unreadable session is
        // indistinguishable from signed-out for routing purposes, and the server
        // still gates the data either way.
        if (alive) setHasSession(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setHasSession(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 1. Never decide on half-resolved state.
  if (loading || hasSession === null) return <PageSkeleton />;

  // 2. Signed out → the door, carrying where they were going.
  if (!hasSession) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/operator/login?next=${next}`} replace />;
  }

  // 3. Signed in, but not an operator → /admin re-checks auth and routes them
  //    to whatever they ARE, rather than stranding them on a dead-end card.
  if (!isPlatformStaff && !isPlatformOwner) return <Navigate to="/admin" replace />;

  return <>{children}</>;
}
