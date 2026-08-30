/**
 * useCalendarConnections — the read/write seam behind Settings › Connections › Calendars.
 *
 * Three separate truths live here, and keeping them separate is the point:
 *
 *  1. PROVIDERS are personal. `staff_calendar_settings` is keyed on `user_id`, so
 *     "Google is connected" is a fact about the signed-in person, never about the
 *     workspace. On a round-robin calendar each host connects their own account;
 *     a host who has not still takes bookings, they just get no two-way sync.
 *     The surface has to say that, so this hook never launders it into a
 *     workspace-level claim.
 *
 *  2. CALENDARS are tenant-scoped. Reads are `.eq("tenant_id", activeTenantId)`
 *     and RLS decides what comes back; we never send a tenant id we were handed
 *     by the caller (§9).
 *
 *  3. SEND CAPABILITY is neither. Whether a reminder can actually reach anyone is
 *     owned by Communications, and it is read from the same four seams the
 *     `comms_configured` Systems Check runner uses — a sending identity, plus a
 *     primary number or an A2P registration, plus a business phone on the brand.
 *     Calendars reads that answer; it must never assert one of its own (§13).
 *
 * The third one carries a distinction the UI depends on: a read that FAILED is
 * `unknown`, not `false`. "We could not check" and "this cannot send" are
 * different sentences, and showing the second when the first is true is the kind
 * of confident wrongness that gets a reminder rule deleted for no reason.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";
import {
  DEFAULT_AVAIL, SELECT_COLS, availToJson, blankDraft, buildCalendarPatch, randomSuffix, slugify,
  type CalendarRow,
} from "@/lib/calendar/config";
import { armOAuthReturn, clearOAuthReturn } from "./oauthReturn";

/**
 * `tenant_phone_numbers`, `tenant_a2p_registrations` and the two tenant helper
 * functions are live on the database but absent from the generated types, so
 * they have no typed accessor. Verified against production 2026-08-30: both
 * tables carry RLS with a tenant-scoped SELECT policy, and
 * `current_user_tenant_id()` / `is_current_user_tenant_admin()` both take zero
 * arguments and are granted to `authenticated`. This is the same escape hatch
 * the Settings surface already uses for `resolve_tenant_domain_identity`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabase as any;

/* ------------------------------------------------------------- providers */

export interface ProviderState {
  google_calendar_connected: boolean;
  google_email: string | null;
  google_last_sync_at: string | null;
  apple_caldav_connected: boolean;
  apple_last_sync_at: string | null;
  zoom_connected: boolean;
  zoom_email: string | null;
}

const EMPTY_PROVIDERS: ProviderState = {
  google_calendar_connected: false,
  google_email: null,
  google_last_sync_at: null,
  apple_caldav_connected: false,
  apple_last_sync_at: null,
  zoom_connected: false,
  zoom_email: null,
};

/* ------------------------------------------------------------- readiness */

/** `unknown` means the read did not answer — never treat it as a no. */
export type Capability = "yes" | "no" | "unknown";

export interface SendReadiness {
  email: Capability;
  sms: Capability;
  /** What is missing, in the tenant's language. Empty when nothing is. */
  missing: string[];
  /**
   * The same reasons, tagged with the channel each one actually blocks. A
   * calendar that only sends email must not be told about a missing text
   * registration — that is how a correct configuration gets "fixed" into a
   * broken one.
   */
  missingByChannel: { channel: "email" | "sms"; label: string }[];
  /** True when at least one of the four reads failed, so the answer is partial. */
  partial: boolean;
  /**
   * True when this surface is showing an account other than the caller's own, so
   * the readiness tables were never readable and no negative can be drawn.
   */
  outOfScope: boolean;
}

const READINESS_UNKNOWN: SendReadiness = { email: "unknown", sms: "unknown", missing: [], missingByChannel: [], partial: true, outOfScope: false };

/* ----------------------------------------------------------------- hosts */

export interface CalendarHost {
  user_id: string;
  full_name: string | null;
  priority: number;
  /** null availability means this host inherits the calendar's hours. */
  hasCustomHours: boolean;
  timezone: string | null;
}

/* ------------------------------------------------------------------ hook */

