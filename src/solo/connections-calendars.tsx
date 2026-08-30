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
 * What is NOT here, deliberately: whether a reminder can actually send. That
 * belongs to Communications, is read from the four seams the `comms_configured`
 * check uses, and is only ever *reported* here. A calendar may not claim a
 * capability it does not own (§13).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlarmClock, CalendarCheck, CalendarDays, CalendarX2, ChevronRight, Copy, ExternalLink,
  Info, Link2, Loader2, MessageSquare, Palette, Plus, RefreshCw, Trash2, TriangleAlert,
  Users, Video, Clock, ListChecks, MapPin, Undo2,
} from "lucide-react";
import {
  type AvailState, type CalendarDraft, type CalendarRow,
  ASSIGNMENT_MODES, BOOKING_HORIZON_PRESETS, COMMON_TZ, DAY_NAMES, DURATION_PRESETS,
  INTAKE_TYPES, LIFECYCLE_EVENTS, MEETING_METHODS, NOTIFY_TARGETS, REMINDER_CHANNELS,
  REMINDER_OFFSETS, FOLLOWUP_OFFSETS, SWATCHES, TYPES, TYPE_LABEL,
  availToJson, bookingUrl, buildCalendarPatch, draftFromRow, jsonToAvail, newId, newQuestionId,
  slugify,
} from "@/lib/calendar/config";
import { useCalendarConnections, type CalendarHost, type Capability, type SendReadiness } from "./data/useCalendarConnections";
import "./connections-calendars.css";

/* ------------------------------------------------------------- primitives */

function Pill({ tone, children }: { tone?: "live" | "warn" | "bad" | "info"; children: ReactNode }) {
  return <span className="cc-pill" data-tone={tone}>{tone && <i />}{children}</span>;
}

