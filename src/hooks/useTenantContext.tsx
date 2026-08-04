/**
 * Tenant context — the SINGLE source of truth for which tenant the current user
 * is "viewing", shared across the whole app via a real React Context.
 *
 * - Platform owner / staff (Paige Agent AI master admin): sees every tenant;
 *   switching writes `profiles.active_tenant_id` so the `current_user_tenant_id()`
 *   SQL helper scopes all reads/writes to the chosen tenant. With NO tenant
 *   selected they operate at the God/platform tier (`activeTenantId === null`).
 * - Tenant member: sees only their own tenant(s); switching also works when they
 *   belong to multiple.
 *
 * ARCHITECTURE (fixed 2026-07-28): this used to be a plain hook with its own
 * `useState`, so EVERY caller got an ISOLATED copy of the state — a switch in the
 * TenantSwitcher never reached AdminLayout's `godMode`, so the operator/tenant
 * MODE switch silently failed to commit. It is now a genuine provider (one state,
 * every consumer shares it) mounted once at the app root (App.tsx), mirroring the
 * other app contexts under `src/contexts/*`. A switch now propagates to every
 * consumer synchronously AND persists across navigation.
 *
 * No realtime — this changes rarely. Components call `refresh()` after mutations.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * #233 — on a GENUINE new sign-in, reset the active tenant to the user's HOME.
 *
 * A "genuine new sign-in" is discriminated from the routine SIGNED_IN re-emits
 * (tab refocus), TOKEN_REFRESHED events, and plain reloads by whether Supabase's
 * `session.user.last_sign_in_at` has ADVANCED past the value we last handled. We
 * persist that per-user timestamp in localStorage and compare it on every load.
 *
 * The read may THROW (private mode / disabled storage). We must fail TOWARD
 * not-resetting (fold-fix #4): an unreadable prior-state can never be burned, so
 * treating it as "fresh" would re-fire the reset on EVERY load and yank the user
 * mid-session forever. `ok:false` therefore suppresses the reset entirely. An
 * ABSENT key in a READABLE store is different — it CAN be written once — so it
 * counts as fresh, resets a single time, then burns.
 */
const FRESH_SIGNIN_KEY = "paige.auth.lastSignInAt.";

function readHandledSignIn(uid: string): { ok: boolean; value: string | null } {
  try {
    return { ok: true, value: localStorage.getItem(FRESH_SIGNIN_KEY + uid) };
  } catch {
    return { ok: false, value: null };
  }
}

function burnHandledSignIn(uid: string, value: string): void {
  try {
    localStorage.setItem(FRESH_SIGNIN_KEY + uid, value);
  } catch {
    // Unwritable store — the reset already committed to the DB (the durable
    // source of truth); we simply can't cache the freshness marker. Worst case
    // the next load re-evaluates, finds home === current, and no-ops the write.
  }
}

function clearHandledSignIn(uid: string): void {
  try {
    localStorage.removeItem(FRESH_SIGNIN_KEY + uid);
  } catch {
    // Nothing to clear if the store is unavailable.
  }
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  plan_offer: string | null;
  seat_limit: number;
  customer_limit: number;
  owner_user_id: string | null;
  /** Capability flag: 'standalone' | 'agency' | 'enterprise'. Gates sub-accounts. */
  account_type: string;
  parent_tenant_id: string | null;
}

