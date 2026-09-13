/**
 * Settings › Connections › Calendars.
 *
 * Two things live on this surface, and the seam between them is the design:
 *
 *   CONNECTED ACCOUNTS are the person's. Google, Zoom and Apple are rows in
 *   `staff_calendar_settings`, keyed on `user_id`, so connecting one is a
 *   personal act even inside a shared workspace. The surface says so rather than
 *   letting the reader assume the workspace is connected.
 *
 *   BOOKING PRESETS are the tenant's. Each row in `calendars` is one bookable
 *   thing with a public page, and the ten areas below are the same ten the
 *   builder has always had — Details, Schedule, Date-specific hours, Booking
 *   rules, Service menu, Team, How to meet, Booking page, Intake questions,
 *   Notifications. Nothing was invented for this port and nothing was dropped.
 *
 * THE SHAPE is master/detail (owner direction 2026-09-13). The main page is a
 * LIST: connected accounts, then compact preset cards — name, model, duration,
 * host summary and Draft/Live/Paused status — and a "New preset" chooser that
 * opens on the recognizable booking models rather than a blank name field.
 * Opening a preset swaps the whole surface to a focused EDITOR for that one
 * preset: its status and link, then the ten configuration areas, with "All
 * presets" the way back. The editor is still a deliberate top-to-bottom scroll —
 * ten areas and dozens of rules do not belong in a fixed-height pane, where a
 * nested scroller is exactly where a control goes to hide — but only ONE
 * preset's configuration is ever on the page at a time, and NOTHING here owns its
 * own scrollbar.
 *
 * WHAT A CLOSED AREA STILL TELLS YOU. Progressive disclosure only works if a
 * closed fold-out is still an answer, so every one carries the value that
 * matters for it — duration, timezone, host model, reminder state — and turns
 * that line into a warning when the configuration is actually broken. Scanning
 * the page tells you how the calendar is set up, and where it is wrong, without
 * opening anything.
 *
 * What is NOT here, deliberately: whether a reminder can actually send. That
 * belongs to Communications, is read from the four seams the `comms_configured`
 * check uses, and is only ever *reported* here — and only for the channels this
 * calendar's own rules actually use. A calendar may not claim a capability it
 * does not own, and must not warn about one it never asked for (§13).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarCheck, CalendarDays, CalendarX2, ChevronRight,
  Copy, ExternalLink, Info, Link2, Loader2, Pause, Plus, RefreshCw, Rocket, Trash2, TriangleAlert,
  UserPlus, Users, Video, Undo2, ChevronsDownUp, ChevronsUpDown, CalendarPlus, X,
} from "lucide-react";
import {
  type AvailState, type CalendarDraft, type CalendarRow, type NotifyConfig,
  type PresetCategory, type PresetTemplate, type PublishCheck, type SchedulingModel,
  ASSIGNMENT_MODES, BOOKING_HORIZON_PRESETS, COMMON_TZ, DAY_NAMES, DURATION_PRESETS,
  INTAKE_TYPES, LIFECYCLE_EVENTS, LIFECYCLE_LABEL, MEETING_METHODS, MERGE_FIELDS, NOTIFY_TARGETS,
  PRESET_CATALOG, REMINDER_CHANNELS, REMINDER_OFFSETS, FOLLOWUP_OFFSETS, SWATCHES, TYPES, TYPE_LABEL,
  availToJson, bookingUrl, buildCalendarPatch, draftForTemplate, draftFromRow, jsonToAvail, newId,
  newQuestionId, presetLifecycle, publishReadiness, slugify, willSaveAppointmentType,
  willSaveDateOverride, willSaveQuestion,
} from "@/lib/calendar/config";
import { isStale as accountIsStale } from "@/lib/calendar/account-identity";
import { useBeforeUnloadGuard } from "@/hooks/useBeforeUnloadGuard";
import { useCalendarConnections, type CalendarHost, type Capability, type HostCandidate, type SendReadiness } from "./data/useCalendarConnections";
import "./connections-calendars.css";

/* ------------------------------------------------------------- primitives */

type Tone = "live" | "warn" | "bad" | "info";

