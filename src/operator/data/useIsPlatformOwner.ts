import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Is this session the platform OWNER (`super_admin`)? Asked of the server, not inferred.
 *
 * WHY THIS EXISTS. `useTenantContext.isPlatformOwner` cannot answer it reliably at the moment it
 * matters most. That hook re-resolves on `SIGNED_IN` through a BACKGROUND load which deliberately
 * never raises `loading` again, so an operator who opened the page signed OUT carries
 * `{loading:false, isPlatformOwner:false}` into the signed-in render. Gating on `loading` does not
 * help: it is already false and never rises. So `isPlatformOwner === false` there means "not yet
 * asked" just as often as it means "no" — and the two are not interchangeable when the
 * consequence is a `replace` navigation that DESTROYS the URL the operator asked for.
 *
 * `is_platform_owner()` is §53's frozen super-admin-only predicate — the same one the integrity
 * gates use — so this is the authority, not a second opinion.
 *
 * null = not answered yet. Callers must treat it as "wait", never as "no".
 */
export function useIsPlatformOwner(): boolean | null {
  const [owner, setOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    /** Drops a reply that belongs to a session which has since been replaced. */
    let generation = 0;
    let subject: string | null = null;

    const ask = async (userId: string | null) => {
      if (!alive) return;
      if (!userId) {
        subject = null;
        generation += 1;
        setOwner(false);
        return;
      }
      // A token refresh on the SAME user must not re-open the question: doing so would flip the
      // answer back to null and re-trigger every consumer's waiting state on a timer.
      if (userId === subject) return;
      subject = userId;
      const gen = (generation += 1);
      setOwner(null);
      // `supabase.rpc()` RESOLVES with `{data, error}` rather than rejecting, so the error field
      // is checked explicitly — a failed check must not read as a denial (that is the whole bug
      // this pattern exists to avoid). An unanswered check stays null and the caller keeps waiting.
      try {
        const { data, error } = await supabase.rpc("is_platform_owner");
        if (!alive || gen !== generation) return;
        setOwner(error ? null : data === true);
      } catch {
        if (alive && gen === generation) setOwner(null);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => ask(data.session?.user?.id ?? null))
      .catch(() => {
        if (alive) setOwner(null);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      ask(session?.user?.id ?? null),
    );
    return () => {
      alive = false;
      generation += 1;
      sub.subscription.unsubscribe();
    };
  }, []);

  return owner;
}