function Btn({
  children, onClick, kind, size, disabled, title, type,
}: {
  children: ReactNode; onClick?: () => void; kind?: "ghost" | "act" | "danger";
  size?: "s"; disabled?: boolean; title?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type ?? "button"} className="cc-btn" data-kind={kind} data-size={size}
      onClick={onClick} disabled={disabled} title={title}>
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
function channelCapability(channel: string, readiness: SendReadiness): { cap: Capability; label: string; tone?: "live" | "warn" | "bad" } {
  const parts: Capability[] = [];
  if (channel === "email" || channel === "both") parts.push(readiness.email);
  if (channel === "sms" || channel === "both") parts.push(readiness.sms);
  if (parts.includes("no")) return { cap: "no", label: "Will not send", tone: "bad" };
  if (parts.includes("unknown")) return { cap: "unknown", label: "Not checked", tone: "warn" };
  return { cap: "yes", label: "Will send", tone: "live" };
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

/* ------------------------------------------------------------ the surface */

export function CalendarsView() {
  const conn = useCalendarConnections();
  const params = useParams();
  const account = params.account ?? "";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CalendarDraft | null>(null);
  const [avail, setAvail] = useState<AvailState>(() => jsonToAvail(null));
  const [slugInput, setSlugInput] = useState("");
  const [open, setOpen] = useState<Partial<Record<AreaKey, boolean>>>({ details: true });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "warn" | "bad" | "info"; text: string } | null>(null);
  const areaRefs = useRef<Partial<Record<AreaKey, HTMLDivElement | null>>>({});

  const selected = useMemo(
    () => conn.calendars.find((c) => c.id === selectedId) ?? conn.calendars[0] ?? null,
    [conn.calendars, selectedId],
  );

  // Hydrate the editable draft whenever the selected row changes identity or is
  // replaced by a save. Keyed on id + updated_at so a save lands, but typing
  // never gets clobbered by an unrelated re-render.
  const hydratedFrom = useRef<string>("");
  useEffect(() => {
    if (!selected) { hydratedFrom.current = ""; setDraft(null); return; }
    const stamp = `${selected.id}:${(selected as CalendarRow & { updated_at?: string }).updated_at ?? ""}`;
    if (hydratedFrom.current === stamp) return;
    hydratedFrom.current = stamp;
    setDraft(draftFromRow(selected));
    setAvail(jsonToAvail(selected.availability_json));
    setSlugInput(selected.slug);
  }, [selected]);

  const patch = useMemo(() => (draft ? buildCalendarPatch(draft, avail) : null), [draft, avail]);
  const savedPatch = useMemo(
    () => (selected ? buildCalendarPatch(draftFromRow(selected), jsonToAvail(selected.availability_json)) : null),
    [selected],
  );
  const slugChanged = Boolean(selected && slugify(slugInput) && slugify(slugInput) !== selected.slug);
  const dirty = Boolean(patch && savedPatch && (JSON.stringify(patch) !== JSON.stringify(savedPatch) || slugChanged));

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
    if (!title) { setNotice({ tone: "warn", text: "Give this calendar a name before saving." }); return; }
    setSaving(true);
    const desired = slugify(slugInput);
    const body = desired && desired !== selected.slug ? { ...patch, slug: desired } : patch;
    const result = await conn.saveCalendar(selected.id, body as Record<string, unknown>);
    setSaving(false);
    setNotice(result.ok ? { tone: "info", text: "Saved. The public page now uses these settings." } : { tone: "bad", text: result.message });
  }, [selected, patch, slugInput, conn]);

  const jumpTo = useCallback((key: AreaKey) => {
    setOpen((o) => ({ ...o, [key]: true }));
    requestAnimationFrame(() => areaRefs.current[key]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, []);

  const copyLink = useCallback(async (slug: string) => {
    try {
      await navigator.clipboard.writeText(bookingUrl(slug));
      setNotice({ tone: "info", text: "Booking link copied." });
    } catch {
      setNotice({ tone: "warn", text: "Your browser blocked the copy — select the link and copy it manually." });
    }
  }, []);

  const ro = !conn.canWrite || saving;

  return (
    <div className="cc">
      <ConnectedAccounts conn={conn} />

      <section className="cc" style={{ gap: 12 }}>
        <div className="cc-head">
          <div className="cc-head-t">
            <span className="cc-eyebrow">Booking presets</span>
            <h2>What people can book</h2>
            <p>
              Each preset is one bookable thing with its own public page — its length, its hours,
              who hosts it, and what happens after. Changes here take effect on the live link.
            </p>
          </div>
        </div>

        {conn.loading ? <LoadingBody /> : conn.error ? (
          <Notice tone="bad" icon={<TriangleAlert aria-hidden />}>
            <strong>Couldn’t load your calendars.</strong> {conn.error}{" "}
            <Btn kind="ghost" size="s" onClick={conn.refresh}><RefreshCw aria-hidden /> Retry</Btn>
          </Notice>
        ) : conn.empty ? (
          <EmptyBody />
        ) : (
          <div className="cc-work">
            <nav className="cc-list" aria-label="Booking presets">
              <div className="cc-list-head">
                <span>{conn.calendars.length} {conn.calendars.length === 1 ? "preset" : "presets"}</span>
                <Pill>{conn.calendars.filter((c) => c.enabled).length} live</Pill>
              </div>
              {conn.calendars.map((c) => (
                <button key={c.id} type="button" className="cc-item"
                  aria-current={selected?.id === c.id}
                  onClick={() => { setSelectedId(c.id); setNotice(null); }}>
                  <span className="cc-item-t">
                    <span className="cc-swatch" style={{ background: c.color ?? "var(--pg-violet)" }} />
                    <span className="cc-item-n">{c.title || "Untitled calendar"}</span>
                    {!c.enabled && <Pill>Draft</Pill>}
                  </span>
                  <span className="cc-item-m">
                    <span>{TYPE_LABEL[c.type] ?? c.type}</span>
                    <em>{c.duration_min} min</em>
                  </span>
                </button>
              ))}
            </nav>

            {draft && selected && (
              <div className="cc-detail">
                <Identity
                  row={selected} draft={draft} readiness={conn.readiness}
                  busy={conn.busy === selected.id} disabled={ro}
                  onCopy={() => copyLink(selected.slug)}
                  onToggleLive={async (v) => {
                    const r = await conn.setEnabled(selected.id, v);
                    if (!r.ok) setNotice({ tone: "bad", text: r.message });
                  }}
                />

                <div className="cc-ribbon" role="list" aria-label="Configuration areas">
                  {AREA_META.map((a) => (
                    <button key={a.key} type="button" role="listitem" className="cc-rib"
                      data-open={Boolean(open[a.key])} onClick={() => jumpTo(a.key)}>
                      <b>{a.title}</b>
                      <span>{summaryFor(a.key, draft, avail, conn.hosts[selected.id] ?? [])}</span>
                    </button>
                  ))}
                </div>

                {notice && (
                  <Notice tone={notice.tone} icon={notice.tone === "bad" ? <TriangleAlert aria-hidden /> : <Info aria-hidden />}>
                    {notice.text}
                  </Notice>
                )}

                {!conn.canWrite && (
                  <Notice tone="info" icon={<Info aria-hidden />}>
                    You can read this configuration but not change it. Every control below is disabled
                    rather than hidden, so you can still see exactly how the calendar is set up.
                  </Notice>
                )}

                {AREA_META.map((a) => (
                  <Area key={a.key} meta={a} open={Boolean(open[a.key])}
                    value={summaryFor(a.key, draft, avail, conn.hosts[selected.id] ?? [])}
                    onToggle={() => setOpen((o) => ({ ...o, [a.key]: !o[a.key] }))}
                    innerRef={(el) => { areaRefs.current[a.key] = el; }}>
                    <AreaBody
                      area={a.key} draft={draft} set={set} avail={avail} setAvail={setAvail}
                      slugInput={slugInput} setSlugInput={setSlugInput}
                      hosts={conn.hosts[selected.id] ?? []} readiness={conn.readiness}
                      disabled={ro} account={account}
                    />
                  </Area>
                ))}

                {dirty && (
                  <div className="cc-bar" role="status">
                    <span>Unsaved changes on <b>{draft.title || "this calendar"}</b>.</span>
                    <Btn kind="ghost" size="s" onClick={revert} disabled={saving}><Undo2 aria-hidden /> Discard</Btn>
                    <Btn kind="act" onClick={save} disabled={saving || !conn.canWrite}>
                      {saving ? <Loader2 className="cc-spin" aria-hidden /> : <CalendarCheck aria-hidden />} Save changes
                    </Btn>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- sub-views */

function LoadingBody() {
  return (
    <div className="cc-work" aria-busy="true">
      <div className="cc-list">{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 52 }} />)}</div>
      <div className="cc-detail">
        <div className="cc-skel" style={{ height: 108 }} />
        <div className="cc-skel" style={{ height: 44 }} />
        {[0, 1, 2, 3].map((i) => <div key={i} className="cc-skel" style={{ height: 58 }} />)}
      </div>
    </div>
  );
}

function EmptyBody() {
  return (
    <div className="cc-empty">
      <CalendarDays aria-hidden />
      <strong>No booking presets yet</strong>
      <p>
        A preset is one bookable thing — how long it runs, when you are open, who hosts it, and what
        happens after. Creating one gives you a public link straight away. Connecting a calendar
        account above is separate; you can do either first.
      </p>
    </div>
  );
}

function ConnectedAccounts({ conn }: { conn: ReturnType<typeof useCalendarConnections> }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = conn.providers;

  const start = async (provider: "google" | "zoom") => {
    setPending(provider); setError(null);
    const r = await conn.connect(provider);
    setPending(null);
    if (!r.ok) { setError(r.message); return; }
    window.location.href = r.url;
  };
  const drop = async (provider: "google" | "zoom") => {
    setPending(provider); setError(null);
    const r = await conn.disconnect(provider);
    setPending(null);
    if (!r.ok) setError(r.message);
  };

  const googleAge = syncAge(p.google_last_sync_at);

  return (
    <section className="cc" style={{ gap: 12 }}>
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
              : <Btn size="s" onClick={() => start("google")} disabled={pending !== null}>
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
              : p.zoom_connected ? <Pill tone="live">Connected</Pill> : <Pill>Not connected</Pill>}
          </div>
          {p.zoom_connected && <span className="cc-acct-detail">{p.zoom_email ?? "Connected account"}</span>}
          <div className="cc-acct-row">
            {p.zoom_connected
              ? <Btn size="s" kind="danger" onClick={() => drop("zoom")} disabled={pending !== null}>
                  {pending === "zoom" ? <Loader2 className="cc-spin" aria-hidden /> : <Trash2 aria-hidden />} Disconnect
                </Btn>
              : <Btn size="s" onClick={() => start("zoom")} disabled={pending !== null}>
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

function Identity({
  row, draft, readiness, busy, disabled, onCopy, onToggleLive,
}: {
  row: CalendarRow; draft: CalendarDraft; readiness: SendReadiness; busy: boolean; disabled: boolean;
  onCopy: () => void; onToggleLive: (v: boolean) => void;
}) {
  const sendBlocked = readiness.email === "no" || readiness.sms === "no";
  return (
    <div className="cc-identity">
      <div className="cc-identity-top">
        <div style={{ minWidth: 0 }}>
          <h3>{draft.title || "Untitled calendar"}</h3>
          <p className="cc-identity-sub">{TYPE_LABEL[draft.type] ?? draft.type} · {draft.duration_min} minutes · {draft.timezone}</p>
        </div>
        <div className="cc-identity-pills">
          {sendBlocked && <Pill tone="warn">Reminders held</Pill>}
          {row.enabled ? <Pill tone="live">Live</Pill> : <Pill>Draft</Pill>}
          <Toggle on={row.enabled} onChange={onToggleLive} disabled={disabled || busy}
            label={row.enabled ? "Take this calendar off the air" : "Put this calendar live"} />
        </div>
      </div>
      <div className="cc-link">
        <code>{bookingUrl(row.slug)}</code>
        <Btn size="s" onClick={onCopy}><Copy aria-hidden /> Copy</Btn>
        <a className="cc-btn" data-size="s" href={bookingUrl(row.slug)} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden /> Open
        </a>
      </div>
      {!row.enabled && (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          This calendar is a <strong>Draft</strong>, so the link above will not accept bookings. Put it
          live with the switch when you are ready.
        </Notice>
      )}
    </div>
  );
}

function Area({
  meta, open, value, onToggle, children, innerRef,
}: {
  meta: { key: AreaKey; n: string; title: string; desc: string };
  open: boolean; value: string; onToggle: () => void; children: ReactNode;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div className="cc-area" data-open={open} ref={innerRef}>
      <button type="button" className="cc-area-t" aria-expanded={open} onClick={onToggle}>
        <span className="cc-area-n">{meta.n}</span>
        <span className="cc-area-h"><strong>{meta.title}</strong><span>{meta.desc}</span></span>
        {!open && <span className="cc-area-v">{value}</span>}
        <span className="cc-area-c"><ChevronRight aria-hidden /></span>
      </button>
      {open && <div className="cc-area-b">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------- the collapsed answer */

function summaryFor(key: AreaKey, d: CalendarDraft, avail: AvailState, hosts: CalendarHost[]): string {
  switch (key) {
    case "details": return `${TYPE_LABEL[d.type] ?? d.type}`;
    case "schedule": {
      const days = availToJson(avail).length;
      return `${days} ${days === 1 ? "day" : "days"} · ${minutesLabel(d.min_notice_min)} notice`;
    }
    case "dates": return d.date_overrides.length ? `${d.date_overrides.length} set` : "none";
    case "rules": return `${d.duration_min} min · ${d.buffer_before_min}/${d.buffer_after_min} buffer`;
    case "menu": return d.appointment_types.length ? `${d.appointment_types.length} services` : "single meeting";
    case "team": {
      const n = hosts.length;
      const strategy = d.type === "round_robin" ? ` · ${d.assignment_strategy.mode}` : "";
      return `${n || "no"} ${n === 1 ? "host" : "hosts"}${strategy}`;
    }
    case "how": {
      const n = d.location_options.length;
      if (n === 1) return MEETING_METHODS.find((m) => m.type === d.location_options[0].type)?.label ?? d.location_options[0].type;
      return `${n} methods`;
    }
    case "page": return d.theme === "dark" ? "dark theme" : "light theme";
    case "intake": return d.intake_questions.length ? `${d.intake_questions.length} questions` : "none";
    case "notify": {
      const r = d.notify_config.reminders.length;
      return `${r} ${r === 1 ? "reminder" : "reminders"}${d.notify_config.followup_guest ? " · follow-up" : ""}`;
    }
    default: return "";
  }
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
          <div className="cc-presets" style={{ marginTop: 6 }}>
            {[0, 60, 240, 1440, 2880].map((m) => (
              <button key={m} type="button" className="cc-preset" disabled={disabled}
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

function DatesBody({ draft: d, set, disabled }: BodyProps) {
  const add = () => set("date_overrides", [...d.date_overrides, { date: "", blocked: true, windows: [] }]);
  const update = (i: number, next: Partial<typeof d.date_overrides[number]>) =>
    set("date_overrides", d.date_overrides.map((o, x) => (x === i ? { ...o, ...next } : o)));
  const remove = (i: number) => set("date_overrides", d.date_overrides.filter((_, x) => x !== i));
  return (
    <>
      {d.date_overrides.length === 0 && (
        <p style={{ marginTop: 13, color: "var(--pg-muted)", fontSize: 12, lineHeight: 1.6 }}>
          Nothing set. A holiday, a day off, or a one-off late start goes here rather than in the
          weekly pattern — it overrides that day only.
        </p>
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
              <div className="cc-day-times">
                <input className="cc-in" type="time" aria-label="Opens" disabled={disabled}
                  value={o.windows[0]?.start ?? "09:00"}
                  onChange={(e) => update(i, { windows: [{ start: e.target.value, end: o.windows[0]?.end ?? "17:00" }] })} />
                <em>to</em>
                <input className="cc-in" type="time" aria-label="Closes" disabled={disabled}
                  value={o.windows[0]?.end ?? "17:00"}
                  onChange={(e) => update(i, { windows: [{ start: o.windows[0]?.start ?? "09:00", end: e.target.value }] })} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
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
          <div className="cc-presets" style={{ marginTop: 6 }}>
            {DURATION_PRESETS.map((m) => (
              <button key={m} type="button" className="cc-preset" disabled={disabled}
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
          <div className="cc-presets">
            {[0, 5, 10, 15, 30].map((m) => (
              <button key={m} type="button" className="cc-preset" disabled={disabled}
                aria-pressed={d.buffer_before_min === m} onClick={() => set("buffer_before_min", m)}>
                {m === 0 ? "none" : `${m}m`}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Buffer after" hint="Quiet time held after each booking.">
          <div className="cc-presets">
            {[0, 5, 10, 15, 30].map((m) => (
              <button key={m} type="button" className="cc-preset" disabled={disabled}
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
        <p style={{ marginTop: 13, color: "var(--pg-muted)", fontSize: 12, lineHeight: 1.6 }}>
          Empty — guests book a single meeting at the duration above. Add two or more and they pick a
          service first, each with its own length.
        </p>
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
      <div style={{ marginTop: 10 }}>
        <Btn size="s" onClick={add} disabled={disabled}><Plus aria-hidden /> Add a service</Btn>
      </div>
      <p style={{ marginTop: 10, color: "var(--pg-faint)", fontSize: 11, lineHeight: 1.55 }}>
        A service with no name is dropped on save — an unnamed one cannot be picked, which would make
        the page unbookable.
      </p>
    </>
  );
}

function TeamBody({ draft: d, set, hosts, disabled, account }: BodyProps) {
  const roundRobin = d.type === "round_robin";
  return (
    <>
      {hosts.length === 0 ? (
        <Notice tone="warn" icon={<TriangleAlert aria-hidden />}>
          <strong>No host is registered on this calendar.</strong> A calendar with no host has no
          availability to offer, so its page cannot be booked.
        </Notice>
      ) : (
        <div style={{ marginTop: 6 }}>
          {hosts.map((h) => (
            <div key={h.user_id} className="cc-host">
              <span className="cc-host-av">{initialsOf(h.full_name)}</span>
              <span className="cc-host-n">
                <strong>{h.full_name ?? "Team member"}</strong>
                <small>
                  Priority {h.priority + 1} ·{" "}
                  {h.hasCustomHours ? `own hours${h.timezone ? ` (${h.timezone})` : ""}` : "inherits this calendar’s hours"}
                </small>
              </span>
            </div>
          ))}
        </div>
      )}

      {roundRobin ? (
        <div className="cc-fields" style={{ marginTop: 14 }}>
          <Field label="Assignment" hint={ASSIGNMENT_MODES.find((m) => m.value === d.assignment_strategy.mode)?.desc}>
            <select className="cc-sel" value={d.assignment_strategy.mode} disabled={disabled}
              onChange={(e) => set("assignment_strategy", { mode: e.target.value as typeof d.assignment_strategy.mode })}>
              {ASSIGNMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
        </div>
      ) : (
        <p style={{ marginTop: 12, color: "var(--pg-faint)", fontSize: 11.5, lineHeight: 1.55 }}>
          {d.type === "event"
            ? "One host meets the whole group, so there is no assignment order to set."
            : d.type === "collective"
              ? "Every host on this calendar must attend, so there is no assignment order to set."
              : "A one-on-one calendar has a single host, so there is no assignment order to set."}
        </p>
      )}

      <p className="cc-scope" style={{ marginTop: 12 }}>
        <Users aria-hidden />
        <span>
          Adding, removing and reordering hosts is done from the calendar itself, where the whole
          roster is rewritten in one go so an order is never left half-applied.{" "}
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
    <div style={{ marginTop: 6 }}>
      {MEETING_METHODS.map((m) => {
        const on = has(m.type);
        return (
          <div key={m.type}>
            <SwitchRow title={m.label} on={on} disabled={disabled} onChange={(v) => toggle(m.type, v)}
              hint={m.type === "zoom" ? "Needs Zoom connected above to add a link automatically." : undefined} />
            {on && m.needsValue && (
              <div style={{ padding: "0 0 10px 0" }}>
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
        <p style={{ marginTop: 10, color: "var(--pg-faint)", fontSize: 11.5 }}>
          More than one is on, so the invitee chooses when they book.
        </p>
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
      <div style={{ marginTop: 4 }}>
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
        <p style={{ marginTop: 13, color: "var(--pg-muted)", fontSize: 12, lineHeight: 1.6 }}>
          Nothing asked yet. Answers arrive attached to each booking, so anything you ask here is one
          fewer email before the meeting.
        </p>
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
      <div style={{ marginTop: 10 }}>
        <Btn size="s" onClick={add} disabled={disabled}><Plus aria-hidden /> Add a question</Btn>
      </div>
    </>
  );
}

function NotifyBody({ draft: d, set, readiness, disabled, account }: BodyProps) {
  const n = d.notify_config;
  const patch = (next: Partial<typeof n>) => set("notify_config", { ...n, ...next });
  const setReminder = (i: number, next: Partial<typeof n.reminders[number]>) =>
    patch({ reminders: n.reminders.map((r, x) => (x === i ? { ...r, ...next } : r)) });
  const held = readiness.email === "no" || readiness.sms === "no";
  const unchecked = readiness.partial;

  return (
    <>
      <div style={{ marginTop: 6 }}>
        <SwitchRow title="Email the guest a confirmation" on={n.confirm_guest} disabled={disabled}
          onChange={(v) => patch({ confirm_guest: v })} />
        <SwitchRow title="Notify the host of new bookings" on={n.confirm_host} disabled={disabled}
          onChange={(v) => patch({ confirm_host: v })} />
      </div>

      {(held || unchecked) && (
        <div style={{ marginTop: 12 }}>
          <Notice tone={held ? "warn" : "info"} icon={held ? <TriangleAlert aria-hidden /> : <Info aria-hidden />}>
            {held ? (
              <>
                <strong>These rules are saved, but they will not send.</strong>{" "}
                {readiness.missing.length ? `This workspace has ${readiness.missing.join(", ")}.` : null}{" "}
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
                <span style={{ marginLeft: "auto" }}><Pill tone={cap.tone}>{cap.label}</Pill></span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn size="s" disabled={disabled}
          onClick={() => patch({ reminders: [...n.reminders, { channel: "email", offset_min: 1440, to: "guest" }] })}>
          <Plus aria-hidden /> Add a reminder
        </Btn>
      </div>

      <div style={{ marginTop: 16 }}>
        <SwitchRow title="Follow up after the meeting" on={n.followup_guest} disabled={disabled}
          onChange={(v) => patch({ followup_guest: v })}
          hint={n.followup_guest ? undefined : "Off — nothing is sent once the meeting ends."} />
        {n.followup_guest && (
          <div className="cc-fields" data-cols="2">
            <Field label="When">
              <select className="cc-sel" value={n.followup_offset_min} disabled={disabled}
                onChange={(e) => patch({ followup_offset_min: Number(e.target.value) })}>
                {FOLLOWUP_OFFSETS.map((o) => <option key={o.min} value={o.min}>{o.label}</option>)}
              </select>
            </Field>
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <span className="cc-eyebrow" style={{ color: "var(--pg-faint)" }}>On booking changes</span>
        <div style={{ marginTop: 6 }}>
          {LIFECYCLE_EVENTS.map((ev) => {
            const on = n.lifecycle.some((l) => l.event === ev.value);
            return (
              <SwitchRow key={ev.value} title={ev.label} hint={ev.hint} on={on} disabled={disabled}
                onChange={(v) => patch({
                  lifecycle: v
                    ? [...n.lifecycle, { event: ev.value, channel: "email", to: "guest" }]
                    : n.lifecycle.filter((l) => l.event !== ev.value),
                })} />
            );
          })}
        </div>
      </div>
    </>
  );
}

export default CalendarsView;