function Pill({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className="cc-pill" data-tone={tone}>{tone && <i />}{children}</span>;
}

function Btn({
  children, onClick, kind, size, disabled, title, type, "aria-label": ariaLabel,
}: {
  children: ReactNode; onClick?: () => void; kind?: "ghost" | "act" | "danger";
  size?: "s"; disabled?: boolean; title?: string; type?: "button" | "submit";
  /**
   * Required in practice for an ICON-ONLY button: its whole label is a glyph
   * marked `aria-hidden`, so without this it reaches a screen reader as an
   * unnamed button. The prop was simply absent before, which is why every
   * icon-only button on this surface was anonymous.
   */
  "aria-label"?: string;
}) {
  return (
    <button type={type ?? "button"} className="cc-btn" data-kind={kind} data-size={size}
      onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" className="cc-toggle" aria-pressed={on} aria-label={label}
      disabled={disabled} onClick={() => onChange(!on)} />
  );
}

function SwitchRow({
  title, hint, on, onChange, disabled, trailing,
}: { title: string; hint?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; trailing?: ReactNode }) {
  return (
    <div className="cc-sw-row">
      <div><strong>{title}</strong>{hint && <small>{hint}</small>}</div>
      {trailing}
      <Toggle on={on} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="cc-f"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function Notice({ tone, icon, children }: { tone?: "warn" | "bad" | "info"; icon: ReactNode; children: ReactNode }) {
  return <div className="cc-notice" data-tone={tone} role={tone === "bad" ? "alert" : undefined}>{icon}<div>{children}</div></div>;
}

/** A short muted paragraph used where an area is empty. */
function Hint({ children }: { children: ReactNode }) {
  return <p className="cc-hint">{children}</p>;
}

/* ------------------------------------------------------------ small utils */

function minutesLabel(m: number | null | undefined): string {
  if (m == null) return "—";
  if (m === 0) return "none";
  if (m < 60) return `${m} min`;
  if (m % 1440 === 0) return `${m / 1440} ${m === 1440 ? "day" : "days"}`;
  if (m % 60 === 0) return `${m / 60} hr`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

function initialsOf(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "—";
}

function syncAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/** A reminder channel can only be promised when Communications proves it. */
function channelCapability(channel: string, readiness: SendReadiness): { cap: Capability; label: string; tone?: Tone } {
  const parts: Capability[] = [];
  if (channel === "email" || channel === "both") parts.push(readiness.email);
  if (channel === "sms" || channel === "both") parts.push(readiness.sms);
  if (parts.includes("no")) return { cap: "no", label: "Will not send", tone: "bad" };
  if (parts.includes("unknown")) return { cap: "unknown", label: "Not checked", tone: "warn" };
  return { cap: "yes", label: "Will send", tone: "live" };
}

/**
 * Which channels this calendar's own rules actually reach for. Confirmations and
 * the follow-up are email; reminders and lifecycle messages carry their own
 * channel. Anything outside this set is somebody else's problem, and warning
 * about it here would be a claim about a rule that does not exist.
 */
function channelsInUse(n: NotifyConfig): Set<"email" | "sms"> {
  const used = new Set<"email" | "sms">();
  if (n.confirm_guest || n.confirm_host || n.followup_guest) used.add("email");
  const add = (channel: string) => {
    if (channel === "email" || channel === "both") used.add("email");
    if (channel === "sms" || channel === "both") used.add("sms");
  };
  for (const r of n.reminders) add(r.channel);
  for (const l of n.lifecycle) add(l.channel);
  return used;
}

/** The send verdict for THIS calendar: only the channels above are consulted. */
function sendVerdict(n: NotifyConfig, readiness: SendReadiness) {
  const used = channelsInUse(n);
  const caps = Array.from(used).map((c) => readiness[c]);
  const held = caps.includes("no");
  const unchecked = !held && caps.includes("unknown");
  const reasons = readiness.missingByChannel.filter((m) => used.has(m.channel)).map((m) => m.label);
  return { used, held, unchecked, reasons, silent: used.size === 0 };
}

/* ------------------------------------------------------------------ areas */

type AreaKey =
  | "details" | "schedule" | "dates" | "rules" | "menu"
  | "team" | "how" | "page" | "intake" | "notify";

const AREA_META: { key: AreaKey; n: string; title: string; desc: string }[] = [
  { key: "details", n: "01", title: "Details", desc: "What this calendar is for." },
  { key: "schedule", n: "02", title: "Schedule & availability", desc: "Your timezone and the hours this calendar is open for booking." },
  { key: "dates", n: "03", title: "Date-specific hours", desc: "Block a day off, or set special hours for one date. These override the weekly pattern." },
  { key: "rules", n: "04", title: "Booking rules", desc: "Meeting length and padding between bookings." },
  { key: "menu", n: "05", title: "Service menu", desc: "Offer more than one kind of meeting. Add two or more and guests pick a service first." },
  { key: "team", n: "06", title: "Team & hosts", desc: "Who can take these bookings, and how each new one is assigned." },
  { key: "how", n: "07", title: "How to meet", desc: "Turn on every method you offer. Enable more than one and the invitee picks." },
  { key: "page", n: "08", title: "Booking page", desc: "How the public page looks. Defaults to your workspace brand." },
  { key: "intake", n: "09", title: "Intake questions", desc: "Ask what you need before the meeting. Answers arrive with each booking." },
  { key: "notify", n: "10", title: "Notifications", desc: "Confirmations and reminders sent around each booking." },
];

const ALL_OPEN: Record<AreaKey, boolean> = Object.fromEntries(
  AREA_META.map((a) => [a.key, true]),
) as Record<AreaKey, boolean>;

/* ---------------------------------------------------- the collapsed answer */

/**
 * What a closed fold-out says. `tone` is what turns a summary into a status: a
 * calendar with no open day, no host, or an unsendable rule is broken, and the
 * person must be able to see that without opening ten panels.
 */
interface AreaState { value: string; tone?: Tone }

interface SummaryInput {
  d: CalendarDraft;
  avail: AvailState;
  hosts: CalendarHost[];
  hostsError: string | null;
  readiness: SendReadiness;
}

function areaState(key: AreaKey, { d, avail, hosts, hostsError, readiness }: SummaryInput): AreaState {
  switch (key) {
    case "details":
      if (!d.title.trim()) return { value: "unnamed", tone: "warn" };
      return { value: TYPE_LABEL[d.type] ?? d.type };
    case "schedule": {
      const days = availToJson(avail).length;
      const inverted = Object.values(avail).some((v) => v.enabled && v.start >= v.end);
      if (days === 0) return { value: "no open hours", tone: "bad" };
      if (inverted) return { value: "hours end before they start", tone: "bad" };
      return { value: `${days} ${days === 1 ? "day" : "days"} · ${minutesLabel(d.min_notice_min)} notice` };
    }
    case "dates": {
      if (!d.date_overrides.length) return { value: "none" };
      // Counting the overrides is not the same as counting the ones that will
      // survive. `buildCalendarPatch` drops any non-blocked date whose windows
      // are all missing or inverted, which silently restores the ordinary weekly
      // hours for that date — the same quiet loss of availability this surface
      // was repaired to stop. So the closed plate reports what will actually be
      // kept, and warns while the difference is still fixable.
      const kept = d.date_overrides.filter(willSaveDateOverride).length;
      const dropped = d.date_overrides.length - kept;
      const label = (n: number) => `${n} ${n === 1 ? "date" : "dates"}`;
      if (dropped > 0) {
        return {
          value: kept
            ? `${label(kept)} set · ${label(dropped)} will not save`
            : `${label(dropped)} will not save`,
          tone: "warn",
        };
      }
      return { value: `${label(kept)} set` };
    }
    case "rules":
      return { value: `${d.duration_min} min · ${d.buffer_before_min}/${d.buffer_after_min} buffer` };
    case "menu": {
      // Same source of truth as the other two, so this one cannot drift either.
      const unnamed = d.appointment_types.filter((t) => !willSaveAppointmentType(t)).length;
      if (unnamed) return { value: `${unnamed} unnamed · will not save`, tone: "warn" };
      return { value: d.appointment_types.length === 1 ? "1 service" : d.appointment_types.length ? `${d.appointment_types.length} services` : "single meeting" };
    }
    case "team": {
      // A failed read is not an empty roster (§13).
      if (hostsError) return { value: "hosts could not be read", tone: "warn" };
      if (hosts.length === 0) return { value: "no host — cannot be booked", tone: "bad" };
      const strategy = d.type === "round_robin" ? ` · ${d.assignment_strategy.mode}` : "";
      return { value: `${hosts.length} ${hosts.length === 1 ? "host" : "hosts"}${strategy}` };
    }
    case "how": {
      const n = d.location_options.length;
      if (n === 1) {
        return { value: MEETING_METHODS.find((m) => m.type === d.location_options[0].type)?.label ?? d.location_options[0].type };
      }
      return { value: `${n} methods` };
    }
    case "page":
      return { value: d.theme === "dark" ? "dark theme" : "light theme" };
    case "intake": {
      if (!d.intake_questions.length) return { value: "none" };
      // The save keeps a question only if it has a label, and — for a choice —
      // at least one option. Counting them all reported an unnamed question as
      // configured moments before it was discarded.
      const kept = d.intake_questions.filter(willSaveQuestion).length;
      const dropped = d.intake_questions.length - kept;
      const label = (n: number) => `${n} ${n === 1 ? "question" : "questions"}`;
      if (dropped) {
        return {
          value: kept ? `${label(kept)} · ${label(dropped)} will not save` : `${label(dropped)} will not save`,
          tone: "warn",
        };
      }
      return { value: label(kept) };
    }
    case "notify": {
      const verdict = sendVerdict(d.notify_config, readiness);
      const r = d.notify_config.reminders.length;
      const base = `${r} ${r === 1 ? "reminder" : "reminders"}${d.notify_config.followup_guest ? " · follow-up" : ""}`;
      if (verdict.silent) return { value: "nothing is sent" };
      if (verdict.held) return { value: `${base} · held`, tone: "bad" };
      if (verdict.unchecked) return { value: `${base} · not checked`, tone: "warn" };
      return { value: base };
    }
    default:
      return { value: "" };
  }
}

/**
 * Creating a preset — a guided chooser, not a blank name field.
 *
 * A booking preset is a scheduling MODEL first (one-on-one, a rotating team, a
 * class, …), and a name second. Asking for a name before the owner has seen the
 * models makes them invent a label for a thing they have not yet decided the
 * shape of — the exact "learn the concept from an empty box" failure §36 exists
 * to prevent. So this opens on the recognizable booking types (their meaning
 * shown before selection), offers a few standard starting points inside each,
 * and only then takes a name. Custom is the escape hatch: name it, pick how it
 * schedules, start from a blank draft.
 *
 * Whatever is chosen, the result is a private DRAFT — the server creates it
 * `enabled = false` and nothing here publishes it (§13). The ten-area editor is
 * where it gets shaped; Publish is a separate, deliberate act.
 */
function NewPresetChooser({
  onCreate, disabled,
}: {
  onCreate: (draft: CalendarDraft, avail?: AvailState) => Promise<{ ok: boolean; message?: string }>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<PresetCategory | null>(null);
  const [customModel, setCustomModel] = useState<SchedulingModel>("personal");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  // A create failure is shown INLINE here (not as a surface notice the modal
  // would occlude), so the reason is readable where the attempt was made (§13/§15).
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => { setCat(null); setName(""); setCustomModel("personal"); setError(null); }, []);
  const close = useCallback(() => { setOpen(false); reset(); }, [reset]);

  useBeforeUnloadGuard(open && (saving || name.trim().length > 0));

  // Focus the first actionable control whenever the step changes.
  useEffect(() => {
    if (!open) return;
    if (cat) nameRef.current?.focus();
    else firstRef.current?.focus();
  }, [open, cat]);

  // Escape closes the whole chooser (unless a create is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, close]);

  const createFrom = useCallback(async (category: PresetCategory, template: PresetTemplate | null) => {
    if (saving || disabled) return;
    if (category.custom && !name.trim()) { nameRef.current?.focus(); return; }
    // Custom carries the owner's chosen scheduling behavior; a standard category
    // carries its own fixed model.
    const chosen = category.custom ? { ...category, model: customModel } : category;
    setError(null);
    setSaving(true);
    const res = await onCreate(draftForTemplate(chosen, template, name));
    setSaving(false);
    // Only stand down on success — a failure keeps the chooser (and the typed
    // name) and shows the reason inline so it can be read and the attempt retried.
    if (res.ok) close();
    else setError(res.message ?? "Could not create the preset — please try again.");
  }, [saving, disabled, name, customModel, onCreate, close]);

  if (!open) {
    return (
      <Btn size="s" onClick={() => setOpen(true)} disabled={disabled}>
        <CalendarPlus aria-hidden /> New preset
      </Btn>
    );
  }

  return (
    <div className="cc-chooser-backdrop" role="presentation"
      onMouseDown={(e) => { if (e.currentTarget === e.target && !saving) close(); }}>
      <div className="cc-chooser" role="dialog" aria-modal="true" aria-labelledby="cc-chooser-title">
        <header className="cc-chooser-head">
          <div>
            <span>New booking preset</span>
            <h2 id="cc-chooser-title">{cat ? cat.label : "What can people book?"}</h2>
          </div>
          <button type="button" className="cc-chooser-x" aria-label="Close" onClick={close} disabled={saving}>
            <X aria-hidden />
          </button>
        </header>

        {error && (
          <div className="cc-chooser-err">
            <Notice tone="bad" icon={<TriangleAlert aria-hidden />}>{error}</Notice>
          </div>
        )}

        {!cat ? (
          <div className="cc-chooser-body">
            <p className="cc-chooser-lead">
              Pick a booking model to start from. Each one creates a private draft you shape and
              publish when you’re ready — nothing goes live yet.
            </p>
            <div className="cc-chooser-grid">
              {PRESET_CATALOG.map((c, i) => (
                <button key={c.id} type="button" ref={i === 0 ? firstRef : undefined}
                  className="cc-chooser-cat" onClick={() => setCat(c)} disabled={saving}>
                  <b>{c.label}</b>
                  <span className="cc-chooser-sum">{c.summary}</span>
                  <span className="cc-chooser-det">{c.detail}</span>
                  {c.minHosts > 1 && <span className="cc-chooser-req"><Users aria-hidden /> Needs {c.minHosts}+ hosts</span>}
                </button>
              ))}
            </div>
          </div>
        ) : cat.custom ? (
          <div className="cc-chooser-body">
            <p className="cc-chooser-lead">{cat.detail}</p>
            <label className="cc-chooser-field">
              <span>Name</span>
              <input ref={nameRef} className="cc-in" value={name} placeholder="e.g. Strategy session"
                aria-label="Name for the new booking preset" disabled={saving}
                onChange={(e) => setName(e.target.value)} />
            </label>
            <fieldset className="cc-chooser-models">
              <legend>How it schedules</legend>
              <div role="radiogroup" aria-label="How it schedules">
                {TYPES.map((t) => (
                  <button key={t.value} type="button" role="radio" aria-checked={customModel === t.value}
                    className="cc-chooser-model" data-on={customModel === t.value} disabled={saving}
                    onClick={() => setCustomModel(t.value as SchedulingModel)}>
                    <b>{t.label}</b><span>{t.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="cc-chooser-actions">
              <Btn kind="ghost" size="s" onClick={reset} disabled={saving}><ArrowLeft aria-hidden /> Back</Btn>
              <Btn kind="act" size="s" onClick={() => void createFrom(cat, null)} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="cc-spin" aria-hidden /> : <CalendarPlus aria-hidden />} Create draft
              </Btn>
            </div>
          </div>
        ) : (
          <div className="cc-chooser-body">
            <p className="cc-chooser-lead">{cat.detail}</p>
            <label className="cc-chooser-field">
              <span>Name <em>(optional — rename it any time)</em></span>
              <input ref={nameRef} className="cc-in" value={name}
                placeholder={cat.templates[0]?.title ?? cat.label}
                aria-label="Name for the new booking preset" disabled={saving}
                onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="cc-chooser-list" role="list">
              {cat.templates.map((t) => (
                <button key={t.id} type="button" role="listitem" className="cc-chooser-tpl" disabled={saving}
                  onClick={() => void createFrom(cat, t)}>
                  <span><b>{t.label}</b><span>{t.blurb}</span></span>
                  {saving ? <Loader2 className="cc-spin" aria-hidden /> : <ChevronRight aria-hidden />}
                </button>
              ))}
            </div>
            <div className="cc-chooser-actions">
              <Btn kind="ghost" size="s" onClick={reset} disabled={saving}><ArrowLeft aria-hidden /> Back</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ the surface */

/**
 * Who a Connections surface belongs to, and whether an answer that arrives
 * later still belongs to them.
 *
 * The question is "does what I am showing belong to the account the URL names?",
 * and it used to be answered by INFERENCE: the route and the loaded tenant have
 * no identifier in common — a number against a uuid — so the account in force
 * when the tenant last changed was recorded, and disagreement with the route
 * meant stale. That reasoning holds only while the route moves first. It does
 * not: `switchTenant` commits the tenant and leaves navigation to its caller, so
 * a tenant switch moves them the other way round, records the NEW tenant as
 * belonging to the OLD account, and then never changes again — leaving the
 * surface permanently convinced it is stale, with the editor hidden and create,
 * connect and disconnect all refusing, until something remounts it. An inference
 * that cannot be re-derived does not recover.
 *
 * So the hook no longer infers. `accountNumber` is the route address of the
 * account whose rows are actually in state (§65), reported by the data hook
 * beside the tenant id, and staleness is now a direct comparison against the
 * route. It is computed from current values ONLY — no refs, no history, nothing
 * to get stuck in — so whichever of the two moves first, the surface is stale
 * exactly while they disagree and recovers by itself the moment they agree.
 *
 * A null address is "cannot tell", never "mismatch": failing open keeps an
 * unresolvable case usable, where failing closed would reproduce the lock-out
 * this rewrite exists to remove.
 *
 * Three readings, because three different questions get asked:
 *   `stale`        — render-time. Should this control be shown or enabled?
 *   `isStale()`    — call-time, BEFORE an await. May this act at all? A write, a
 *                    clipboard entry or a redirect that has happened cannot be
 *                    guarded afterwards, so this is the only reading that can
 *                    prevent one.
 *   `stillCurrent` — call-time, AFTER an await, against a token taken before it.
 *                    May this result be shown?
 *
 * The call-time readings go through a ref because a callback that suspended
 * holds whichever values were current when it was created — precisely the stale
 * ones.
 */
type AccountToken = { account: string | undefined; tenantId: string | null };

function useAccountIdentity(account: string | undefined, tenantId: string | null, accountNumber: number | null) {
  const stale = accountIsStale(account, { tenantId, accountNumber });

  const live = useRef({ account, tenantId, stale });
  live.current = { account, tenantId, stale };

  const isStale = useCallback(() => live.current.stale, []);
  const capture = useCallback((): AccountToken => (
    { account: live.current.account, tenantId: live.current.tenantId }
  ), []);
  const stillCurrent = useCallback((t: AccountToken) => (
    live.current.account === t.account
    && live.current.tenantId === t.tenantId
    // Both unchanged AND the pair currently agrees. The first two alone would
    // wave through a result captured during a window that has not resolved.
    && !live.current.stale
  ), []);

  return useMemo(() => ({ stale, isStale, capture, stillCurrent }), [stale, isStale, capture, stillCurrent]);
}

type AccountIdentity = ReturnType<typeof useAccountIdentity>;

export function CalendarsView() {
  const conn = useCalendarConnections();
  /** The account on screen right now, readable from inside an older closure. */
  const params = useParams();
  const identity = useAccountIdentity(params.account, conn.tenantId, conn.accountNumber);
  const identityStale = identity.stale;
  const location = useLocation();
  const account = params.account ?? "";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [avail, setAvail] = useState<AvailState>(() => jsonToAvail(null));
  const [slugInput, setSlugInput] = useState("");
  const [open, setOpen] = useState<Partial<Record<AreaKey, boolean>>>({ details: true });
  const [saving, setSaving] = useState(false);
  /**
   * Feedback about a specific account, stamped with the account it is about.
   *
   * This component stays mounted across an account change — `SoloSettings` does
   * not remount it and nothing here resets state on identity — so a "Saved."
   * from A would otherwise still be on screen under B's route, reporting one
   * account's outcome as another's. The guards on the callbacks stop a notice
   * being SET after a move; they cannot retract one set before it.
   *
   * The stamp is the same `AccountToken` the callbacks capture, and it is read
   * back through the same `stillCurrent` rule at render, so the answer is
   * derived rather than cleared on a timer. That preserves a notice FOR the
   * account that produced it — come back to A and A's message is still there —
   * while B never sees it.
   */
  const [notice, setNotice] = useState<
    { tone: "warn" | "bad" | "info"; text: string; at: AccountToken } | null
  >(null);
  const areaRefs = useRef<Partial<Record<AreaKey, HTMLDivElement | null>>>({});

  /** Raise a notice against the account that is current right now. */
  const note = useCallback(
    (tone: "warn" | "bad" | "info", text: string) =>
      setNotice({ tone, text, at: identity.capture() }),
    [identity],
  );

  // The preset the editor is open on, or null in LIST mode. It no longer falls
  // through to the first row: the surface is a master/detail now — the main page
  // shows the compact preset list and opens the focused editor only when the
  // owner picks one (owner direction 2026-09-13). A stale selectedId (its row
  // gone after a reload) resolves to null and drops back to the list.
  const selected = useMemo(
    () => conn.calendars.find((c) => c.id === selectedId) ?? null,
    [conn.calendars, selectedId],
  );
  /**
   * Which calendar is on screen right now, readable from inside an await.
   *
   * `selectedId` can be null and the selection then falls through to the first
   * row, so the answer is `selected`, not the state — and a callback that
   * suspended holds whichever value was current when it was created. A save
   * that lands after the person moved on has to be able to ask.
   */
  const liveSelected = useRef<string | null>(selected?.id ?? null);
  liveSelected.current = selected?.id ?? null;

  /**
   * Hydrate the editable draft when the SELECTION changes — and only then, so
   * typing is never clobbered by an unrelated re-render.
   *
   * A save re-hydrates by saying so, not by being detected. The previous
   * attempt keyed this on `updated_at`, which reads like a revision and is not
   * one: `calendars.updated_at` carries an insert-time `DEFAULT now()`, has no
   * update trigger, and the save does not set it — so the stamp never moved,
   * the effect no-opped, and values the patch normalised or dropped stayed on
   * screen after a successful save. A column that looks like a revision is
   * worse than none, because it makes the bug look fixed.
   */
  const hydrate = useCallback((row: CalendarRow) => {
    hydratedFrom.current = row.id;
    setDraft(draftFromRow(row));
    setAvail(jsonToAvail(row.availability_json));
    setSlugInput(row.slug);
  }, []);
  const hydratedFrom = useRef<string>("");
  useEffect(() => {
    if (!selected) { hydratedFrom.current = ""; setDraft(null); return; }
    if (hydratedFrom.current === selected.id) return;
    hydrate(selected);
  }, [selected, hydrate]);

  const patch = useMemo(() => (draft ? buildCalendarPatch(draft, avail) : null), [draft, avail]);
  const savedPatch = useMemo(
    () => (selected ? buildCalendarPatch(draftFromRow(selected), jsonToAvail(selected.availability_json)) : null),
    [selected],
  );
  const slugChanged = Boolean(selected && slugify(slugInput) && slugify(slugInput) !== selected.slug);
  const dirty = Boolean(patch && savedPatch && (JSON.stringify(patch) !== JSON.stringify(savedPatch) || slugChanged));
  useBeforeUnloadGuard(dirty || saving);
  // Read by `selectPreset`, which is declared above this line and must see the
  // CURRENT value rather than the one captured when it was created.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const set = useCallback(<K extends keyof CalendarDraft>(key: K, value: CalendarDraft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }, []);

  const revert = useCallback(() => {
    if (!selected) return;
    setDraft(draftFromRow(selected));
    setAvail(jsonToAvail(selected.availability_json));
    setSlugInput(selected.slug);
    setNotice(null);
  }, [selected]);

  const save = useCallback(async () => {
    if (!selected || !patch) return;
    const title = String(patch.title ?? "").trim();
    if (!title) { note("warn", "Give this calendar a name before saving."); return; }
    // Refused BEFORE the write, not after it — the same pre-await gate create,
    // publish and pause already carry (§9). A save fired while the account is
    // stale would UPDATE the DEPARTING account's calendar under a tenant that
    // still names it, and the after-await `stillCurrent` guard cannot undo a write
    // that already happened. Silent return, matching the sibling handlers: a
    // notice raised here belongs to an account the reader has left. The dirty bar
    // stays, so the edit is not lost — it re-offers Save once the account settles.
    if (identity.isStale()) return;
    setSaving(true);
    const desired = slugify(slugInput);
    const body = desired && desired !== selected.slug ? { ...patch, slug: desired } : patch;
    const token = identity.capture();
    const editing = selected.id;
    const result = await conn.saveCalendar(selected.id, body as Record<string, unknown>);
    // Always, whoever the result belongs to — the flag is local to this surface
    // and a request that never clears it leaves the editor read-only forever.
    setSaving(false);
    /**
     * Everything below writes editor state, so the result has to still be the
     * one this editor is showing.
     *
     * A save for A that is still in flight when the route moves to B lands
     * AFTER B's rows have settled, and `hydrate` then puts A's values into the
     * draft while `selected` is B's calendar. Nothing corrects it: the
     * hydration effect keys on `selected`, which has already changed and does
     * not change again, so the mismatch is invisible until the next save writes
     * A's values into B's calendar. The same holds for a preset switch inside
     * one account, and for the window where the route has moved but the tenant
     * has not — the editor is hidden there, but the corrupted draft would be
     * waiting when it comes back.
     *
     * There is no notice on this path. A save that belongs to an account
     * someone has left cannot be reported into the account they are now
     * looking at, in either direction: neither the success nor the failure is
     * about anything on their screen.
     */
    if (!identity.stillCurrent(token) || liveSelected.current !== editing) return;
    if (!result.ok) { note("bad", result.message); return; }
    // From the row that was actually stored, not the draft that was sent. The
    // patch clamps and drops — an unnamed question, an unusable date override —
    // and leaving those on screen would have the surface disagreeing with the
    // database about what exists, moments after saying the save worked.
    hydrate(result.row);
    // The server auto-pauses a LIVE preset that this edit pushed below the publish
    // bar (dropped its last host, blanked its hours, removed its only method) — a
    // Live public page that can no longer take a booking is taken off the air, not
    // left lying. Say so plainly: a save that silently unpublished the page is
    // exactly the surprise §13/§58 forbid. The re-hydrated row is now Paused, and
    // the SelectedPreset banner spells out what to fix before re-publishing.
    if (result.autoPaused) {
      note("warn", "Saved — but this change means the page can no longer take a booking, so it’s now paused. Fix what’s flagged below, then Publish again.");
    } else {
      note("info", "Saved. The public page now uses these settings.");
    }
  }, [selected, patch, slugInput, conn, hydrate, identity, note]);

  /**
   * Commit a new host roster for the calendar on screen.
   *
   * This writes IMMEDIATELY rather than joining the draft's Save bar. Membership
   * and order are not fields of the calendar row — they are rows of their own,
   * rewritten atomically by their own RPC — and holding them in the draft would
   * mean Discard silently reverted a roster change the database had already
   * taken, or Save pushed one nobody had asked for.
   *
   * It carries the same guard as `save`: a result that belongs to an account or
   * a preset the reader has left is dropped rather than reported into whatever
   * they are looking at now.
   */
  const saveHosts = useCallback(async (orderedUserIds: string[]) => {
    if (!selected) return;
    const token = identity.capture();
    const editing = selected.id;
    const result = await conn.saveHosts(selected.id, orderedUserIds);
    if (!identity.stillCurrent(token) || liveSelected.current !== editing) return;
    if (!result.ok) { note("bad", result.message); return; }
    note("info", "Saved. Bookings follow this order from now on.");
  }, [selected, conn, identity, note]);

  const jumpTo = useCallback((key: AreaKey) => {
    setOpen((o) => ({ ...o, [key]: true }));
    // Two frames: one for the open state to commit, one for layout to settle, so
    // the scroll lands on the expanded plate rather than its collapsed height.
    //
    // `scrollIntoView` is feature-detected rather than assumed. It always exists
    // in a browser, but this runs a full two frames after the click — long enough
    // to land in a torn-down or non-browser environment (jsdom does not implement
    // it), where an unguarded call throws from inside a frame callback that no
    // test can catch. Moving focus is the part that actually matters for
    // keyboard users, so it happens either way.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const area = areaRefs.current[key];
      if (!area) return;
      if (typeof area.scrollIntoView === "function") {
        area.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      area.querySelector<HTMLButtonElement>(".cc-area-t")?.focus({ preventScroll: true });
    }));
  }, []);

  const create = useCallback(async (newDraft: CalendarDraft, newAvail?: AvailState): Promise<{ ok: boolean; message?: string }> => {
    // Every failure below RETURNS its reason rather than raising a surface notice,
    // so the chooser can show it INLINE where the action was taken — a notice
    // rendered on the surface would be occluded by the chooser modal, and "the
    // reason can be read" (§13/§15) has to mean read here, not behind the dialog.
    //
    // Checked BEFORE anything is created: the new calendar becomes the selection,
    // and the hydration effect would replace the current draft with it.
    if (dirtyRef.current) {
      return { ok: false, message: "Save or discard your changes before creating another preset — they would be lost otherwise." };
    }
    // Refused BEFORE anything is written, because the check after the await
    // structurally cannot cover the window where the route has moved to the new
    // account but the tenant has not. A write that has happened cannot be guarded
    // after the fact; the only working guard is the one that declines to make it.
    if (identity.isStale()) {
      return { ok: false, message: "This account just changed — reopen Calendars and create the preset there." };
    }
    const token = identity.capture();
    const r = await conn.createCalendar(newDraft, newAvail);
    if (!identity.stillCurrent(token)) {
      return { ok: false, message: "The account changed while creating — nothing was created on this one." };
    }
    if (!r.ok || !r.row) {
      return { ok: false, message: r.ok ? "Created, but could not open it — refresh and try again." : r.message };
    }
    // Open the new preset's editor on Details, so choosing a model lands the owner
    // straight in the thing they now shape. It is ALWAYS a private draft — the
    // server never publishes on create — so the notice says exactly that, and the
    // owner publishes deliberately from the editor when it is ready.
    setSelectedId(r.row.id);
    setOpen({ details: true });
    note("info", `“${r.row.title}” started as a private draft. Configure it below, then Publish when you’re ready to take bookings.`);
    return { ok: true };
  }, [conn, identity, note]);

  /**
   * Switching presets is a navigation, and it used to be a silent delete.
   *
   * The hydration effect replaces the draft with whichever row is selected, so
   * clicking another preset while the current one had unsaved edits discarded
   * them — and coming back reloaded the stored version, with the surface having
   * shown an unsaved-changes bar the whole time. Nothing warned, and nothing
   * could be recovered. The bar's own Discard is right there, so the honest
   * behaviour is to refuse the switch and say which two ways out exist.
   */
  const selectPreset = useCallback((id: string) => {
    if (id === selected?.id) return;
    if (dirtyRef.current) {
      note("warn", "Save or discard your changes before switching to another preset — they would be lost otherwise.");
      return;
    }
    setSelectedId(id);
    setNotice(null);
  }, [selected?.id, note]);

  const copyLink = useCallback(async (slug: string) => {
    // Refused before the write, not after it. The harm here is not a misplaced
    // notice but the clipboard itself: `slug` belongs to the account being
    // left, so a copy that goes through hands someone a working booking link
    // for a calendar that is not on their screen — and they will paste it.
    if (identity.isStale()) return;
    const token = identity.capture();
    try {
      await navigator.clipboard.writeText(bookingUrl(slug));
    } catch {
      if (identity.stillCurrent(token)) {
        note("warn", "Your browser blocked the copy — select the link and copy it manually.");
      }
      return;
    }
    if (!identity.stillCurrent(token)) return;
    // Honest about what was copied: a Draft/Paused preset's page is not public, so
    // its URL is a future/held one, not a live booking link (§13).
    note("info", selected?.enabled
      ? "Booking link copied."
      : "Copied the future booking URL — it becomes public when you publish this preset.");
  }, [identity, note, selected]);

  /**
   * Publish / pause a preset — the lifecycle transitions, each guarded the same
   * way `save` is: refused BEFORE the write when the account is stale, and the
   * result dropped if it belongs to an account or preset the reader has left.
   * Publish is the ONLY path to a public link, and the server revalidates it — a
   * refusal returns the exact thing to fix, which the surface shows rather than
   * pretending the page went live (§13).
   */
  const publishPreset = useCallback(async () => {
    if (!selected || identity.isStale()) return;
    const token = identity.capture();
    const editing = selected.id;
    const r = await conn.publish(selected.id);
    if (!identity.stillCurrent(token) || liveSelected.current !== editing) return;
    if (!r.ok) note("bad", r.message);
    else note("info", "Published. The booking link is live and taking bookings.");
  }, [selected, conn, identity, note]);

  const pausePreset = useCallback(async () => {
    if (!selected || identity.isStale()) return;
    const token = identity.capture();
    const editing = selected.id;
    const r = await conn.pause(selected.id);
    if (!identity.stillCurrent(token) || liveSelected.current !== editing) return;
    if (!r.ok) note("bad", r.message);
    else note("info", "Paused. The public link no longer accepts bookings.");
  }, [selected, conn, identity, note]);

  /**
   * Leave the editor for the preset list. Guarded like a preset switch: unsaved
   * edits are not silently thrown away — Save or Discard first.
   */
  const backToPresets = useCallback(() => {
    if (dirtyRef.current) {
      note("warn", "Save or discard your changes before leaving this preset — they would be lost otherwise.");
      return;
    }
    setSelectedId(null);
    setNotice(null);
  }, [note]);

  const ro = !conn.canWrite || saving;
  const hosts = selected ? conn.hosts[selected.id] ?? [] : [];
  const summaryInput: SummaryInput | null = draft
    ? { d: draft, avail, hosts, hostsError: conn.hostsError, readiness: conn.readiness }
    : null;
  const states = useMemo(
    () => (summaryInput ? AREA_META.map((a) => [a.key, areaState(a.key, summaryInput)] as const) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, avail, hosts, conn.hostsError, conn.readiness],
  );
  const stateOf = useCallback(
    (key: AreaKey): AreaState => states.find(([k]) => k === key)?.[1] ?? { value: "" },
    [states],
  );
  const issues = states.filter(([, s]) => s.tone === "bad" || s.tone === "warn");
  const allOpen = AREA_META.every((a) => open[a.key]);

  // Can this preset be published right now — the SAME three checks the server
  // enforces (`publish_calendar_preset`), mirrored so the editor can enable or
  // disable Publish and name what is missing before the owner clicks it. Computed
  // from the SAVED row, because Publish acts on what is stored; unsaved edits are
  // the Save bar's concern, and the server is the authority either way (§13).
  const publishCheck: PublishCheck = useMemo(
    () => (selected
      ? publishReadiness({
          type: selected.type,
          availability_json: selected.availability_json,
          date_overrides: selected.date_overrides ?? [],
          location_options: selected.location_options ?? [],
          location_type: selected.location_type,
          hostCount: hosts.length,
        })
      : { ready: false, blockers: [] }),
    [selected, hosts.length],
  );

  // Editor mode vs list mode. The editor opens only on a real selection with a
  // hydrated draft, a verified read and a non-stale account — the guard the
  // editor block always carried, promoted to decide the whole surface's shape
  // (the master/detail split, owner direction 2026-09-13).
  const editorMode = Boolean(selected && draft && summaryInput && !conn.error && !identityStale);

  /**
   * The address to come back to after an OAuth round trip.
   *
   * Which Connections segment you are looking at is local state, so it never
   * reaches the URL — and the callback remounts Settings from the stored
   * address alone. Returning `pathname + search` therefore landed people on
   * Communications, having sent them away from Calendars: the wrong-surface
   * miss the return path exists to prevent, reintroduced one step later. This
   * component IS the Calendars segment, so it says so.
   */
  const returnHere = useMemo(() => {
    const search = new URLSearchParams(location.search);
    search.set("segment", "calendars");
    return `${location.pathname}?${search.toString()}`;
  }, [location.pathname, location.search]);

  return (
    <div className="cc" data-mode={editorMode ? "editor" : "list"}>
      {/* The account-stamped notice shows in BOTH modes: a create refusal belongs
          to the list, a save/publish refusal to the editor, and an empty-state
          create error has no selection to live under (it would otherwise be
          swallowed in the exact flow this control exists for). */}
      {notice && identity.stillCurrent(notice.at) && (
        <Notice tone={notice.tone} icon={notice.tone === "bad" ? <TriangleAlert aria-hidden /> : <Info aria-hidden />}>
          {notice.text}
        </Notice>
      )}

      {editorMode && selected && draft && summaryInput ? (
        /* ── EDITOR: one preset, focused ──────────────────────────────────────
           The main page is the list; opening a preset swaps to this focused
           editor and hides the accounts + list, so the ten areas are not spread
           across the page (owner direction 2026-09-13). "All presets" is the way
           back, guarded against losing unsaved edits. */
        <>
          <div className="cc-editor-back">
            <Btn kind="ghost" size="s" onClick={backToPresets}><ArrowLeft aria-hidden /> All presets</Btn>
          </div>

          <SelectedPreset
            row={selected} draft={draft} hosts={hosts} hostsError={conn.hostsError}
            readiness={conn.readiness} busy={conn.busy === selected.id} disabled={ro}
            canWrite={conn.canWrite} publishCheck={publishCheck}
            issues={issues.map(([key, s]) => ({ key, title: AREA_META.find((a) => a.key === key)!.title, ...s }))}
            onJump={jumpTo}
            onCopy={() => copyLink(selected.slug)}
            onPublish={publishPreset}
            onPause={pausePreset}
          />

          {!conn.canWrite && (
            <Notice tone="info" icon={<Info aria-hidden />}>
              You can read this configuration but not change it. Every control below is disabled
              rather than hidden, so you can still see exactly how the preset is set up.
            </Notice>
          )}

          <section className="cc-sec">
            <div className="cc-builder-head">
              <div className="cc-head-t">
                <span className="cc-eyebrow">Configuration</span>
                <h2>How this preset behaves</h2>
              </div>
              <Btn size="s" kind="ghost"
                onClick={() => setOpen(allOpen ? {} : { ...ALL_OPEN })}>
                {allOpen ? <><ChevronsDownUp aria-hidden /> Collapse all</> : <><ChevronsUpDown aria-hidden /> Expand all</>}
              </Btn>
            </div>

            {/* An index, not a scroller: it wraps rather than taking a scrollbar of
                its own, because a strip you have to drag sideways is where a
                configuration area goes to hide. */}
            <nav className="cc-index" aria-label="Jump to a configuration area">
              {AREA_META.map((a) => {
                const s = stateOf(a.key);
                return (
                  <button key={a.key} type="button" className="cc-index-i"
                    data-open={Boolean(open[a.key])} data-tone={s.tone}
                    onClick={() => jumpTo(a.key)}>
                    <b>{a.title}</b>
                    <span>{s.value}</span>
                  </button>
                );
              })}
            </nav>

            <div className="cc-areas">
              {AREA_META.map((a) => (
                <Area key={a.key} meta={a} open={Boolean(open[a.key])} state={stateOf(a.key)}
                  onToggle={() => setOpen((o) => ({ ...o, [a.key]: !o[a.key] }))}
                  innerRef={(el) => { areaRefs.current[a.key] = el; }}>
                  <AreaBody
                    area={a.key} draft={draft} set={set} avail={avail} setAvail={setAvail}
                    slugInput={slugInput} setSlugInput={setSlugInput}
                    hosts={hosts} hostsError={conn.hostsError} onRetryHosts={conn.refresh}
                    hostCandidates={selected ? (conn.hostCandidates[selected.id] ?? []) : []}
                    onSaveHosts={saveHosts}
                    hostsBusy={conn.busy === selected.id}
                    canWrite={conn.canWrite}
                    readiness={conn.readiness} disabled={ro} account={account}
                  />
                </Area>
              ))}
            </div>
          </section>

          {dirty && (
            <div className="cc-bar" role="status">
              <span>Unsaved changes on <b>{draft.title || "this preset"}</b>.</span>
              <Btn kind="ghost" size="s" onClick={revert} disabled={saving}><Undo2 aria-hidden /> Discard</Btn>
              <Btn kind="act" onClick={save} disabled={saving || !conn.canWrite}>
                {saving ? <Loader2 className="cc-spin" aria-hidden /> : <CalendarCheck aria-hidden />} Save changes
              </Btn>
            </div>
          )}
        </>
      ) : (
        /* ── LIST: what people can book ─────────────────────────────────────── */
        <>
          <ConnectedAccounts conn={conn} returnTo={returnHere} identity={identity} />

          <section className="cc-sec">
            <div className="cc-head">
              <div className="cc-head-t">
                <span className="cc-eyebrow">Booking presets</span>
                <h2>What people can book</h2>
                <p>
                  Each preset is one bookable thing with its own public page — its length, its hours,
                  who hosts it, and what happens after. New presets start as private drafts; publish
                  one when you’re ready to take bookings.
                </p>
              </div>
              {/* `identityStale` is in the disabled set because creating a preset
                  WRITES, under a tenant that still names the account being left. */}
              {!conn.loading && !conn.error && (
                <NewPresetChooser onCreate={create} disabled={!conn.canWrite || identityStale || conn.busy === "new"} />
              )}
            </div>

            {conn.loading ? <LoadingBody /> : conn.error ? (
              <Notice tone="bad" icon={<TriangleAlert aria-hidden />}>
                <strong>Couldn’t load your calendars.</strong> {conn.error}{" "}
                <Btn kind="ghost" size="s" onClick={conn.refresh}><RefreshCw aria-hidden /> Retry</Btn>
              </Notice>
            ) : conn.empty ? (
              <EmptyBody canWrite={conn.canWrite} onCreate={create} disabled={conn.busy === "new" || identityStale} />
            ) : (
              <div className="cc-presets" aria-label="Booking presets">
                {conn.calendars.map((c) => {
                  const life = presetLifecycle(c);
                  const hostList = conn.hosts[c.id] ?? [];
                  const hostSummary = conn.hostsError
                    ? ""
                    : hostList.length === 0 ? "No host" : hostList.length === 1 ? "1 host" : `${hostList.length} hosts`;
                  return (
                    <button key={c.id} type="button" className="cc-preset-card"
                      aria-label={`Open ${c.title || "Untitled preset"} — ${LIFECYCLE_LABEL[life]}`}
                      onClick={() => selectPreset(c.id)}>
                      {/* The NAME gets the whole first line — it is the one thing on
                          the card you pick by, and sharing the line truncated real
                          titles at four cards across. */}
                      <span className="cc-preset-t">
                        <span className="cc-swatch" style={{ background: c.color ?? "var(--pg-violet)" }} />
                        <span className="cc-preset-n">{c.title || "Untitled preset"}</span>
                      </span>
                      <span className="cc-preset-m">
                        <span>{TYPE_LABEL[c.type] ?? c.type}</span>
                        <em>{c.duration_min} min</em>
                        {hostSummary && <span className="cc-preset-hosts"><Users aria-hidden /> {hostSummary}</span>}
                        <span className="cc-preset-state">
                          <Pill tone={life === "live" ? "live" : life === "paused" ? "warn" : undefined}>
                            {LIFECYCLE_LABEL[life]}
                          </Pill>
                        </span>
                      </span>
                      <ChevronRight className="cc-preset-go" aria-hidden />
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- sub-views */

function LoadingBody() {
  return (
    <div className="cc-presets" aria-busy="true">
      {[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 62 }} />)}
    </div>
  );
}

// `disabled`, not `busy`: it carries the in-flight create AND the window where
// the route has moved but the loaded tenant has not, which is not busyness.
function EmptyBody({
  canWrite, onCreate, disabled,
}: {
  canWrite: boolean;
  onCreate: (draft: CalendarDraft, avail?: AvailState) => Promise<{ ok: boolean; message?: string }>;
  disabled: boolean;
}) {
  return (
    <div className="cc-empty">
      <CalendarDays aria-hidden />
      <strong>No booking presets yet</strong>
      <p>
        A preset is one bookable thing — how long it runs, when you are open, who hosts it, and what
        happens after. Pick a booking model to start a private draft; you publish it when it’s ready,
        and nothing is public until you do. Connecting a calendar account above is separate; you can
        do either first.
      </p>
      {/* The copy above promises creation, so the control that does it belongs
          here rather than only in the header the reader has scrolled past. */}
      {canWrite && <div className="cc-empty-act"><NewPresetChooser onCreate={onCreate} disabled={disabled} /></div>}
    </div>
  );
}

function ConnectedAccounts({ conn, returnTo, identity }: { conn: ReturnType<typeof useCalendarConnections>; returnTo: string; identity: AccountIdentity }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = conn.providers;

  // The identity is handed DOWN rather than derived a second time here. This
  // panel sits outside the editor's staleness gate and never unmounts, so both
  // of its callbacks must ask the question — but two instances of the same
  // reading are two things that can drift apart, and one of them remounting
  // alone would be enough.

  const start = async (provider: "google" | "zoom") => {
    if (identity.isStale()) return;
    setPending(provider); setError(null);
    // The return address is handed over BEFORE the browser leaves, so the
    // callback lands back here instead of on the role-default page.
    const token = identity.capture();
    const r = await conn.connect(provider, returnTo);
    // Always, whoever the answer belongs to: `pending` disables every Connect
    // and Disconnect control on this panel, so a request that never clears it
    // leaves the account someone IS looking at unable to connect anything.
    setPending(null);
    // Nothing below may run for a departed account, and the redirect is the
    // reason the check is here rather than only around `setError`: `returnTo`
    // was built from the address being left, so sending the browser into an
    // OAuth handshake now would hand a provider the wrong account's return
    // path and land the person back on a surface they had navigated away from.
    if (!identity.stillCurrent(token)) return;
    if (!r.ok) { setError(r.message); return; }
    window.location.href = r.url;
  };

  const drop = async (provider: "google" | "zoom") => {
    if (identity.isStale()) return;
    setPending(provider); setError(null);
    const token = identity.capture();
    const r = await conn.disconnect(provider);
    setPending(null);
    if (!identity.stillCurrent(token)) return;
    if (!r.ok) setError(r.message);
  };

  const googleAge = syncAge(p.google_last_sync_at);

  return (
    <section className="cc-sec">
      <div className="cc-head">
        <div className="cc-head-t">
          <span className="cc-eyebrow">Connections · Calendars</span>
          <h2>Connected accounts</h2>
          <p>Connect a calendar and a meeting tool so bookings and busy time stay in sync both ways.</p>
        </div>
      </div>

      {conn.providersError && (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          <strong>Couldn’t read your connections.</strong> {conn.providersError} Nothing below is a claim
          about your accounts until this read succeeds.
        </Notice>
      )}
      {error && <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>{error}</Notice>}

      <div className="cc-accounts">
        <article className="cc-acct" data-state={p.google_calendar_connected ? "connected" : "idle"}>
          <div className="cc-acct-top">
            <span className="cc-acct-glyph"><CalendarDays aria-hidden /></span>
            <span className="cc-acct-name">
              <strong>Google Calendar</strong>
              <span>Two-way sync with your Google account.</span>
            </span>
            {conn.loading ? <Pill>Checking</Pill>
              : conn.providersError ? <Pill>Not checked</Pill>
              : p.google_calendar_connected ? <Pill tone="live">Connected</Pill> : <Pill>Not connected</Pill>}
          </div>
          {p.google_calendar_connected && (
            <span className="cc-acct-detail">
              {p.google_email ?? "Connected account"}{googleAge ? ` · synced ${googleAge}` : " · sync time not reported"}
            </span>
          )}
          <div className="cc-acct-row">
            {p.google_calendar_connected
              ? <Btn size="s" kind="danger" onClick={() => drop("google")} disabled={pending !== null}>
                  {pending === "google" ? <Loader2 className="cc-spin" aria-hidden /> : <Trash2 aria-hidden />} Disconnect
                </Btn>
              : <Btn size="s" onClick={() => start("google")} disabled={pending !== null || Boolean(conn.providersError)}>
                  {pending === "google" ? <Loader2 className="cc-spin" aria-hidden /> : <Link2 aria-hidden />} Connect
                </Btn>}
          </div>
        </article>

        <article className="cc-acct" data-state={p.zoom_connected ? "connected" : "idle"}>
          <div className="cc-acct-top">
            <span className="cc-acct-glyph"><Video aria-hidden /></span>
            <span className="cc-acct-name">
              <strong>Zoom</strong>
              <span>Adds a meeting link to each booking automatically.</span>
            </span>
            {conn.loading ? <Pill>Checking</Pill>
              : conn.providersError ? <Pill>Not checked</Pill>
              : p.zoom_connected ? <Pill tone="live">Connected</Pill> : <Pill>Not connected</Pill>}
          </div>
          {p.zoom_connected && <span className="cc-acct-detail">{p.zoom_email ?? "Connected account"}</span>}
          <div className="cc-acct-row">
            {p.zoom_connected
              ? <Btn size="s" kind="danger" onClick={() => drop("zoom")} disabled={pending !== null}>
                  {pending === "zoom" ? <Loader2 className="cc-spin" aria-hidden /> : <Trash2 aria-hidden />} Disconnect
                </Btn>
              : <Btn size="s" onClick={() => start("zoom")} disabled={pending !== null || Boolean(conn.providersError)}>
                  {pending === "zoom" ? <Loader2 className="cc-spin" aria-hidden /> : <Link2 aria-hidden />} Connect
                </Btn>}
          </div>
        </article>

        {/* Apple has the storage columns but no connect path anywhere in the
            platform, so it is shown as what it is rather than as a button that
            would do nothing. */}
        <article className="cc-acct" data-state="unsupported">
          <div className="cc-acct-top">
            <span className="cc-acct-glyph"><CalendarX2 aria-hidden /></span>
            <span className="cc-acct-name">
              <strong>Apple Calendar</strong>
              <span>iCloud over CalDAV.</span>
            </span>
            <Pill tone="warn">Not built yet</Pill>
          </div>
          <span className="cc-acct-detail">No connect path exists yet</span>
          <div className="cc-acct-row">
            <Btn size="s" disabled title="There is no Apple connect path to run yet"><Link2 aria-hidden /> Connect</Btn>
          </div>
        </article>
      </div>

      <p className="cc-scope">
        <Info aria-hidden />
        <span>
          A connection belongs to whoever is signed in — it is stored against your user, not the
          workspace. On a round-robin calendar each host connects their own account; a host who
          hasn’t still takes bookings, they just get no two-way sync.
        </span>
      </p>
    </section>
  );
}

/**
 * The one place that answers "is this calendar working, and where do I send
 * people?" without opening anything: state, link, the four facts that matter,
 * and every configuration problem as a control that jumps straight to it.
 */
function SelectedPreset({
  row, draft, hosts, hostsError, readiness, busy, disabled, canWrite, publishCheck, issues, onJump, onCopy, onPublish, onPause,
}: {
  row: CalendarRow; draft: CalendarDraft; hosts: CalendarHost[]; hostsError: string | null;
  readiness: SendReadiness; busy: boolean; disabled: boolean; canWrite: boolean; publishCheck: PublishCheck;
  issues: { key: AreaKey; title: string; value: string; tone?: Tone }[];
  onJump: (key: AreaKey) => void; onCopy: () => void; onPublish: () => void; onPause: () => void;
}) {
  const verdict = sendVerdict(draft.notify_config, readiness);
  const reminderLabel = verdict.silent
    ? "Nothing sent"
    : verdict.held ? "Held" : verdict.unchecked ? "Not checked" : "Sending";
  const reminderTone: Tone | undefined = verdict.silent
    ? undefined : verdict.held ? "bad" : verdict.unchecked ? "warn" : "live";
  // Draft → Live / Paused, derived from the two facts the server persists. A
  // Draft and a Paused preset are BOTH not public (enabled=false), and the link
  // block below is careful never to present either as share-ready (§13).
  const life = presetLifecycle(row);
  const isPublic = row.enabled;
  const url = bookingUrl(row.slug);
  // The lifecycle tone: gold only on the true act (Publish), never on a resting
  // pill (§11). Live/Paused pills carry status tones, not gold.
  const lifeTone: Tone | undefined = life === "live" ? "live" : life === "paused" ? "warn" : undefined;

  return (
    <section className="cc-selected" data-life={life}>
      <div className="cc-selected-top">
        <div className="cc-selected-id">
          <h3>{draft.title || "Untitled preset"}</h3>
          <p>{TYPE_LABEL[draft.type] ?? draft.type} · {draft.duration_min} minutes · {draft.timezone}</p>
        </div>
        <div className="cc-selected-life">
          <Pill tone={lifeTone}>{LIFECYCLE_LABEL[life]}</Pill>
          {isPublic ? (
            <Btn size="s" kind="ghost" onClick={onPause} disabled={disabled || busy || !canWrite}
              title="Take this booking page off the air">
              {busy ? <Loader2 className="cc-spin" aria-hidden /> : <Pause aria-hidden />} Pause
            </Btn>
          ) : (
            <Btn size="s" kind="act" onClick={onPublish}
              disabled={disabled || busy || !canWrite || !publishCheck.ready}
              title={publishCheck.ready ? "Make this booking page public" : `Not ready to publish: ${publishCheck.blockers.join(" ")}`}>
              {busy ? <Loader2 className="cc-spin" aria-hidden /> : <Rocket aria-hidden />} Publish
            </Btn>
          )}
        </div>
      </div>

      {/* The public address. For a Draft it is a RESERVED url, not a live one, and
          for a Paused preset it is kept but off the air — so neither is dressed up
          as share-ready, the copy says which, and Open is offered only when the
          page is actually public (§13). */}
      <div className="cc-link" data-public={isPublic}>
        <span className="cc-link-tag">
          {isPublic
            ? "Public booking link"
            : life === "paused"
              ? "Booking link — paused, not public"
              : "Reserved URL — inactive until published"}
        </span>
        <code>{url}</code>
        <Btn size="s" onClick={onCopy}>
          <Copy aria-hidden /> {isPublic ? "Copy link" : "Copy future URL — not public yet"}
        </Btn>
        {isPublic ? (
          <a className="cc-btn" data-size="s" href={url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden /> Open
          </a>
        ) : (
          <Btn size="s" disabled title="This page opens to visitors only after you publish it.">
            <ExternalLink aria-hidden /> Open
          </Btn>
        )}
      </div>

      <dl className="cc-glance">
        <div><dt>Length</dt><dd>{draft.duration_min} min</dd></div>
        <div><dt>Timezone</dt><dd>{draft.timezone}</dd></div>
        <div>
          <dt>Hosts</dt>
          <dd>{hostsError ? "Could not read" : hosts.length === 0 ? "None" : `${hosts.length}${draft.type === "round_robin" ? ` · ${draft.assignment_strategy.mode}` : ""}`}</dd>
        </div>
        <div><dt>Reminders</dt><dd><Pill tone={reminderTone}>{reminderLabel}</Pill></dd></div>
      </dl>

      {life === "draft" && (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          This preset is a <strong>Draft</strong>. Its booking page is private — no visitor can see or
          book it{publishCheck.ready
            ? ", and it’s ready whenever you Publish."
            : ", and it isn’t ready to publish yet:"}
          {!publishCheck.ready && (
            <ul className="cc-blockers">{publishCheck.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
          )}
        </Notice>
      )}
      {life === "paused" && (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          This preset is <strong>Paused</strong>. Its link is kept, but visitors cannot book it right
          now — Publish again to put it back on the air.
          {!publishCheck.ready && (
            <ul className="cc-blockers">{publishCheck.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
          )}
        </Notice>
      )}
      {/* A LIVE preset that no longer clears the publish bar. The update RPC now
          auto-pauses one that an edit breaks, so this is the honest surface for the
          cases that route around it: a legacy row born enabled (a provisioned
          default, the agency builder), or a host removed through set_calendar_hosts
          (a different seam). A visitor who opens this page finds nothing to book, so
          it must not read as healthy — this is the one Live-state warning (§13/§70). */}
      {life === "live" && !publishCheck.ready && (
        <Notice tone="bad" icon={<TriangleAlert aria-hidden />}>
          This page is <strong>Live</strong>, but it can’t currently take a booking — a visitor who
          opens it will find nothing to book. Fix what’s missing, or Pause it until it’s ready:
          <ul className="cc-blockers">{publishCheck.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </Notice>
      )}

      {issues.length > 0 && (
        <div className="cc-issues">
          <span className="cc-issues-h">
            {issues.length} {issues.length === 1 ? "thing needs" : "things need"} attention
          </span>
          {issues.map((i) => (
            <button key={i.key} type="button" className="cc-issue" data-tone={i.tone} onClick={() => onJump(i.key)}>
              <b>{i.title}</b><span>{i.value}</span><ChevronRight aria-hidden />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Area({
  meta, open, state, onToggle, children, innerRef,
}: {
  meta: { key: AreaKey; n: string; title: string; desc: string };
  open: boolean; state: AreaState; onToggle: () => void; children: ReactNode;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="cc-area" data-open={open} data-tone={state.tone} ref={innerRef}>
      <button type="button" className="cc-area-t" aria-expanded={open} onClick={onToggle}>
        <span className="cc-area-n">{meta.n}</span>
        <span className="cc-area-h"><strong>{meta.title}</strong><span>{meta.desc}</span></span>
        {!open && <span className="cc-area-v" data-tone={state.tone}>{state.value}</span>}
        <span className="cc-area-c"><ChevronRight aria-hidden /></span>
      </button>
      {open && <div className="cc-area-b">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- area bodies */

interface BodyProps {
  area: AreaKey;
  draft: CalendarDraft;
  set: <K extends keyof CalendarDraft>(key: K, value: CalendarDraft[K]) => void;
  avail: AvailState;
  setAvail: (a: AvailState) => void;
  slugInput: string;
  setSlugInput: (v: string) => void;
  hosts: CalendarHost[];
  hostsError: string | null;
  onRetryHosts: () => void;
  hostCandidates: HostCandidate[];
  onSaveHosts: (orderedUserIds: string[]) => void;
  hostsBusy: boolean;
  canWrite: boolean;
  readiness: SendReadiness;
  disabled: boolean;
  account: string;
}

function AreaBody(props: BodyProps) {
  switch (props.area) {
    case "details": return <DetailsBody {...props} />;
    case "schedule": return <ScheduleBody {...props} />;
    case "dates": return <DatesBody {...props} />;
    case "rules": return <RulesBody {...props} />;
    case "menu": return <MenuBody {...props} />;
    case "team": return <TeamBody {...props} />;
    case "how": return <HowBody {...props} />;
    case "page": return <PageBody {...props} />;
    case "intake": return <IntakeBody {...props} />;
    case "notify": return <NotifyBody {...props} />;
    default: return null;
  }
}

function DetailsBody({ draft: d, set, slugInput, setSlugInput, disabled }: BodyProps) {
  return (
    <>
      <div className="cc-fields" data-cols="2">
        <Field label="Name">
          <input className="cc-in" value={d.title} disabled={disabled}
            onChange={(e) => set("title", e.target.value)} placeholder="Discovery call" />
        </Field>
        <Field label="Booking link" hint={`Guests will see /book/${slugify(slugInput) || "…"}`}>
          <input className="cc-in" value={slugInput} disabled={disabled}
            onChange={(e) => setSlugInput(e.target.value)} placeholder="discovery-call" />
        </Field>
      </div>
      <div className="cc-fields" data-cols="2">
        <Field label="Type" hint="Changing this changes how bookings are assigned.">
          <select className="cc-sel" value={d.type} disabled={disabled} onChange={(e) => set("type", e.target.value)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>)}
          </select>
        </Field>
        <Field label="Colour" hint="How this calendar is marked across your agenda.">
          <div className="cc-swatches">
            {SWATCHES.map((c) => (
              <button key={c} type="button" className="cc-sw" style={{ background: c }} disabled={disabled}
                aria-label={`Use ${c}`} aria-pressed={d.color?.toLowerCase() === c.toLowerCase()}
                onClick={() => { set("color", c); set("accent", c); }} />
            ))}
          </div>
        </Field>
      </div>
      <div className="cc-fields">
        <Field label="Welcome message" hint="Shown under the title on the booking page.">
          <textarea className="cc-in" value={d.description ?? ""} disabled={disabled}
            onChange={(e) => set("description", e.target.value || null)}
            placeholder="A short line about what this meeting covers." />
        </Field>
      </div>
    </>
  );
}

function ScheduleBody({ draft: d, set, avail, setAvail, disabled }: BodyProps) {
  const setDay = (day: number, next: Partial<{ enabled: boolean; start: string; end: string }>) =>
    setAvail({ ...avail, [day]: { ...avail[day], ...next } });
  return (
    <>
      <div className="cc-fields" data-cols="2">
        <Field label="Timezone" hint="Every time on the booking page is shown in the guest's own zone.">
          <select className="cc-sel" value={d.timezone} disabled={disabled} onChange={(e) => set("timezone", e.target.value)}>
            {(COMMON_TZ.includes(d.timezone) ? COMMON_TZ : [d.timezone, ...COMMON_TZ]).map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="Minimum notice" hint="How close to the start someone may still book.">
          <div className="cc-num">
            <input className="cc-in" type="number" min={0} value={d.min_notice_min} disabled={disabled}
              onChange={(e) => set("min_notice_min", Math.max(0, Number(e.target.value) || 0))} />
            <i>minutes</i>
          </div>
          <div className="cc-presets-row">
            {[0, 60, 240, 1440, 2880].map((m) => (
              <button key={m} type="button" className="cc-chip" disabled={disabled}
                aria-pressed={d.min_notice_min === m} onClick={() => set("min_notice_min", m)}>
                {m === 0 ? "none" : minutesLabel(m)}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="cc-week">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const v = avail[day];
          return (
            <div key={day} className="cc-day">
              <Toggle on={v.enabled} disabled={disabled} label={`${DAY_NAMES[day]} open for booking`}
                onChange={(on) => setDay(day, { enabled: on })} />
              <b>{DAY_NAMES[day]}</b>
              {v.enabled ? (
                <span className="cc-day-times">
                  <input className="cc-in" type="time" value={v.start} disabled={disabled}
                    aria-label={`${DAY_NAMES[day]} opens`} onChange={(e) => setDay(day, { start: e.target.value })} />
                  <em>to</em>
                  <input className="cc-in" type="time" value={v.end} disabled={disabled}
                    aria-label={`${DAY_NAMES[day]} closes`} onChange={(e) => setDay(day, { end: e.target.value })} />
                  {v.start >= v.end && <Pill tone="bad">End must be after start</Pill>}
                </span>
              ) : <span className="cc-day-off">Closed</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

/**
 * Every window on a date override is editable, and each one can be removed.
 *
 * The first port of this area rendered `windows[0]` alone and wrote back a
 * single-element array, so a date with a morning and an afternoon block lost its
 * afternoon the moment anyone nudged the morning — a silent narrowing of when
 * customers could book, saved without a word. Overrides carry a LIST because the
 * builder has always supported one, and this edits the list.
 */
function DatesBody({ draft: d, set, disabled }: BodyProps) {
  const add = () => set("date_overrides", [...d.date_overrides, { date: "", blocked: true, windows: [] }]);
  const update = (i: number, next: Partial<typeof d.date_overrides[number]>) =>
    set("date_overrides", d.date_overrides.map((o, x) => (x === i ? { ...o, ...next } : o)));
  const remove = (i: number) => set("date_overrides", d.date_overrides.filter((_, x) => x !== i));
  const setWindow = (i: number, w: number, next: Partial<{ start: string; end: string }>) =>
    update(i, { windows: d.date_overrides[i].windows.map((win, x) => (x === w ? { ...win, ...next } : win)) });
  const addWindow = (i: number) => {
    const last = d.date_overrides[i].windows.at(-1);
    update(i, { windows: [...d.date_overrides[i].windows, { start: last?.end ?? "09:00", end: "17:00" }] });
  };
  const removeWindow = (i: number, w: number) =>
    update(i, { windows: d.date_overrides[i].windows.filter((_, x) => x !== w) });

  return (
    <>
      {d.date_overrides.length === 0 && (
        <Hint>
          Nothing set. A holiday, a day off, or a one-off late start goes here rather than in the
          weekly pattern — it overrides that day only.
        </Hint>
      )}
      <div className="cc-rows">
        {d.date_overrides.map((o, i) => (
          <div key={`${o.date}-${i}`} className="cc-row">
            <div className="cc-row-top">
              <input className="cc-in" type="date" value={o.date} disabled={disabled} aria-label="Date"
                style={{ width: 156 }} onChange={(e) => update(i, { date: e.target.value })} />
              <SwitchRow title="Blocked all day" on={o.blocked} disabled={disabled}
                onChange={(v) => update(i, { blocked: v, windows: v ? [] : [{ start: "09:00", end: "17:00" }] })} />
              <Btn size="s" kind="ghost" onClick={() => remove(i)} disabled={disabled} title="Remove this date">
                <Trash2 aria-hidden />
              </Btn>
            </div>
            {!o.blocked && (
              <div className="cc-windows">
                {o.windows.map((w, x) => (
                  <div key={x} className="cc-day-times">
                    <input className="cc-in" type="time" aria-label={`Window ${x + 1} opens`} disabled={disabled}
                      value={w.start} onChange={(e) => setWindow(i, x, { start: e.target.value })} />
                    <em>to</em>
                    <input className="cc-in" type="time" aria-label={`Window ${x + 1} closes`} disabled={disabled}
                      value={w.end} onChange={(e) => setWindow(i, x, { end: e.target.value })} />
                    {w.start >= w.end && <Pill tone="bad">End must be after start</Pill>}
                    <Btn size="s" kind="ghost" disabled={disabled} title={`Remove window ${x + 1}`}
                      onClick={() => removeWindow(i, x)}>
                      <Trash2 aria-hidden />
                    </Btn>
                  </div>
                ))}
                {o.windows.length === 0 && (
                  <Hint>Open, but with no hours set — add at least one window or block the day.</Hint>
                )}
                <Btn size="s" kind="ghost" onClick={() => addWindow(i)} disabled={disabled}>
                  <Plus aria-hidden /> Add another window
                </Btn>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="cc-row-add">
        <Btn size="s" onClick={add} disabled={disabled}><Plus aria-hidden /> Add a date</Btn>
      </div>
    </>
  );
}

function RulesBody({ draft: d, set, disabled }: BodyProps) {
  return (
    <>
      <div className="cc-fields" data-cols="2">
        <Field label="Duration">
          <div className="cc-num">
            <input className="cc-in" type="number" min={5} value={d.duration_min} disabled={disabled}
              onChange={(e) => set("duration_min", Math.max(5, Number(e.target.value) || 5))} />
            <i>minutes</i>
          </div>
          <div className="cc-presets-row">
            {DURATION_PRESETS.map((m) => (
              <button key={m} type="button" className="cc-chip" disabled={disabled}
                aria-pressed={d.duration_min === m} onClick={() => set("duration_min", m)}>{m}m</button>
            ))}
          </div>
        </Field>
        <Field label="Capacity" hint="How many people one slot can hold.">
          <div className="cc-num">
            <input className="cc-in" type="number" min={1} value={d.capacity} disabled={disabled}
              onChange={(e) => set("capacity", Math.max(1, Math.round(Number(e.target.value)) || 1))} />
            <i>{d.capacity === 1 ? "seat" : "seats"}</i>
          </div>
        </Field>
      </div>
      <div className="cc-fields" data-cols="2">
        <Field label="Buffer before" hint="Quiet time held before each booking.">
          <div className="cc-presets-row">
            {[0, 5, 10, 15, 30].map((m) => (
              <button key={m} type="button" className="cc-chip" disabled={disabled}
                aria-pressed={d.buffer_before_min === m} onClick={() => set("buffer_before_min", m)}>
                {m === 0 ? "none" : `${m}m`}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Buffer after" hint="Quiet time held after each booking.">
          <div className="cc-presets-row">
            {[0, 5, 10, 15, 30].map((m) => (
              <button key={m} type="button" className="cc-chip" disabled={disabled}
                aria-pressed={d.buffer_after_min === m} onClick={() => set("buffer_after_min", m)}>
                {m === 0 ? "none" : `${m}m`}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="cc-fields">
        <Field label="Booking window" hint="How far ahead guests may book.">
          <select className="cc-sel" value={d.booking_horizon_days} disabled={disabled}
            onChange={(e) => set("booking_horizon_days", Number(e.target.value))}>
            {BOOKING_HORIZON_PRESETS.map((h) => <option key={h.days} value={h.days}>{h.label}</option>)}
          </select>
        </Field>
      </div>
    </>
  );
}

function MenuBody({ draft: d, set, disabled }: BodyProps) {
  const add = () => set("appointment_types", [...d.appointment_types, { id: newId("svc"), name: "", description: "", duration_min: d.duration_min, price_cents: null }]);
  const update = (i: number, next: Partial<typeof d.appointment_types[number]>) =>
    set("appointment_types", d.appointment_types.map((t, x) => (x === i ? { ...t, ...next } : t)));
  const remove = (i: number) => set("appointment_types", d.appointment_types.filter((_, x) => x !== i));
  return (
    <>
      {d.appointment_types.length === 0 && (
        <Hint>
          Empty — guests book a single meeting at the duration above. Add two or more and they pick a
          service first, each with its own length.
        </Hint>
      )}
      <div className="cc-rows">
        {d.appointment_types.map((t, i) => (
          <div key={t.id} className="cc-row">
            <div className="cc-row-grid">
              <Field label="Service"><input className="cc-in" value={t.name} disabled={disabled}
                onChange={(e) => update(i, { name: e.target.value })} placeholder="Strategy review" /></Field>
              <Field label="Length">
                <div className="cc-num">
                  <input className="cc-in" type="number" min={5} value={t.duration_min} disabled={disabled}
                    onChange={(e) => update(i, { duration_min: Math.max(5, Number(e.target.value) || 5) })} />
                  <i>min</i>
                </div>
              </Field>
              <Btn size="s" kind="ghost" onClick={() => remove(i)} disabled={disabled} title="Remove this service">
                <Trash2 aria-hidden />
              </Btn>
            </div>
            <Field label="Description"><input className="cc-in" value={t.description} disabled={disabled}
              onChange={(e) => update(i, { description: e.target.value })} placeholder="What this covers." /></Field>
          </div>
        ))}
      </div>
      <div className="cc-row-add">
        <Btn size="s" onClick={add} disabled={disabled}><Plus aria-hidden /> Add a service</Btn>
      </div>
      <p className="cc-fine">
        A service with no name is dropped on save — an unnamed one cannot be picked, which would make
        the page unbookable.
      </p>
    </>
  );
}

function TeamBody({
  draft: d, set, hosts, hostsError, onRetryHosts, hostCandidates, onSaveHosts, hostsBusy,
  canWrite, disabled, account,
}: BodyProps) {
  const roundRobin = d.type === "round_robin";
  // Only round-robin and collective calendars read the whole roster. A personal
  // or class calendar books `hostIds[0]` and ignores the rest (public-booking's
  // `hostView`), so offering to add a teammate here would promise a booking that
  // never arrives.
  const multiHost = d.type === "round_robin" || d.type === "collective";
  const [adding, setAdding] = useState("");

  // Every edit sends the WHOLE roster in order, because position is priority.
  const order = hosts.map((h) => h.user_id);
  const move = (i: number, by: number) => {
    const next = [...order];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onSaveHosts(next);
  };

  // The roster is editable only when the reader may write AND the read
  // succeeded. Offering these controls over a list that failed to load would
  // invite someone to "fix" a roster they cannot actually see.
  // `hostsBusy` belongs here as much as the rest: every control below sends the
  // WHOLE roster built from the `hosts` it can see, so a second click landing
  // before the reload would replay a stale array — removing two people in a row
  // could restore whichever one the later request still contained.
  const editable = canWrite && !disabled && !hostsError && !hostsBusy;
  return (
    <>
      {hostsError ? (
        // A failed read is reported as a failed read. Rendering "no host" here
        // would tell someone their booking page is dead when it is running fine.
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          <strong>The host list could not be read.</strong> {hostsError} This is not a claim that the
          calendar has no host — the read did not answer, so nothing below is known either way.{" "}
          <Btn kind="ghost" size="s" onClick={onRetryHosts}><RefreshCw aria-hidden /> Try again</Btn>
        </Notice>
      ) : hosts.length === 0 ? (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          <strong>No host is registered on this calendar.</strong> A calendar with no host has no
          availability to offer, so its page cannot be booked.
        </Notice>
      ) : (
        <div className="cc-hosts">
          {hosts.map((h, i) => (
            <div key={h.user_id} className="cc-host">
              <span className="cc-host-av">{initialsOf(h.full_name)}</span>
              <span className="cc-host-n">
                <strong>{h.full_name ?? "Team member"}</strong>
                <small>
                  Priority {h.priority + 1} ·{" "}
                  {h.hasCustomHours ? `own hours${h.timezone ? ` (${h.timezone})` : ""}` : "inherits this calendar’s hours"}
                </small>
              </span>
              {editable && (
                <span className="cc-host-act">
                  {/* Named for the person, not the row: "Move up" alone tells a
                      screen-reader user nothing about WHOSE order is changing. */}
                  <Btn kind="ghost" size="s" disabled={i === 0}
                    aria-label={`Move ${h.full_name ?? "this host"} up`} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden />
                  </Btn>
                  <Btn kind="ghost" size="s" disabled={i === hosts.length - 1}
                    aria-label={`Move ${h.full_name ?? "this host"} down`} onClick={() => move(i, 1)}>
                    <ArrowDown aria-hidden />
                  </Btn>
                  {/* Disabled rather than hidden on the last host: the reason is
                      the point, and a control that vanishes teaches nothing. */}
                  <Btn kind="ghost" size="s" disabled={hosts.length <= 1}
                    title={hosts.length <= 1 ? "A calendar needs at least one host" : undefined}
                    aria-label={`Remove ${h.full_name ?? "this host"}`}
                    onClick={() => onSaveHosts(order.filter((id) => id !== h.user_id))}>
                    <Trash2 aria-hidden />
                  </Btn>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {roundRobin ? (
        <div className="cc-fields">
          <Field label="Assignment" hint={ASSIGNMENT_MODES.find((m) => m.value === d.assignment_strategy.mode)?.desc}>
            <select className="cc-sel" value={d.assignment_strategy.mode} disabled={disabled}
              onChange={(e) => set("assignment_strategy", { mode: e.target.value as typeof d.assignment_strategy.mode })}>
              {ASSIGNMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      ) : (
        <p className="cc-fine">
          {d.type === "event"
            ? "One host meets the whole group, so there is no assignment order to set."
            : d.type === "collective"
              ? "Every host on this calendar must attend, so there is no assignment order to set."
              : "A one-on-one calendar has a single host, so there is no assignment order to set."}
        </p>
      )}

      {editable && !multiHost && hosts.length > 0 && (
        // Said rather than silently omitted, for the same reason Remove is
        // disabled rather than hidden on the last host: the reason is the point.
        <p className="cc-fine">
          {d.type === "event"
            ? "A class is run by one host, so a teammate added here would never be given a booking. Make this round-robin or collective to share it."
            : "A one-on-one calendar books the host at the top of this list, so a teammate added here would never be given a booking. Make this round-robin or collective to share it."}
        </p>
      )}

      {editable && multiHost && (
        <div className="cc-fields" data-cols="2">
          <Field label="Add a host" hint="They take bookings on this calendar from the moment they are added.">
            <div className="cc-new">
              <select className="cc-sel" value={adding} disabled={hostCandidates.length === 0}
                aria-label="Teammate to add as a host"
                onChange={(e) => setAdding(e.target.value)}>
                <option value="">
                  {hostCandidates.length === 0 ? "Everyone available is already a host" : "Choose a teammate…"}
                </option>
                {hostCandidates.map((c) => (
                  <option key={c.user_id} value={c.user_id}>{c.full_name ?? "Team member"}</option>
                ))}
              </select>
              <Btn kind="act" size="s" disabled={!adding}
                onClick={() => { onSaveHosts([...order, adding]); setAdding(""); }}>
                <UserPlus aria-hidden /> Add host
              </Btn>
            </div>
          </Field>
        </div>
      )}

      <p className="cc-scope">
        <Users aria-hidden />
        <span>
          {editable
            ? "Membership and order save the moment you change them — the whole roster is rewritten in one go, so an order is never left half-applied."
            : "Only an admin on this workspace can change who takes these bookings."}{" "}
          {account && <Link to={`/solo/${account}/clients/calendar`}>Open the calendar</Link>}
        </span>
      </p>
    </>
  );
}

function HowBody({ draft: d, set, disabled }: BodyProps) {
  const has = (type: string) => d.location_options.some((o) => o.type === type);
  const toggle = (type: string, on: boolean) => {
    if (on) set("location_options", [...d.location_options, { type, value: null }]);
    else {
      const next = d.location_options.filter((o) => o.type !== type);
      set("location_options", next.length ? next : [{ type: "phone", value: null }]);
    }
  };
  const setValue = (type: string, value: string) =>
    set("location_options", d.location_options.map((o) => (o.type === type ? { ...o, value: value || null } : o)));
  return (
    <div className="cc-stack">
      {MEETING_METHODS.map((m) => {
        const on = has(m.type);
        return (
          <div key={m.type}>
            <SwitchRow title={m.label} on={on} disabled={disabled} onChange={(v) => toggle(m.type, v)}
              hint={m.type === "zoom" ? "Needs Zoom connected above to add a link automatically." : undefined} />
            {on && m.needsValue && (
              <div className="cc-sub-field">
                <input className="cc-in" placeholder={m.placeholder} disabled={disabled}
                  aria-label={`${m.label} details`}
                  value={d.location_options.find((o) => o.type === m.type)?.value ?? ""}
                  onChange={(e) => setValue(m.type, e.target.value)} />
              </div>
            )}
          </div>
        );
      })}
      {d.location_options.length > 1 && (
        <p className="cc-fine">More than one is on, so the invitee chooses when they book.</p>
      )}
    </div>
  );
}

function PageBody({ draft: d, set, disabled }: BodyProps) {
  return (
    <>
      <div className="cc-fields" data-cols="2">
        <Field label="Theme">
          <select className="cc-sel" value={d.theme} disabled={disabled} onChange={(e) => set("theme", e.target.value)}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Field>
        <Field label="Category / subtitle" hint="A short line above the title.">
          <input className="cc-in" value={d.subtitle} disabled={disabled}
            onChange={(e) => set("subtitle", e.target.value)} placeholder="New enquiries" />
        </Field>
      </div>
      <div className="cc-fields" data-cols="2">
        <Field label="Logo URL" hint="Leave empty to use your workspace logo.">
          <input className="cc-in" value={d.logo_url ?? ""} disabled={disabled}
            onChange={(e) => set("logo_url", e.target.value || null)} placeholder="https://…" />
        </Field>
        <Field label="Redirect after booking" hint="Leave empty to stay on the confirmation.">
          <input className="cc-in" value={d.redirect_url} disabled={disabled}
            onChange={(e) => set("redirect_url", e.target.value)} placeholder="https://…/thanks" />
        </Field>
      </div>
      <div className="cc-stack">
        <SwitchRow title="Show company name" on={d.show_company_name} disabled={disabled}
          onChange={(v) => set("show_company_name", v)} />
      </div>
    </>
  );
}

function IntakeBody({ draft: d, set, disabled }: BodyProps) {
  const add = () => set("intake_questions", [...d.intake_questions, { id: newQuestionId(), label: "", type: "text", required: false, options: [], placeholder: null }]);
  const update = (i: number, next: Partial<typeof d.intake_questions[number]>) =>
    set("intake_questions", d.intake_questions.map((q, x) => (x === i ? { ...q, ...next } : q)));
  const remove = (i: number) => set("intake_questions", d.intake_questions.filter((_, x) => x !== i));
  return (
    <>
      {d.intake_questions.length === 0 && (
        <Hint>
          Nothing asked yet. Answers arrive attached to each booking, so anything you ask here is one
          fewer email before the meeting.
        </Hint>
      )}
      <div className="cc-rows">
        {d.intake_questions.map((q, i) => {
          const meta = INTAKE_TYPES.find((t) => t.type === q.type);
          return (
            <div key={q.id} className="cc-row">
              <div className="cc-row-grid">
                <Field label="Question"><input className="cc-in" value={q.label} disabled={disabled}
                  onChange={(e) => update(i, { label: e.target.value })} placeholder="What would you like to cover?" /></Field>
                <Field label="Answer type">
                  <select className="cc-sel" value={q.type} disabled={disabled}
                    onChange={(e) => update(i, { type: e.target.value })}>
                    {INTAKE_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                </Field>
                <Btn size="s" kind="ghost" onClick={() => remove(i)} disabled={disabled} title="Remove this question">
                  <Trash2 aria-hidden />
                </Btn>
              </div>
              {meta?.hasOptions && (
                <Field label="Options" hint="One per line. A choice question with no options is dropped on save — it would be unanswerable.">
                  <textarea className="cc-in" value={q.options.join("\n")} disabled={disabled}
                    onChange={(e) => update(i, { options: e.target.value.split("\n") })} />
                </Field>
              )}
              <SwitchRow title="Required" on={q.required} disabled={disabled}
                onChange={(v) => update(i, { required: v })} />
            </div>
          );
        })}
      </div>
      <div className="cc-row-add">
        <Btn size="s" onClick={add} disabled={disabled}><Plus aria-hidden /> Add a question</Btn>
      </div>
    </>
  );
}

/**
 * Optional owner-authored copy for one message. Empty fields persist as
 * `undefined`, which is what tells the engine to use its built-in default — so
 * leaving these blank never changes an existing configuration.
 *
 * These fields exist in `notify_config` and always have; the first port of this
 * area rendered only the on/off switch, which left anyone who had written their
 * own SMS or host copy unable to read it, let alone change it. The switch is not
 * the setting.
 */
function CopyFields({
  subject, body, onSubject, onBody, subjectPlaceholder, bodyPlaceholder, showSubject, disabled,
}: {
  subject?: string; body?: string;
  onSubject?: (v: string | undefined) => void; onBody: (v: string | undefined) => void;
  subjectPlaceholder?: string; bodyPlaceholder: string; showSubject: boolean; disabled: boolean;
}) {
  return (
    <div className="cc-copy">
      {showSubject && onSubject && (
        <Field label="Subject">
          <input className="cc-in" value={subject ?? ""} disabled={disabled}
            placeholder={subjectPlaceholder || "Leave blank for the default"}
            onChange={(e) => onSubject(e.target.value || undefined)} />
        </Field>
      )}
      <Field label="Message">
        <textarea className="cc-in" value={body ?? ""} disabled={disabled} placeholder={bodyPlaceholder}
          onChange={(e) => onBody(e.target.value || undefined)} />
      </Field>
      <div className="cc-merge">
        <span>Insert</span>
        {MERGE_FIELDS.map((f) => (
          <button key={f.token} type="button" className="cc-chip" disabled={disabled}
            title={f.label} onClick={() => onBody(`${body ?? ""}${f.token}`)}>
            {f.token}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotifyBody({ draft: d, set, readiness, disabled, account }: BodyProps) {
  const n = d.notify_config;
  const patch = (next: Partial<typeof n>) => set("notify_config", { ...n, ...next });
  const setReminder = (i: number, next: Partial<typeof n.reminders[number]>) =>
    patch({ reminders: n.reminders.map((r, x) => (x === i ? { ...r, ...next } : r)) });
  // Scoped to the channels this calendar's own rules use: an email-only calendar
  // is not "held" because the workspace cannot text, and saying so contradicted
  // the per-reminder label sitting right beside it.
  const verdict = sendVerdict(n, readiness);

  return (
    <>
      <div className="cc-stack">
        <SwitchRow title="Email the guest a confirmation" on={n.confirm_guest} disabled={disabled}
          onChange={(v) => patch({ confirm_guest: v })} />
        <SwitchRow title="Notify the host of new bookings" on={n.confirm_host} disabled={disabled}
          onChange={(v) => patch({ confirm_host: v })} />
      </div>

      {(verdict.held || verdict.unchecked) && (
        <div className="cc-notice-wrap">
          <Notice tone={verdict.held ? "warn" : "info"} icon={verdict.held ? <TriangleAlert aria-hidden /> : <Info aria-hidden />}>
            {verdict.held ? (
              <>
                <strong>
                  These rules are saved, but the {verdict.used.size === 1 ? Array.from(verdict.used)[0] : "channels"} they
                  use cannot send yet.
                </strong>{" "}
                {verdict.reasons.length ? `This workspace has ${verdict.reasons.join(", ")}.` : null}{" "}
                Timing and wording are kept exactly as you set them — they simply stay quiet until
                Communications is finished.{" "}
                {account && <Link to={`/solo/${account}/settings/connections`}>Open Communications</Link>}
              </>
            ) : readiness.outOfScope ? (
              <>
                <strong>Send capability is not readable from here.</strong> You are looking at an
                account other than your own, and whether it can send is only readable by that
                account. The rules below are this calendar's, but no delivery is promised or ruled
                out.
              </>
            ) : (
              <>
                <strong>Send capability could not be confirmed.</strong> One of the Communications
                reads did not answer, so the labels below say what was checked rather than promising
                a delivery.
              </>
            )}
          </Notice>
        </div>
      )}

      <div className="cc-rows">
        {n.reminders.map((r, i) => {
          const cap = channelCapability(r.channel, readiness);
          return (
            <div key={`${r.channel}-${r.offset_min}-${i}`} className="cc-row">
              <div className="cc-row-grid">
                <Field label="When">
                  <select className="cc-sel" value={r.offset_min} disabled={disabled}
                    onChange={(e) => setReminder(i, { offset_min: Number(e.target.value) })}>
                    {(REMINDER_OFFSETS.some((o) => o.min === r.offset_min)
                      ? REMINDER_OFFSETS
                      : [{ min: r.offset_min, label: `${minutesLabel(r.offset_min)} before` }, ...REMINDER_OFFSETS]
                    ).map((o) => <option key={o.min} value={o.min}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="How">
                  <select className="cc-sel" value={r.channel} disabled={disabled}
                    onChange={(e) => setReminder(i, { channel: e.target.value })}>
                    {REMINDER_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </Field>
                <Btn size="s" kind="ghost" disabled={disabled} title="Remove this reminder"
                  onClick={() => patch({ reminders: n.reminders.filter((_, x) => x !== i) })}>
                  <Trash2 aria-hidden />
                </Btn>
              </div>
              <div className="cc-row-top">
                <Field label="To">
                  <select className="cc-sel" value={r.to ?? "guest"} disabled={disabled}
                    onChange={(e) => setReminder(i, { to: e.target.value })}>
                    {NOTIFY_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                <span className="cc-row-cap"><Pill tone={cap.tone}>{cap.label}</Pill></span>
              </div>
              <CopyFields
                showSubject={r.channel !== "sms"} disabled={disabled}
                subject={r.subject} body={r.body}
                onSubject={(v) => setReminder(i, { subject: v })}
                onBody={(v) => setReminder(i, { body: v })}
                subjectPlaceholder="Reminder: {{title}} · {{when}}"
                bodyPlaceholder="Write the reminder, or leave blank to use the built-in copy."
              />
            </div>
          );
        })}
      </div>
      <div className="cc-row-add">
        <Btn size="s" disabled={disabled}
          onClick={() => patch({ reminders: [...n.reminders, { channel: "email", offset_min: 1440, to: "guest" }] })}>
          <Plus aria-hidden /> Add a reminder
        </Btn>
      </div>

      <div className="cc-group">
        <SwitchRow title="Follow up after the meeting" on={n.followup_guest} disabled={disabled}
          onChange={(v) => patch({ followup_guest: v })}
          hint={n.followup_guest ? undefined : "Off — nothing is sent once the meeting ends."} />
        {n.followup_guest && (
          <>
            <div className="cc-fields" data-cols="2">
              <Field label="When">
                <select className="cc-sel" value={n.followup_offset_min} disabled={disabled}
                  onChange={(e) => patch({ followup_offset_min: Number(e.target.value) })}>
                  {FOLLOWUP_OFFSETS.map((o) => <option key={o.min} value={o.min}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <CopyFields
              showSubject disabled={disabled}
              subject={n.followup_subject} body={n.followup_body}
              onSubject={(v) => patch({ followup_subject: v })}
              onBody={(v) => patch({ followup_body: v })}
              subjectPlaceholder="Following up on {{title}}"
              bodyPlaceholder="Write the follow-up, or leave blank to use the built-in copy."
            />
          </>
        )}
      </div>

      <div className="cc-group">
        <span className="cc-group-h">On booking changes</span>
        <p className="cc-fine">
          Optional extra messages when a booking is made, moved, or cancelled — on top of the
          built-in emails.
        </p>
        {LIFECYCLE_EVENTS.map((ev) => {
          const step = n.lifecycle.find((l) => l.event === ev.value);
          const setStep = (next: typeof step | null) => {
            const others = n.lifecycle.filter((l) => l.event !== ev.value);
            patch({ lifecycle: next ? [...others, next] : others });
          };
          const cap = step ? channelCapability(step.channel, readiness) : null;
          return (
            <div key={ev.value} className="cc-row">
              <SwitchRow title={ev.label} hint={ev.hint} on={Boolean(step)} disabled={disabled}
                onChange={(v) => setStep(v ? { event: ev.value, channel: "email", to: "guest" } : null)} />
              {step && (
                <>
                  <div className="cc-row-top">
                    <Field label="How">
                      <select className="cc-sel" value={step.channel} disabled={disabled}
                        onChange={(e) => setStep({ ...step, channel: e.target.value })}>
                        {REMINDER_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </Field>
                    <Field label="To">
                      <select className="cc-sel" value={step.to} disabled={disabled}
                        onChange={(e) => setStep({ ...step, to: e.target.value })}>
                        {NOTIFY_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </Field>
                    {cap && <span className="cc-row-cap"><Pill tone={cap.tone}>{cap.label}</Pill></span>}
                  </div>
                  <CopyFields
                    showSubject={step.channel !== "sms"} disabled={disabled}
                    subject={step.subject} body={step.body}
                    onSubject={(v) => setStep({ ...step, subject: v })}
                    onBody={(v) => setStep({ ...step, body: v })}
                    subjectPlaceholder="Leave blank for a sensible default"
                    bodyPlaceholder="Write the message, or leave blank to use the built-in copy."
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export default CalendarsView;
