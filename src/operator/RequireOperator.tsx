import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { EmptyState, PageSkeleton } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

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
  /**
   * OUR OWN verdict, asked of the server. null = not answered yet.
   *
   * This exists because the context's flags are NOT trustworthy in the one moment that
   * matters most — the instant after sign-in. `useTenantContext` re-resolves on SIGNED_IN
   * via a BACKGROUND load that deliberately never flips `loading` back to true (so a routine
   * token refresh can't unmount every consumer mid-session). Correct for that purpose, and
   * fatal here: an operator who opened this page signed-out has `{loading:false,
   * isPlatformStaff:false}` latched, signs in, gets navigated here, and the guard reads those
   * stale falses as a real denial — bouncing them to `/admin`, the old console, on every
   * single login. That is the bug the owner hit, and no amount of gating on `loading` catches
   * it, because `loading` is already false and never rises again.
   *
   * So the guard asks the database directly rather than inferring from a cache it does not
   * control. The context flags remain a fast ALLOW path (no flash for an already-resolved
   * operator); only this RPC can produce a DENY.
   */
  const [verdict, setVerdict] = useState<boolean | null>(null);
  /** Set when the check has been retried to exhaustion. Never a denial — an honest failure. */
  const [unverifiable, setUnverifiable] = useState(false);

  useEffect(() => {
    let alive = true;
    /**
     * Which question the answers belong to. Every read bumps it, and a reply for an older
     * generation is dropped. Without this, a verdict issued under the PREVIOUS user's token can
     * land after the current user's and admit the wrong person: postgrest-js retries on its own
     * `Retry-After` path, so an in-flight check really can outlive the session that started it.
     */
    let generation = 0;
    /** Whose answer we currently hold, so a token refresh is not mistaken for a user swap. */
    let subject: string | null = null;

    const ask = async (gen: number) => {
      // NOTE THE SHAPE. `supabase.rpc()` is a thenable that RESOLVES with `{data, error}`; it
      // does not reject, so a `.catch()` here would never fire and a server-side failure would
      // arrive as `data: null` — which `data === true` reads as a DENY. That is precisely the
      // false-negative this guard exists to prevent, so the error field is checked explicitly.
      //
      // A failed check is NOT a denial: denying on a transient network error, or on the 401 that
      // can land mid token-refresh, would strand a legitimate operator on the old console. But
      // staying undecided forever is its own failure — a skeleton that never resolves is the
      // "silently blank" symptom (§32), indistinguishable from a crash. So we retry a bounded
      // number of times and then SAY we could not verify, rather than spinning.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const { data, error } = await supabase.rpc("is_platform_admin");
          if (!alive || gen !== generation) return;
          if (!error) {
            setVerdict(data === true);
            return;
          }
        } catch {
          if (!alive || gen !== generation) return;
        }
        // 400ms, then 800ms — long enough to outlast a refresh blip, short enough that a real
        // operator is not left staring at a skeleton.
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        if (!alive || gen !== generation) return;
      }
      if (alive && gen === generation) setUnverifiable(true);
    };

    const readSession = (userId: string | null) => {
      if (!alive) return;
      setHasSession(!!userId);
      if (!userId) {
        subject = null;
        generation += 1;
        setVerdict(false);
        return;
      }
      // A token refresh on the SAME user must not reset the verdict: doing so drops the whole
      // 78-route subtree to a skeleton, unmounting `children` and destroying in-page state (a
      // half-typed composer draft, a set of dials, a filter, the scroll position) roughly once
      // an hour. Only a genuine user swap re-opens the question.
      if (userId === subject) return;
      subject = userId;
      const gen = (generation += 1);
      setVerdict(null);
      setUnverifiable(false);
      void ask(gen);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => readSession(data.session?.user?.id ?? null))
      .catch(() => {
        if (alive) {
          setHasSession(false);
          setVerdict(false);
        }
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      readSession(session?.user?.id ?? null),
    );
    return () => {
      alive = false;
      generation += 1;
      sub.subscription.unsubscribe();
    };
  }, []);

  // 1. Signed out is authoritative and cheap — send them to the door with where they were
  //    going, before spending anything else.
  if (hasSession === false) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/operator/login?next=${next}`} replace />;
  }

  // 2. ALLOW as soon as anything says yes — our own RPC, or a context that has already
  //    resolved this operator. This is what keeps a warm navigation from flashing.
  //
  //    `verdict !== false` guards the context path: the flags are a CACHE we do not control,
  //    and after a user swap whose background revalidation failed they can still hold the
  //    PREVIOUS operator's `true`. Our own explicit DENY must outrank a stale yes.
  if (verdict === true || (verdict !== false && (isPlatformStaff || isPlatformOwner))) {
    return <>{children}</>;
  }

  // 3. The check failed and kept failing. Say so — an operator who cannot be verified gets a
  //    reason and a retry, never an endless skeleton (§32: a blank is indistinguishable from a
  //    crash) and never a bounce to the old console over what may be a network blip.
  if (unverifiable) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <EmptyState
          title="Couldn't verify your access"
          description="The platform could not confirm your operator role just now. This is usually a network hiccup rather than a permissions problem — try again."
          action={
            <Button variant="gold" onClick={() => window.location.reload()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  // 4. Nothing has said yes yet. Wait — do NOT infer a denial from silence. This is the
  //    whole point: the stale-false window after sign-in lives exactly here.
  if (hasSession === null || verdict === null || loading) return <PageSkeleton />;

  // 5. Signed in, and the server said no. A real denial: they are not an operator.
  return <Navigate to="/admin" replace />;
}