export interface CalendarConnectionsState {
  /** Which account these rows belong to, so a switch can be told from a refresh. */
  tenantId: string | null;
  /**
   * The ROUTE address of the account these rows belong to (§65 `account_number`).
   *
   * `tenantId` is a uuid and the URL carries a number, so on their own the two
   * cannot be compared — which is why a surface trying to tell "is what I am
   * showing the account the URL names?" previously had to infer it from the
   * ORDER the two changed in. That inference breaks whenever they move the other
   * way round (a tenant switch commits before its navigation), and an inference
   * that cannot be re-derived gets stuck. Reporting the address alongside the id
   * makes the question answerable directly, from current values only.
   *
   * Null when the tenant is unresolved, or pre-dates the account_number
   * migration; a null is "cannot tell", never "mismatch".
   */
  accountNumber: number | null;
  loading: boolean;
  error: string | null;
  /** Set when the calendars read succeeded but returned nothing. */
  empty: boolean;
  providers: ProviderState;
  providersError: string | null;
  calendars: CalendarRow[];
  hosts: Record<string, CalendarHost[]>;
  /**
   * Set when the `calendar_hosts` read itself FAILED. A failed read is not an
   * empty roster: reporting "this calendar has no host" off a transient error
   * would tell someone their booking page is dead when it is running fine.
   */
  hostsError: string | null;
  readiness: SendReadiness;
  /** False when this account may read the configuration but not change it. */
  canWrite: boolean;
}

function firstMessage(...errors: (string | null | undefined)[]) {
  return errors.find((e) => typeof e === "string" && e.length > 0) ?? null;
}

/** The shape an account starts from, and the shape a switch resets to. */
const BLANK_STATE: CalendarConnectionsState = {
  tenantId: null,
  accountNumber: null,
  loading: true,
  error: null,
  empty: false,
  providers: EMPTY_PROVIDERS,
  providersError: null,
  calendars: [],
  hosts: {},
  hostsError: null,
  readiness: READINESS_UNKNOWN,
  canWrite: false,
};

