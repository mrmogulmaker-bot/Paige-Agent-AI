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
import { identityFor, reloadIsCurrent } from "@/lib/calendar/account-identity";
import { createSettingsRequestGate } from "../settings-contract";
import {
  DEFAULT_AVAIL, SELECT_COLS, buildCalendarPatch, randomSuffix, slugify,
  type AvailState, type CalendarDraft, type CalendarRow,
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

/**
 * Turn a lifecycle-RPC failure into an honest, actionable sentence (§15). The
 * server RAISEs a tagged message (PRESET_NEEDS_HOSTS, PRESET_NO_HOURS, …); a
 * real refusal must read as the specific thing to fix, never a generic "failed"
 * and never a fabricated success. The server stays authoritative — this only
 * translates its actual reason for the owner.
 */
function classifyPresetError(
  error: { message?: string; code?: string } | null,
  verb: "create" | "save" | "publish" | "pause" | "duplicate" | "archive" | "restore",
): string {
  const raw = error?.message ?? "";
  if (error?.code === "23505" || raw.includes("PRESET_SLUG_TAKEN")) {
    return "That booking link is already taken — try a different name.";
  }
  if (raw.includes("PRESET_ARCHIVED")) {
    return "This preset is archived — restore it before you can edit or publish it.";
  }
  if (raw.includes("PRESET_NEEDS_HOSTS")) {
    // The server message already names the count needed vs assigned.
    const detail = raw.split("PRESET_NEEDS_HOSTS:")[1]?.trim();
    return detail ? `Add more hosts first — ${detail}.` : "Add more hosts before publishing this scheduling model.";
  }
  if (raw.includes("PRESET_NO_HOURS")) return "Add at least one open window before you can publish this preset.";
  if (raw.includes("PRESET_NO_METHOD")) return "Choose how the meeting happens before you can publish this preset.";
  if (raw.includes("PRESET_FORBIDDEN")) return "You don’t have permission to change this preset in this workspace.";
  if (raw.includes("PRESET_NOT_FOUND")) return "That preset no longer exists — refresh and try again.";
  if (raw.includes("PRESET_SLUG_REQUIRED") || raw.includes("PRESET_TENANT_REQUIRED")) {
    return "Something was missing — give the preset a name and try again.";
  }
  return raw.replace(/^PRESET_[A-Z_]+:\s*/, "") || `Could not ${verb} the preset.`;
}

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

/**
 * A teammate who could take bookings on a calendar but is not a host on it yet.
 *
 * Names come from `list_calendar_host_candidates` rather than a `profiles`
 * select, because `profiles` is own-row under RLS: a manager can read their own
 * name and nobody else's, so a roster editor built on a direct read would offer
 * a list of uuids to choose between.
 */
export type HostCandidate = { user_id: string; full_name: string | null };

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
   * Who ELSE could take bookings on each calendar — the pool the roster editor
   * adds from. Read through `list_calendar_host_candidates` because `profiles`
   * is own-row under RLS: a manager cannot select a teammate's name directly,
   * and a roster editor that cannot show names is a list of uuids.
   */
  hostCandidates: Record<string, HostCandidate[]>;
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
  hostCandidates: {},
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
  // Both halves of the stamp, from one id against one roster. `identityFor` is
  // the shared rule and is unit-proven in `account-identity.test.ts`; taking the
  // pair together is what stops the two fields being sourced separately again.
  const identityOf = useCallback((id: string | null) => identityFor(id, liveTenants.current), []);
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
    // The guard lives HERE, not at the call sites, because a call site that
    // forgets it is exactly how this defect class keeps returning: `disconnect`
    // was the one reload that never had it. A closure scoped to a departed
    // account refuses itself, so every caller — present and future — is covered.
    if (!reloadIsCurrent(activeTenantId, liveTenant.current)) return;
    const token = gate.current.begin();
    // Keep the rows only while the account is the SAME one. On a switch they
    // are cleared outright: `loading` alone left the previous account's selected
    // preset and its enabled controls rendering under the new account's loading
    // shell, so a save or a live-toggle made there wrote to a calendar that was
    // never on screen — and if the new read failed, those stale details simply
    // stayed. Same rule the canonical readiness read follows (§9).
    setState((s) => (s.tenantId === activeTenantId
      ? { ...s, loading: true, error: null }
      : { ...BLANK_STATE, ...identityOf(activeTenantId), loading: true }));

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
        ...identityOf(activeTenantId),
        loading: false,
        error: null,
        empty: true,
        providers: (providerRead.data as ProviderState | null) ?? EMPTY_PROVIDERS,
        providersError: providerRead.error?.message ?? null,
        calendars: [],
        hosts: {},
        hostCandidates: {},
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
    // WRITE GATE — resolved against the VIEWED tenant (`activeTenantId`), never the
    // caller's own `current_user_tenant_id()`. The retired gate used
    // `is_current_user_tenant_admin()`, which is `is_tenant_admin_as(auth.uid(),
    // current_user_tenant_id())` — it answers "am I an admin of MY OWN active
    // tenant", not "of the account I am looking at". Those diverge on a tenant
    // switch (before `profiles.active_tenant_id` persists), on a stale profile
    // pointer, and whenever an operator/agency acts as another account — exactly
    // the readiness-scope divergence this load already handles below. The gate now
    // mirrors the `calendars` "manage" RLS rule (platform admin OR tenant admin of
    // the row's tenant) evaluated for the VIEWED tenant, so the button can neither
    // be hidden from someone the write would accept nor shown to someone it refuses.
    const [calendarRead, identityRead, phoneRead, a2pRead, brandRead, viewedAdminRead, scopeRead, platformAdminRead] = await Promise.all([
      supabase.from("calendars").select(SELECT_COLS).eq("tenant_id", activeTenantId).order("created_at", { ascending: false }),
      untyped.from("tenant_email_identities").select("tenant_id").eq("tenant_id", activeTenantId).limit(1),
      untyped.from("tenant_phone_numbers").select("id").eq("tenant_id", activeTenantId).eq("is_primary", true).limit(1),
      untyped.from("tenant_a2p_registrations").select("tenant_id").eq("tenant_id", activeTenantId).limit(1),
      supabase.from("tenants").select("brand").eq("id", activeTenantId).maybeSingle(),
      untyped.rpc("is_tenant_admin", { _tenant: activeTenantId }),
      untyped.rpc("current_user_tenant_id"),
      untyped.rpc("is_platform_admin"),
    ]) as [
      { data: unknown; error: { message: string } | null },
      { data: unknown[] | null; error: { message: string } | null },
      { data: unknown[] | null; error: { message: string } | null },
      { data: unknown[] | null; error: { message: string } | null },
      { data: unknown; error: { message: string } | null },
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

    // The candidate pool, per calendar. One RPC per calendar is unavoidable —
    // `list_calendar_host_candidates` is scoped to a single calendar because the
    // answer depends on who is ALREADY a host there — but the list is small and
    // they run together rather than in series.
    //
    // A candidate read that fails is not an error the surface stops for: the
    // roster still renders and stays editable in every other way. It simply
    // means no name can be offered to add, which the editor says plainly rather
    // than showing an empty picker that looks like "nobody is available".
    const hostCandidates: Record<string, HostCandidate[]> = {};
    if (calendars.length) {
      const results = await Promise.all(
        calendars.map((c) => supabase.rpc("list_calendar_host_candidates", { _cal: c.id })),
      );
      if (!gate.current.isCurrent(token)) return;
      calendars.forEach((c, i) => {
        const rows = (results[i].data as
          { user_id: string; full_name: string | null; is_host: boolean }[] | null) ?? [];
        hostCandidates[c.id] = rows
          .filter((r) => !r.is_host)
          .map((r) => ({ user_id: r.user_id, full_name: r.full_name }));
        // The RPC is the ONLY read that can name a teammate: `profiles` is
        // own-row under RLS, so the direct select above resolves the viewer and
        // nobody else. Throwing the `is_host` rows away would leave every other
        // host labelled "Team member" — a roster of anonymous rows cannot answer
        // the one question this screen exists to answer, and the move/remove
        // buttons would not say whose order they change.
        const named = new Map(
          rows.filter((r) => r.full_name).map((r) => [r.user_id, r.full_name] as const),
        );
        for (const h of hosts[c.id] ?? []) h.full_name ??= named.get(h.user_id) ?? null;
      });
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
      ...identityOf(activeTenantId),
      loading: false,
      error: null,
      empty: calendars.length === 0,
      providers: (providerRead.data as ProviderState | null) ?? EMPTY_PROVIDERS,
      providersError: providerRead.error?.message ?? null,
      calendars,
      hosts,
      hostCandidates,
      hostsError,
      readiness,
      // Manage rights = tenant admin of the VIEWED tenant OR a platform admin,
      // mirroring the `calendars` manage-RLS. A read error on either check is
      // treated as "not authorized" so the surface fails closed (§9/§13).
      canWrite:
        (!viewedAdminRead.error && viewedAdminRead.data === true) ||
        (!platformAdminRead.error && platformAdminRead.data === true),
    });
    // `identityOf` is stable (empty deps, reads a ref), so naming it here costs
    // no extra reload and keeps the lint honest rather than silenced.
  }, [activeTenantId, identityOf]);

  useEffect(() => {
    const activeGate = gate.current;
    if (!tenantLoading) void load();
    return () => activeGate.clear();
  }, [tenantLoading, load]);

  /* ------------------------------------------------------------- writes */

  /**
   * Persist one preset's configuration. The caller supplies a patch built by
   * `buildCalendarPatch`, so the clamp and drop rules are the same ones the
   * legacy builder applies — there is one set of them (§18).
   *
   * This routes through the `update_calendar_preset` RPC rather than a direct
   * table UPDATE so the Settings surface and Paige's chat capability edit a preset
   * through the SAME server-authorized seam (§10). The RPC applies a fixed column
   * allowlist and can never touch the lifecycle (`enabled`/`published_at`) or the
   * identity (`slug`/`tenant_id`) — publish/pause own the first, create owns the
   * second. The row is re-read afterward so the surface shows exactly what
   * persisted, not what was sent (§13).
   */
  const saveCalendar = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setBusy(id);
    const { data: rpcData, error } = await untyped.rpc("update_calendar_preset", { _cal: id, _patch: patch, _tenant: activeTenantId });
    if (error) {
      setBusy(null);
      return { ok: false as const, message: classifyPresetError(error, "save") };
    }
    // The server auto-pauses a LIVE preset that this edit pushed below the publish
    // bar (dropped its last host, blanked its hours, removed its only method) — a
    // Live public page that can no longer take a booking is taken off the air
    // rather than left lying (§13/§32). The surface must SAY that happened, so the
    // owner is never surprised that a save quietly unpublished their page.
    const autoPaused = Boolean((rpcData as { auto_paused?: boolean } | null)?.auto_paused);
    const autoPauseReason = (rpcData as { reason?: string | null } | null)?.reason ?? null;
    const { data, error: readErr } = await supabase
      .from("calendars").select(SELECT_COLS).eq("id", id).maybeSingle();
    setBusy(null);
    if (readErr || !data) {
      // The write succeeded but the read-back did not; refresh from the server
      // rather than claim a row shape we did not confirm.
      await load();
      return {
        ok: false as const,
        message: autoPaused
          ? "Saved — but this change took the live page off the air, so it’s now paused. Refresh to confirm."
          : "Saved, but the preset could not be re-read — refresh to confirm.",
      };
    }
    const saved = data as unknown as CalendarRow;
    setState((s) => ({ ...s, calendars: s.calendars.map((c) => (c.id === saved.id ? saved : c)) }));
    return { ok: true as const, row: saved, autoPaused, autoPauseReason };
  }, [activeTenantId, load]);

  /**
   * Rewrite WHO takes bookings on a calendar, in priority order.
   *
   * The whole roster goes in one call because array POSITION IS THE PRIORITY.
   * Adding, removing and reordering are the same operation seen three ways, and
   * splitting them into per-row writes is how a rotation ends up half-applied —
   * two hosts at priority 0, or a gap that decides who gets the next real
   * booking. `set_calendar_hosts` is the existing atomic seam for exactly this
   * (gated on `can_manage_calendar`); this is the same RPC the calendar builder
   * already used, not a second way to do it.
   *
   * Per-host hours are PRESERVED rather than re-sent from the surface: the row
   * carries `availability_json`/`timezone` that this settings screen does not
   * edit, and sending them back as null would quietly widen someone's hours to
   * the calendar default. Only membership and order are changed here.
   */
  const saveHosts = useCallback(async (calendarId: string, orderedUserIds: string[]) => {
    if (orderedUserIds.length === 0) {
      // A calendar with no host has no availability to offer, so its public page
      // cannot be booked. Refuse rather than write a live-but-dead link.
      return { ok: false as const, message: "A calendar needs at least one host." };
    }
    setBusy(calendarId);
    const { data: existing, error: readErr } = await supabase
      .from("calendar_hosts")
      .select("user_id, availability_json, timezone")
      .eq("calendar_id", calendarId);
    if (readErr) {
      setBusy(null);
      return { ok: false as const, message: readErr.message };
    }
    type HoursRow = { user_id: string; availability_json: unknown; timezone: string | null };
    const hours = new Map(((existing as HoursRow[] | null) ?? []).map((r) => [r.user_id, r]));
    const { error } = await supabase.rpc("set_calendar_hosts", {
      _cal: calendarId,
      _hosts: orderedUserIds.map((user_id) => ({
        user_id,
        availability_json: hours.get(user_id)?.availability_json ?? null,
        timezone: hours.get(user_id)?.timezone ?? null,
      })) as never,
    });
    setBusy(null);
    if (error) return { ok: false as const, message: error.message };
    // Re-read rather than patch local state: the RPC decides the stored
    // priorities, and a surface that guessed them would drift from the rotation
    // the bookings actually follow.
    await load();
    return { ok: true as const };
  }, [load]);

  /**
   * Create a booking preset as a private DRAFT — never live on creation.
   *
   * This is the whole point of the seam: the `create_calendar_preset` RPC inserts
   * the row with `enabled = false` and registers the creator as its first host in
   * one atomic server-side step, and NOTHING here flips it live. A preset's
   * `/book/:slug` page is public only after its owner's explicit Publish. The old
   * client-side insert-then-flip-`enabled` dance (which made a new preset bookable
   * the instant it was created) is gone; draft-by-default is now enforced on the
   * server where Paige and the UI both go through it (§10), not just hidden in the
   * UI (§13/§32).
   *
   * The caller supplies a DRAFT (a `blankDraft` or a `draftForTemplate` variant),
   * so the chosen scheduling model and its editable defaults come over intact. The
   * slug carries a random suffix because booking links are unique across the
   * platform: two workspaces both creating "Discovery call" must not collide.
   */
  const createCalendar = useCallback(async (draft: CalendarDraft, avail: AvailState = DEFAULT_AVAIL) => {
    const name = (draft.title ?? "").trim();
    if (!name) return { ok: false as const, message: "Give the preset a name first." };
    if (!activeTenantId) return { ok: false as const, message: "No active workspace — pick one first." };

    setBusy("new");
    const patch = buildCalendarPatch(draft, avail);
    const slug = `${slugify(name) || "calendar"}-${randomSuffix()}`;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;

    const { data, error } = await untyped.rpc("create_calendar_preset", {
      _tenant: activeTenantId,
      _slug: slug,
      _patch: patch,
      _created_by: uid,
    });
    if (error) {
      setBusy(null);
      return { ok: false as const, message: classifyPresetError(error, "create") };
    }

    const calId = (data as { calendar_id?: string } | null)?.calendar_id ?? null;
    // Read the created draft back as the truth the surface renders (the RPC
    // returns ids/status, not the row). It is a Draft (enabled=false); the editor
    // opens on it and the owner publishes when ready.
    const { data: row } = calId
      ? await supabase.from("calendars").select(SELECT_COLS).eq("id", calId).maybeSingle()
      : { data: null };
    setBusy(null);
    await load();
    return { ok: true as const, row: (row as unknown as CalendarRow) ?? null, calendarId: calId };
  }, [activeTenantId, load]);

  /**
   * Publish a preset — the ONLY way to make its `/book/:slug` page public. The
   * server (`publish_calendar_preset`) revalidates that the page can honestly take
   * a booking (manage permission, enough hosts for the scheduling model, an open
   * window, a usable method) and refuses with a specific reason otherwise. A
   * refusal is surfaced as the exact thing to fix, never a fake success (§13).
   */
  const publish = useCallback(async (id: string) => {
    setBusy(id);
    const { error } = await untyped.rpc("publish_calendar_preset", { _cal: id, _tenant: activeTenantId });
    setBusy(null);
    if (error) return { ok: false as const, message: classifyPresetError(error, "publish") };
    // Re-read the whole set: publish sets enabled + published_at server-side, and
    // the surface's lifecycle labels derive from those two facts (§13).
    await load();
    return { ok: true as const };
  }, [activeTenantId, load]);

  /**
   * Pause a live preset — take its public page off the air. `enabled` goes false
   * (so the resolver refuses it, exactly like a Draft) but `published_at` is kept,
   * which is what lets the surface call it Paused rather than Draft.
   */
  const pause = useCallback(async (id: string) => {
    setBusy(id);
    const { error } = await untyped.rpc("pause_calendar_preset", { _cal: id, _tenant: activeTenantId });
    setBusy(null);
    if (error) return { ok: false as const, message: classifyPresetError(error, "pause") };
    await load();
    return { ok: true as const };
  }, [activeTenantId, load]);

  /**
   * Duplicate a preset — start a new one from an existing config. The server
   * (`duplicate_calendar_preset`) copies every config column and the source's host
   * pool into a fresh private DRAFT (enabled=false, never published, never
   * archived) with a new unique slug, and registers the caller as a host so they
   * can manage the copy. It is the SAME seam Paige's chat capability will use (§10);
   * nothing here writes the `calendars` table directly. The new draft is read back
   * as the truth the surface opens on (§13 — the RPC returns ids, not the row).
   *
   * The slug is minted client-side from the copy's title with a random suffix,
   * because booking links are unique platform-wide; a collision surfaces as the
   * honest "that link is taken" rather than a silent overwrite.
   */
  const duplicate = useCallback(async (id: string, sourceTitle: string | null) => {
    if (!activeTenantId) return { ok: false as const, message: "No active workspace — pick one first." };
    setBusy(id);
    const base = (sourceTitle ?? "").trim();
    const newTitle = base ? `${base} (copy)` : "Booking preset (copy)";
    const slug = `${slugify(newTitle) || "calendar"}-${randomSuffix()}`;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    const { data, error } = await untyped.rpc("duplicate_calendar_preset", {
      _cal: id, _new_slug: slug, _new_title: newTitle, _tenant: activeTenantId, _created_by: uid,
    });
    if (error) {
      setBusy(null);
      return { ok: false as const, message: classifyPresetError(error, "duplicate") };
    }
    const calId = (data as { calendar_id?: string } | null)?.calendar_id ?? null;
    const { data: row } = calId
      ? await supabase.from("calendars").select(SELECT_COLS).eq("id", calId).maybeSingle()
      : { data: null };
    setBusy(null);
    await load();
    return { ok: true as const, row: (row as unknown as CalendarRow) ?? null, calendarId: calId };
  }, [activeTenantId, load]);

  /**
   * Archive a preset — put it away without destroying it. The server
   * (`archive_calendar_preset`) sets `archived_at` and forces `enabled=false`, so
   * the public `/book/:slug` resolver refuses it at once (its enabled gate is the
   * authoritative bookability check). `published_at` is preserved, so a restore
   * returns it to Paused rather than Draft. Idempotent server-side.
   */
  const archive = useCallback(async (id: string) => {
    setBusy(id);
    const { error } = await untyped.rpc("archive_calendar_preset", { _cal: id, _tenant: activeTenantId });
    setBusy(null);
    if (error) return { ok: false as const, message: classifyPresetError(error, "archive") };
    await load();
    return { ok: true as const };
  }, [activeTenantId, load]);

  /**
   * Restore an archived preset — bring it back to Draft or Paused. The server
   * (`restore_calendar_preset`) clears `archived_at` and leaves `enabled=false`, so
   * a restored preset is NEVER straight back on the air: re-publishing is a separate
   * validated act through `publish`. It returns to Draft (never published) or Paused
   * (published before) per `published_at`.
   */
  const restore = useCallback(async (id: string) => {
    setBusy(id);
    const { error } = await untyped.rpc("restore_calendar_preset", { _cal: id, _tenant: activeTenantId });
    setBusy(null);
    if (error) return { ok: false as const, message: classifyPresetError(error, "restore") };
    await load();
    return { ok: true as const };
  }, [activeTenantId, load]);

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
    // No guard needed at the call site: `load` refuses itself when the account
    // it was scoped to is no longer the live one.
    await load();
    return { ok: true as const };
  }, [load]);

  const loading = tenantLoading || state.loading;
  return useMemo(
    () => ({ ...state, loading, busy, refresh: load, createCalendar, saveCalendar, saveHosts, publish, pause,
             duplicate, archive, restore, connect, disconnect,
             errorMessage: firstMessage(state.error, state.providersError) }),
    [state, loading, busy, load, createCalendar, saveCalendar, saveHosts, publish, pause,
     duplicate, archive, restore, connect, disconnect],
  );
}