interface TenantContextState {
  loading: boolean;
  isPlatformOwner: boolean;
  /** Owner OR scoped Platform Admin — sees the God console instead of the agency CRM. */
  isPlatformStaff: boolean;
  tenants: TenantSummary[];
  activeTenantId: string | null;
  activeTenant: TenantSummary | null;
  switchTenant: (tenantId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantContextState | null>(null);

/**
 * Mount ONCE at the app root, inside QueryClientProvider (App.tsx). Holds the one
 * shared tenant-scope state for the whole tree.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [isPlatformStaff, setIsPlatformStaff] = useState(false);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  // The uid resolved by the last successful load — captured so the SIGNED_OUT
  // handler (whose session is already null) can clear THIS user's freshness
  // marker for the correct per-uid key (fold-fix #5).
  const activeUidRef = useRef<string | null>(null);

  // The provider always mounts inside QueryClientProvider (App.tsx), so this is
  // unconditional and safe. Switching the active tenant changes the scope of
  // EVERY tenant-scoped React Query cache entry, so on a switch we invalidate the
  // whole cache and let scope-dependent data refetch under the new scope (§9).
  const queryClient = useQueryClient();

  // `background` = a revalidation fired by an auth event (not the initial mount).
  // A background load MUST NOT (a) toggle `loading` — that unmounts every consumer
  // gating on it (PlatformStaffOnly, PaigeWorkspace) mid-session, losing dialog/form
  // state and flashing a loader on every routine TOKEN_REFRESHED — nor (b) overwrite
  // an already-valid context with a transient query failure (which would flip an
  // operator out of platform mode or empty a tenant's workspace). So on background it
  // stays silent and commits ONLY on a fully-successful read; the first mount keeps
  // the blocking loader (there's no prior state to preserve) so the gate resolves once.
  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      // getSession() reads the session Supabase restores from localStorage. On a
      // COLD hard-load / deep-link this can already be present when getUser() (a
      // network round-trip) would still resolve null — and a null here used to
      // latch {loading:false, isPlatformStaff:false} for the whole session (the
      // operator "Restricted area" bug on /admin/platform/*). Pair with the
      // onAuthStateChange re-run below so a late hydration always re-resolves.
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) {
        // No session is authoritative from local storage (getSession, unlike getUser,
        // doesn't fail transiently on the network) — a real signed-out state. Clear.
        activeUidRef.current = null;
        setTenants([]);
        setActiveTenantId(null);
        setIsPlatformOwner(false);
        setIsPlatformStaff(false);
        return;
      }
      activeUidRef.current = uid;

      const [owner, staff, profileRes, tenantsRes] = await Promise.all([
        supabase.rpc("is_platform_owner"),
        supabase.rpc("is_platform_admin"),
        // #233: fold `agency_login_default` into the SAME round-trip (never a
        // serial read) so the fresh-login reset can honor the #191 opt-in below.
        supabase.from("profiles").select("active_tenant_id, agency_login_default").eq("user_id", uid).maybeSingle(),
        // RLS already filters: platform staff see all, members see their own.
        supabase
          .from("tenants")
          .select("id, slug, name, status, plan_offer, seat_limit, customer_limit, owner_user_id, account_type, parent_tenant_id")
          .order("created_at", { ascending: true }),
      ]);

      // On a BACKGROUND revalidation, never degrade a good state on a transient
      // failure — bail and keep the last successfully-resolved context; the next auth
      // event (or a user action) retries. The initial load still commits what resolves
      // (empty on error is the honest first-paint, corrected by the next event).
      if (background && (owner.error || staff.error || tenantsRes.error)) return;

      setIsPlatformOwner(Boolean(owner.data));
      setIsPlatformStaff(Boolean(staff.data));
      setTenants((tenantsRes.data ?? []) as TenantSummary[]);
      // Platform staff must NOT be auto-scoped into a tenant just because RLS
      // lets them read all of them — they operate at the God tier by default.
      const baseActiveTenantId =
        profileRes.data?.active_tenant_id ??
        (staff.data ? null : (tenantsRes.data?.[0] as TenantSummary | undefined)?.id ?? null);
      setActiveTenantId(baseActiveTenantId);

      // --- #233: on a GENUINE new sign-in, reset the active tenant to the user's
      // HOME so a fresh login lands on home instead of wherever the last session
      // was parked (a stale sub-account, an entered agency child). Freshness is
      // `session.user.last_sign_in_at` advancing past the value we last handled;
      // routine SIGNED_IN re-emits / TOKEN_REFRESHED / reloads carry the SAME
      // timestamp and are left alone. Consulted here inside load() so BOTH the
      // event handler AND the INITIAL_SESSION / mount path get it (fold-fix #3:
      // OAuth / magic-link full-reload emits INITIAL_SESSION, not SIGNED_IN).
      const lastSignInAt = session?.user?.last_sign_in_at ?? null;
      const handled = readHandledSignIn(uid);
      const isFreshLogin =
        handled.ok && lastSignInAt !== null && handled.value !== lastSignInAt;

      // A profileRes read failure means we can't read the #191 opt-in, so we
      // skip the reset (don't reset, don't burn → the next event retries) rather
      // than risk overriding a `last_account` preference we couldn't see.
      if (isFreshLogin && !profileRes.error) {
        if (profileRes.data?.agency_login_default === "last_account") {
          // Explicit user preference wins (§36/§46) — keep the last account, do
          // NOT reset. Mark the login handled so a same-timestamp re-emit (and a
          // mid-session settings change) can't retroactively fire the reset.
          burnHandledSignIn(uid, lastSignInAt);
        } else {
          // Resolve HOME. Staff/God short-circuit BEFORE the RPC → home = null
          // (they operate at the platform tier). Everyone else gets the single
          // deterministic primary tenant (ranked is_owner→owner→admin→coach,
          // tie-break tenant_created_at ASC, tenant_id ASC — no #588
          // nondeterminism, and ONLY the caller's own entitled memberships, §9).
          let home: string | null = null;
          if (!staff.data) {
            const primary = await supabase.rpc("get_user_primary_tenant", { _user_id: uid });
            if (primary.error) {
              // Couldn't resolve home — leave scope on the committed base and do
              // NOT burn, so the next auth event retries (fold-fix #1: never lose
              // the reset by burning the marker before it actually completes).
              return;
            }
            home = primary.data?.[0]?.tenant_id ?? null;
          }
          if (home === baseActiveTenantId) {
            // Already home — nothing to persist; mark the login handled.
            burnHandledSignIn(uid, lastSignInAt);
          } else {
            // Persist so current_user_tenant_id() (RLS) and the client agree (§9).
            const reset = await supabase
              .from("profiles")
              .update({ active_tenant_id: home })
              .eq("user_id", uid);
            if (reset.error) {
              // Guard (fold-fix #2): the DB write FAILED — do NOT flip the client
              // to home (that would split client=home / DB=child scope) and do
              // NOT burn; retry on the next auth event with DB and client aligned.
              return;
            }
            // Commit + invalidate ONLY after the write succeeds, then burn the
            // marker LAST (fold-fix #1) so the reset is never lost on a bail.
            setActiveTenantId(home);
            queryClient.invalidateQueries();
            burnHandledSignIn(uid, lastSignInAt);
          }
        }
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    load();
    // Re-resolve when auth settles. The FIRST load() can run before Supabase
    // rehydrates the session on a hard reload / deep-link; without this listener
    // (this was the ONE auth context missing it) a pre-hydration null latched the
    // staff flags to false forever, stranding an operator on "Restricted area".
    // These events fire routinely (hourly token refresh, tab refocus), so the re-run
    // is a BACKGROUND revalidation — no loading flash, no partial-commit on failure.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Clear THIS user's freshness marker so the NEXT sign-in (this user
        // again, or a different user on the same browser) is correctly seen as
        // genuine (fold-fix #5). The session is already null here, so we use the
        // uid captured on the last successful load, not a read-back of the session.
        const priorUid = activeUidRef.current;
        if (priorUid) clearHandledSignIn(priorUid);
        activeUidRef.current = null;
        load(true);
        return;
      }
      // INITIAL_SESSION is included so the OAuth / magic-link full-reload path
      // (which does NOT emit SIGNED_IN) still runs load() → the #233 freshness
      // check, instead of restoring the stale parked scope (fold-fix #3).
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        load(true);
      }
    });
    return () => subscription.unsubscribe();
  }, [load]);

  const switchTenant = useCallback(async (tenantId: string | null) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    // Optimistically flip the shared state FIRST so the whole tree (nav mode,
    // switcher label, data scope) re-renders immediately, then persist. Because
    // this is the one shared provider, every consumer sees the new value at once —
    // this is what makes the operator/tenant MODE switch actually commit.
    setActiveTenantId(tenantId);
    await supabase.from("profiles").update({ active_tenant_id: tenantId }).eq("user_id", uid);
    // Scope changed for everything — a broad invalidate is correct here (§9).
    queryClient.invalidateQueries();
  }, [queryClient]);

  const activeTenant = tenants.find((t) => t.id === activeTenantId) ?? null;

  const value: TenantContextState = {
    loading,
    isPlatformOwner,
    isPlatformStaff,
    tenants,
    activeTenantId,
    activeTenant,
    switchTenant,
    // Always a foreground refresh — wrapped so an event-handler caller (onClick={refresh})
    // can't pass its event as the `background` arg and silently skip the loader/commit.
    refresh: () => load(),
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

/**
 * Read the shared tenant context. MUST be used under <TenantProvider> (mounted at
 * the app root). Throwing here surfaces a mis-mount immediately instead of the old
 * silent per-component-state bug.
 */
export function useTenantContext(): TenantContextState {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error("useTenantContext must be used within a <TenantProvider> (see App.tsx).");
  }
  return ctx;
}
