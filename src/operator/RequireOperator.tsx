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
 * WHICH PREDICATE. The operator predicate is `is_platform_admin()`, which is
 * `role = 'platform_admin' OR role = 'super_admin'` — semantically IDENTICAL to §53's
 * `is_platform_operator()`. The guard asks the SERVER for it directly (below) rather than
 * inferring it from any client-side flag.
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

/**
 * THE ONLY CACHE THIS GUARD HONOURS, AND IT IS KEYED TO THE PERSON IT WAS ISSUED FOR.
 *
 * The point of a cache here is to spare an already-verified operator a skeleton flash every
 * time they navigate into the subtree — the guard remounts on each entry, and re-asking the
 * server means a round-trip of blank. Worth having. But a grant is about a PERSON, so a cache
 * that is not keyed to that person is not a cache, it is an unauthenticated allow: whoever is
 * signed in when it is read gets whatever the last person earned.
 *
 * That is exactly what shipped before this: the guard treated `useTenantContext`'s
 * `isPlatformStaff || isPlatformOwner` as an ALLOW while its own RPC was still in flight. Those
 * flags are plain React state on a provider mounted at the app ROOT, which never unmounts, and
 * they are refreshed on a SIGNED_IN by a BACKGROUND load that (correctly, for its own purpose)
 * bails without committing on a transient failure. So between the instant a DIFFERENT user's
 * session lands — a second sign-in in the same tab, a magic link, or the cross-tab broadcast
 * that hands tab A the session someone just created in tab B — and the instant our RPC answers
 * for them, the previous operator's `true` was still sitting there and admitted the new user to
 * all 78 routes. Under a network partition (our three attempts exhaust AND the provider's
 * background load bails, keeping the stale flags) that window did not close at all.
 *
 * So: the context flags no longer decide anything. The only thing that can pre-empt the
 * round-trip is an answer THIS GUARD got from THE SERVER for THE SAME uid, held here at module
 * scope so it survives the remounts it exists to smooth over — and discarded the moment the uid
 * changes or the session ends. In-memory on purpose: a persisted cache would outlive the tab
 * and hand the next person at this browser a grant they were never issued.
 *
 * A server answer always outranks it: the RPC re-runs on every subject change and its verdict
 * overwrites this one, so a revoked role denies on the next entry rather than living here.
 */
let verifiedSubject: { uid: string; isOperator: boolean } | null = null;

export default function RequireOperator({ children }: { children: React.ReactNode }) {
  // Read for `loading` ONLY — the staff/owner flags are deliberately not consulted, per the
  // note above. This still holds children back until the shared tenant scope has resolved
  // once, which the console's chrome depends on.
  const { loading } = useTenantContext();
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
   * it, because `loading` is already false and never rises again. The same staleness in the
   * other direction is the reason those flags cannot grant, either.
   *
   * So the guard asks the database directly rather than inferring from a cache it does not
   * control, and pre-empts the wait only from its own subject-keyed answer above.
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

    const ask = async (gen: number, uid: string) => {
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
            const isOperator = data === true;
            // Filed AGAINST THE UID it was issued for. `gen === generation` above proves that
            // uid is still the one signed in, so this can never be stamped with the wrong name.
            verifiedSubject = { uid, isOperator };
            setVerdict(isOperator);
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
        // SIGNED OUT. Burn the grant with the session that earned it — leaving it behind is
        // how the next person to sign in at this browser inherits someone else's console.
        verifiedSubject = null;
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
      // A DIFFERENT person is signed in now. Anything remembered for someone else is dropped
      // outright rather than merely ignored, so no later code path can reach it.
      if (verifiedSubject && verifiedSubject.uid !== userId) verifiedSubject = null;
      // Pre-empt the round-trip ONLY from a server answer this guard already got for THIS uid
      // — never from a cached DENY (a role granted a moment ago must not be locked out by a
      // stale no) and never from anyone else's grant.
      setVerdict(verifiedSubject?.isOperator === true ? true : null);
      setUnverifiable(false);
      void ask(gen, userId);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => readSession(data.session?.user?.id ?? null))
      .catch(() => {
        if (alive) {
          // We could not establish WHO this is, so nothing remembered about anyone may stand.
          verifiedSubject = null;
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

  // 2. ALLOW only on a server answer that belongs to WHOEVER IS SIGNED IN NOW — either the
  //    round-trip that just resolved, or the subject-keyed memo it seeded `verdict` from,
  //    which is discarded the instant the uid changes. That is what keeps a warm navigation
  //    from flashing without ever letting one person's grant admit another.
  if (verdict === true) {
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