export function useCalendarConnections() {
  const { activeTenantId, tenants, loading: tenantLoading } = useTenantContext();

  /**
   * The route address of ONE named tenant — not of whoever is active now.
   *
   * This distinction is the whole point. A load is scoped to the `activeTenantId`
   * its callback closed over, and it can finish after the active tenant has moved
   * on. Reading the CURRENT address at that moment would stamp the departing
   * account's rows with the arriving account's address, and a stamp that
   * disagrees with its own rows is worse than none: the guard downstream compares
   * that address with the route, would find them equal, and would conclude the
   * pairing is current — exposing an editor over another account's data, which is
   * exactly what the address was added to prevent.
   *
   * So both halves of the stamp are derived from the SAME id at the same moment,
   * and cannot disagree by construction. Reading the roster through a ref keeps
   * this out of `load`'s dependencies, so the address resolving a beat after the
   * tenant costs no second round trip.
   */
  const liveTenants = useRef(tenants);
  liveTenants.current = tenants;
  const addressFor = useCallback((id: string | null) => (
    // `?? []` because a roster is not guaranteed: the context can hand back a
    // shape without one, and a hook that throws over a missing address would
    // take the whole surface down to avoid a stale label — the wrong trade in
    // both directions. No roster means no address, which reads as "cannot tell".
    id ? (liveTenants.current ?? []).find((t) => t.id === id)?.account_number ?? null : null
  ), []);
  const gate = useRef(createSettingsRequestGate());
  // The tenant now on screen, readable from inside a closure that was captured
  // under a DIFFERENT one. `load` closes over `activeTenantId`, so a reload
  // fired from a stale closure would read the old account's calendars AND take
  // a fresh gate token — making itself newer than the account-change load and
  // overwriting the new account's state with the old account's rows.
  const liveTenant = useRef(activeTenantId);
  liveTenant.current = activeTenantId;
  const [state, setState] = useState<CalendarConnectionsState>(BLANK_STATE);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Keep the rows only while the account is the SAME one. On a switch they
    // are cleared outright: `loading` alone left the previous account's selected
    // preset and its enabled controls rendering under the new account's loading
    // shell, so a save or a live-toggle made there wrote to a calendar that was
    // never on screen — and if the new read failed, those stale details simply
    // stayed. Same rule the canonical readiness read follows (§9).
    setState((s) => (s.tenantId === activeTenantId
      ? { ...s, loading: true, error: null }
      : { ...BLANK_STATE, tenantId: activeTenantId, accountNumber: addressFor(activeTenantId), loading: true }));

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;

    // Providers are the signed-in person's, so this read is keyed on the user and
    // deliberately does NOT carry the tenant.
    const providerRead = uid
      ? await supabase
          .from("staff_calendar_settings")
          .select(
            "google_calendar_connected, google_email, google_last_sync_at, apple_caldav_connected, apple_last_sync_at, zoom_connected, zoom_email",
          )
          .eq("user_id", uid)
          .maybeSingle()
      : { data: null, error: null };

    if (!activeTenantId) {
      if (!gate.current.isCurrent(token)) return;
      setState({
        tenantId: activeTenantId,
        accountNumber: addressFor(activeTenantId),
        loading: false,
        error: null,
        empty: true,
        providers: (providerRead.data as ProviderState | null) ?? EMPTY_PROVIDERS,
        providersError: providerRead.error?.message ?? null,
        calendars: [],
        hosts: {},
        hostsError: null,
        readiness: READINESS_UNKNOWN,
        canWrite: false,
      });
      return;
    }

    // The three readiness tables are gated by RLS on `current_user_tenant_id()`,
    // NOT on the tenant this surface is showing. When an operator or agency is
    // acting as another account those two diverge, and the reads come back empty
    // — which would otherwise read as a confident "this workspace cannot send"
    // when the truth is "we were not allowed to look". So the caller's own tenant
    // is resolved first and the two are compared before any negative is believed.
    const [calendarRead, identityRead, phoneRead, a2pRead, brandRead, adminRead, scopeRead] = await Promise.all([
      supabase.from("calendars").select(SELECT_COLS).eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
      untyped.from("tenant_email_identities").select("tenant_id").eq("tenant_id", activeTenantId).limit(1),
      untyped.from("tenant_phone_numbers").select("id").eq("tenant_id", activeTenantId).eq("is_primary", true).limit(1),
      untyped.from("tenant_a2p_registrations").select("tenant_id").eq("tenant_id", activeTenantId).limit(1),
      supabase.from("tenants").select("brand").eq("id", activeTenantId).maybeSingle(),
      untyped.rpc("is_current_user_tenant_admin"),
      untyped.rpc("current_user_tenant_id"),
    ]) as [
      { data: unknown; error: { message: string } | null },
      { data: unknown[] | null; error: { message: string } | null },
      { data: unknown[] | null; error: { message: string } | null },
      { data: unknown[] | null; error: { message: string } | null },
      { data: unknown; error: { message: string } | null },
      { data: unknown; error: { message: string } | null },
      { data: unknown; error: { message: string } | null },
    ];

    // Readiness is only answerable for the caller's own account.
    const callerTenant = typeof scopeRead.data === "string" ? scopeRead.data : null;
    const readinessInScope = !scopeRead.error && callerTenant === activeTenantId;

    if (!gate.current.isCurrent(token)) return;

    if (calendarRead.error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: calendarRead.error?.message ?? "Calendar configuration could not load",
        providers: (providerRead.data as ProviderState | null) ?? EMPTY_PROVIDERS,
        providersError: providerRead.error?.message ?? null,
        // The host read never ran on this pass; a value left over from the last
        // one would be a claim about a load that did not happen.
        hostsError: null,
      }));
      return;
    }

    const calendars = ((calendarRead.data as CalendarRow[] | null) ?? []).map((c) => ({ ...c }));

    // Hosts, for the calendars we can actually see. One read, then grouped —
    // a per-calendar query would be N round trips for a list this small.
    const hosts: Record<string, CalendarHost[]> = {};
    let hostsError: string | null = null;
    if (calendars.length) {
      const { data: hostRows, error: hostErr } = await supabase
        .from("calendar_hosts")
        .select("calendar_id, user_id, priority, availability_json, timezone")
        .in("calendar_id", calendars.map((c) => c.id));
      if (!gate.current.isCurrent(token)) return;
      hostsError = hostErr?.message ?? null;
      type HostRow = {
        calendar_id: string; user_id: string; priority: number | null;
        availability_json: unknown; timezone: string | null;
      };
      const rows = (hostRows as HostRow[] | null) ?? [];
      const names = new Map<string, string | null>();
      if (rows.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", Array.from(new Set(rows.map((r) => r.user_id))));
        if (!gate.current.isCurrent(token)) return;
        for (const p of ((profs as { user_id: string; full_name: string | null }[] | null) ?? [])) {
          names.set(p.user_id, p.full_name);
        }
      }
      for (const r of rows) {
        (hosts[r.calendar_id] ??= []).push({
          user_id: r.user_id,
          full_name: names.get(r.user_id) ?? null,
          priority: r.priority ?? 0,
          hasCustomHours: Array.isArray(r.availability_json) && r.availability_json.length > 0,
          timezone: r.timezone,
        });
      }
      for (const list of Object.values(hosts)) list.sort((a, b) => a.priority - b.priority);
    }

    // Each seam answers for itself, and a read that did not answer stays
    // `unknown`. Out of scope is also `unknown` — an empty result we were never
    // entitled to see is not evidence of absence.
    let readiness: SendReadiness;
    if (!readinessInScope) {
      readiness = { ...READINESS_UNKNOWN, outOfScope: true };
    } else {
      const identityOk: Capability = identityRead.error ? "unknown" : (identityRead.data?.length ?? 0) > 0 ? "yes" : "no";
      const phoneOk = phoneRead.error ? null : (phoneRead.data?.length ?? 0) > 0;
      const a2pOk = a2pRead.error ? null : (a2pRead.data?.length ?? 0) > 0;
      const brand = ((brandRead.data as { brand?: Record<string, unknown> } | null)?.brand ?? {}) as Record<string, unknown>;
      const businessPhone = typeof brand.business_phone === "string" && brand.business_phone.trim().length > 0;

      let smsOk: Capability;
      if (phoneOk === null && a2pOk === null) smsOk = "unknown";
      else if (phoneOk === true || a2pOk === true) smsOk = brandRead.error ? "unknown" : businessPhone ? "yes" : "no";
      else if (phoneOk === false && a2pOk === false) smsOk = "no";
      else smsOk = "unknown";

      const missingByChannel: { channel: "email" | "sms"; label: string }[] = [];
      if (identityOk === "no") missingByChannel.push({ channel: "email", label: "no sending email address" });
      if (phoneOk === false && a2pOk === false) missingByChannel.push({ channel: "sms", label: "no phone number or texting registration" });
      // The business phone is what a text is sent FROM, so its absence blocks
      // SMS and nothing else.
      if (!brandRead.error && !businessPhone) missingByChannel.push({ channel: "sms", label: "no business phone on the profile" });

      readiness = {
        email: identityOk,
        sms: smsOk,
        missing: missingByChannel.map((m) => m.label),
        missingByChannel,
        partial: Boolean(identityRead.error || phoneRead.error || a2pRead.error || brandRead.error),
        outOfScope: false,
      };
    }

    setState({
      tenantId: activeTenantId,
      accountNumber: addressFor(activeTenantId),
      loading: false,
      error: null,
      empty: calendars.length === 0,
      providers: (providerRead.data as ProviderState | null) ?? EMPTY_PROVIDERS,
      providersError: providerRead.error?.message ?? null,
      calendars,
      hosts,
      hostsError,
      readiness,
      canWrite: !adminRead.error && adminRead.data === true,
    });
    // `addressFor` is stable (empty deps, reads a ref), so naming it here costs
    // no extra reload and keeps the lint honest rather than silenced.
  }, [activeTenantId, addressFor]);

  useEffect(() => {
    const activeGate = gate.current;
    if (!tenantLoading) void load();
    return () => activeGate.clear();
  }, [tenantLoading, load]);

  /* ------------------------------------------------------------- writes */

  /**
   * Persist one calendar. The caller supplies a patch built by
   * `buildCalendarPatch`, so the clamp and drop rules are the same ones the
   * legacy builder applies — there is one set of them (§18).
   */
  const saveCalendar = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setBusy(id);
    const { data, error } = await supabase
      .from("calendars")
      .update(patch as never)
      .eq("id", id)
      .select(SELECT_COLS)
      .single();
    setBusy(null);
    if (error || !data) {
      const conflict = (error as { code?: string } | null)?.code === "23505";
      return { ok: false as const, message: conflict ? "That booking link is already taken — pick another." : (error?.message ?? "Save failed") };
    }
    const saved = data as unknown as CalendarRow;
    setState((s) => ({ ...s, calendars: s.calendars.map((c) => (c.id === saved.id ? saved : c)) }));
    return { ok: true as const, row: saved };
  }, []);

  /**
   * Create a booking preset, live and bookable from the moment it exists.
   *
   * Two things here are not optional, and both are carried over from the builder
   * this surface replaced rather than re-invented (§18):
   *
   *  1. THE CREATOR IS REGISTERED AS A HOST. A calendar with no host has no
   *     availability to offer, so its public page cannot be booked. Creating one
   *     without a host produces a live link that is broken on arrival.
   *  2. A FAILED HOST INSERT ROLLS THE CALENDAR BACK. There is no way to add a
   *     host from this surface, so a calendar that loses this race would be
   *     permanently unbookable and unrepairable here. Deleting it is better than
   *     leaving that behind, and the delete is tenant-scoped so it can only ever
   *     remove the row we just wrote (§9).
   *
   * The slug carries a random suffix because booking links are unique across the
   * platform: two workspaces both creating "Discovery call" must not collide.
   */
  const createCalendar = useCallback(async (title: string) => {
    const name = title.trim();
    if (!name) return { ok: false as const, message: "Give the calendar a name first." };
    if (!activeTenantId) return { ok: false as const, message: "No active workspace — pick one first." };

    setBusy("new");
    const draft = blankDraft(name);
    const patch = buildCalendarPatch(draft, DEFAULT_AVAIL);
    const slug = `${slugify(name) || "calendar"}-${randomSuffix()}`;

    const { data, error } = await supabase
      .from("calendars")
      .insert({
        ...patch,
        tenant_id: activeTenantId,
        slug,
        // Created as a DRAFT and flipped live only once a host exists. A live
        // calendar with no host is a public link that accepts nothing, and
        // nothing on this surface can add a host to repair it — so the window
        // between the two inserts must never be a bookable one.
        enabled: false,
        availability_json: availToJson(DEFAULT_AVAIL),
      } as never)
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      setBusy(null);
      const conflict = (error as { code?: string } | null)?.code === "23505";
      return {
        ok: false as const,
        message: conflict ? "That booking link is already taken — try a different name." : (error?.message ?? "Could not create the calendar"),
      };
    }

    const created = data as unknown as CalendarRow;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    const hostError = uid
      ? (await supabase.from("calendar_hosts").insert({ calendar_id: created.id, user_id: uid, priority: 0 })).error
      : { message: "no-session" };

    if (hostError) {
      // Best-effort removal. It is deliberately NOT load-bearing: the same lost
      // session that blocked the host insert also blocks this delete, so the
      // result is checked rather than assumed, and what is said depends on what
      // actually happened. The leftover is a draft either way (see above), so
      // the worst case is an unfinished calendar, never a live unbookable link.
      // `.select()` so the RESULT is the evidence. A delete that matches no row
      // — RLS hid it, the filters missed it — succeeds with `error === null`, so
      // checking only the error would let "nothing was created" be said over a
      // draft that is still there. Absence of an error is not proof of effect.
      const { data: removed, error: rollbackError } = await supabase
        .from("calendars").delete().eq("id", created.id).eq("tenant_id", activeTenantId).select("id");
      setBusy(null);
      if (rollbackError || (removed?.length ?? 0) === 0) {
        if (liveTenant.current === activeTenantId) await load();
        return {
          ok: false as const,
          message: `“${created.title}” was created but couldn’t be finished, and removing it didn’t work either. It is saved as a draft, so it is not taking bookings — sign in again and delete or finish it.`,
        };
      }
      return {
        ok: false as const,
        message: uid
          ? "Couldn't finish setting the calendar up, so nothing was created. Please try again."
          : "Your session expired — sign in again and retry.",
      };
    }

    // The host is registered, so the link can actually be booked. The state
    // that comes BACK is what is reported, not the absence of an error: an
    // update matching zero rows returns no error while `enabled` stays false,
    // and announcing "live — ready to share" over that is a fabricated status
    // on the one screen whose job is to report the truth. If the flip did not
    // take, the calendar is a draft and the surface says draft.
    const { data: live } = await supabase
      .from("calendars").update({ enabled: true }).eq("id", created.id).eq("tenant_id", activeTenantId)
      .select("enabled").maybeSingle();

    setBusy(null);
    // Only refresh if this is still the account on screen. See `liveTenant`.
    if (liveTenant.current === activeTenantId) await load();
    return { ok: true as const, row: { ...created, enabled: (live as { enabled?: boolean } | null)?.enabled === true } };
  }, [activeTenantId, load]);

  /** Flip a calendar between Live and Draft. Draft means the link stops accepting bookings. */
  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    setBusy(id);
    const { error } = await supabase.from("calendars").update({ enabled }).eq("id", id);
    setBusy(null);
    if (error) return { ok: false as const, message: error.message };
    setState((s) => ({ ...s, calendars: s.calendars.map((c) => (c.id === id ? { ...c, enabled } : c)) }));
    return { ok: true as const };
  }, []);

  /**
   * Start a provider OAuth handshake. This returns the provider's own
   * authorization URL and the browser leaves — nothing is connected here, and
   * nothing is claimed until the callback writes the row and this hook re-reads.
   */
  const connect = useCallback(async (provider: "google" | "zoom", returnTo?: string) => {
    setBusy(provider);
    // Remembered BEFORE the browser leaves, so the callback can put the person
    // back on the surface they started from instead of the role-default landing
    // the callback has always used. Same-origin paths only (see oauthReturn).
    //
    // GOOGLE ONLY, and that is the whole point. Google returns through a page in
    // this app, which reads the address. Zoom does NOT: `zoom-oauth-callback` is
    // an edge function that 302s the browser straight to its own role-based
    // destination, so a path stored for Zoom is never consumed — it just sits
    // there. And it would not sit there harmlessly: `CalendarConnectorsPanel`
    // starts its own Google connect WITHOUT a return path, so its callback would
    // find the orphaned Zoom-era address and honour it, sending that person to a
    // surface they were not on. An address is stored only for the journey that
    // reads it. Giving Zoom a real return path needs a change to its edge
    // function, which is tracked separately.
    const consumesReturn = provider === "google";
    // Arm rather than merely remember: a Google handshake with no return path
    // must also clear whatever an ABANDONED earlier one left behind (see
    // armOAuthReturn). Zoom neither writes nor clears, since it never reads.
    if (consumesReturn) armOAuthReturn(returnTo);
    const fn = provider === "google" ? "google-calendar-oauth-start" : "zoom-oauth-start";
    const { data, error } = await supabase.functions.invoke(fn, { body: { origin: window.location.origin } });
    setBusy(null);
    const url = (data as { authorization_url?: string } | null)?.authorization_url;
    if (error || !url) {
      // The handshake never started, so nothing will ever read the address.
      if (returnTo && consumesReturn) clearOAuthReturn();
      return { ok: false as const, message: error?.message ?? "That connection is not switched on yet." };
    }
    return { ok: true as const, url };
  }, []);

  const disconnect = useCallback(async (provider: "google" | "zoom") => {
    setBusy(provider);
    const fn = provider === "google" ? "google-calendar-disconnect" : "zoom-disconnect";
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setBusy(null);
    if (error || (data as { error?: string } | null)?.error) {
      return { ok: false as const, message: error?.message ?? "Could not disconnect" };
    }
    // Guarded like every other reload here (see `liveTenant`): a disconnect that
    // finishes after the account moved on must not pull the departing account's
    // rows back into a surface that has already relabelled itself.
    if (liveTenant.current === activeTenantId) await load();
    return { ok: true as const };
  }, [load, activeTenantId]);

  const loading = tenantLoading || state.loading;
  return useMemo(
    () => ({ ...state, loading, busy, refresh: load, createCalendar, saveCalendar, setEnabled, connect, disconnect,
             errorMessage: firstMessage(state.error, state.providersError) }),
    [state, loading, busy, load, createCalendar, saveCalendar, setEnabled, connect, disconnect],
  );
}
