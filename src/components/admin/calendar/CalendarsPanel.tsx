/**
 * Calendars manager (every tier: operator / agency / sub-account).
 *
 * The owner's ask: "I don't see how someone can create a calendar" — and then:
 * "full blown customization" with the schedule/availability INSIDE the create
 * flow. So creation and editing share ONE builder (CalendarBuilderSheet) whose
 * sections — Details · Schedule & availability · Booking rules · Branding —
 * cover everything; there is no thin "create then configure elsewhere" step.
 *
 * Each calendar produces a PUBLIC web booking page at /book/:slug — a real link
 * that goes out to the world (not an internal-only page). RLS scopes what you
 * can manage: you manage the calendars you create; tenant admins/owners manage
 * every calendar in their tenant; platform staff manage operator-owned
 * (null-tenant) calendars. On create we register the creator as a calendar_host
 * so the booking engine has an availability owner.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Plus, Copy, ExternalLink, Loader2, Trash2, Pencil, Palette, Globe, Check,
  FolderPlus, Users, Folder, UserRound, Repeat, GraduationCap, UsersRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";

export interface CalendarRow {
  id: string;
  tenant_id: string | null;
  slug: string;
  type: string;
  title: string | null;
  description: string | null;
  logo_url: string | null;
  accent: string | null;
  color: string | null;
  duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  timezone: string;
  availability_json: DayWindow[] | null;
  enabled: boolean;
  group_id: string | null;
  created_by: string | null;
  theme: string;
  subtitle: string | null;
  show_company_name: boolean;
  location_type: string;
  location_value: string | null;
  location_options: LocationOption[];
  notify_config: NotifyConfig;
}

export interface LocationOption { type: string; value: string | null; }

export interface NotifyReminder { channel: string; offset_min: number; }
export interface NotifyConfig { confirm_guest: boolean; confirm_host: boolean; reminders: NotifyReminder[]; }
const DEFAULT_NOTIFY: NotifyConfig = { confirm_guest: true, confirm_host: true, reminders: [{ channel: "email", offset_min: 1440 }] };
const REMINDER_OFFSETS = [
  { min: 15, label: "15 min before" },
  { min: 60, label: "1 hour before" },
  { min: 120, label: "2 hours before" },
  { min: 1440, label: "1 day before" },
  { min: 2880, label: "2 days before" },
  { min: 10080, label: "1 week before" },
];

export interface CalendarGroup { id: string; name: string; tenant_id: string | null; }
interface PersonRow { user_id: string; full_name: string | null; avatar_url: string | null; count: number; }

type DayWindow = { day: number; start: string; end: string };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type AvailState = Record<number, { enabled: boolean; start: string; end: string }>;
const DEFAULT_AVAIL: AvailState = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { enabled: d >= 1 && d <= 5, start: "09:00", end: "17:00" }]),
);

const SELECT_COLS = "id, tenant_id, slug, type, title, description, logo_url, accent, color, duration_min, buffer_before_min, buffer_after_min, min_notice_min, timezone, availability_json, enabled, group_id, created_by, theme, subtitle, show_company_name, location_type, location_value, location_options, notify_config";

// Meeting methods the owner can offer. Enable one → fixed; enable several → the
// invitee chooses on the booking page. in_person/custom carry a value field.
const MEETING_METHODS = [
  { type: "google_meet", label: "Google Meet", needsValue: false, placeholder: "" },
  { type: "zoom", label: "Zoom", needsValue: false, placeholder: "" },
  { type: "phone", label: "Phone call", needsValue: false, placeholder: "" },
  { type: "in_person", label: "In person", needsValue: true, placeholder: "123 Main St, Suite 200" },
  { type: "custom", label: "Custom", needsValue: true, placeholder: "https://… or instructions" },
];
function normalizeLocationOptions(raw: unknown): LocationOption[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr
    .map((o) => (o && typeof o === "object" ? o : {}) as Record<string, unknown>)
    .map((o) => ({ type: String(o.type ?? ""), value: typeof o.value === "string" ? o.value : null }))
    .filter((o) => MEETING_METHODS.some((m) => m.type === o.type));
  return out.length ? out : [{ type: "google_meet", value: null }];
}

const TYPES = [
  { value: "personal", label: "One-on-one", hint: "A single host meets one guest at a time." },
  { value: "event", label: "Group / class", hint: "One session, many attendees (webinar, class)." },
  { value: "round_robin", label: "Round-robin", hint: "Rotate bookings across a team." },
  { value: "collective", label: "Collective", hint: "Several hosts must all attend." },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

// Brand-forward palette — gold + indigo lead (doctrine §6), then distinct hues
// so many calendars stay visually separable in the agenda.
const SWATCHES = [
  "#EBB94C", "#7A67E8", "#2DD4BF", "#F472B6", "#60A5FA",
  "#34D399", "#FB923C", "#A78BFA", "#F87171", "#94A3B8",
];

const COMMON_TZ = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "UTC",
];

const DURATION_PRESETS = [15, 30, 45, 60, 90];

// Coerce a possibly-partial/legacy notify_config jsonb into a safe shape.
function normalizeNotify(raw: unknown): NotifyConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reminders = Array.isArray(o.reminders)
    ? (o.reminders as unknown[])
        .map((r) => (r && typeof r === "object" ? r : {}) as Record<string, unknown>)
        .filter((r) => typeof r.offset_min === "number")
        .map((r) => ({ channel: typeof r.channel === "string" ? r.channel : "email", offset_min: r.offset_min as number }))
    : [...DEFAULT_NOTIFY.reminders];
  return {
    confirm_guest: o.confirm_guest !== false,
    confirm_host: o.confirm_host !== false,
    reminders,
  };
}
function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function randomSuffix(): string {
  // Fixed-length, collision-resistant. crypto.randomUUID is available in every
  // browser we target; Math.random is only a last-resort fallback.
  const raw = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return raw.slice(0, 8);
}
function availToJson(a: AvailState): DayWindow[] {
  return [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => a[d]?.enabled && a[d].start < a[d].end)
    .map((d) => ({ day: d, start: a[d].start, end: a[d].end }));
}
function jsonToAvail(json: DayWindow[] | null | undefined): AvailState {
  const next: AvailState = JSON.parse(JSON.stringify(DEFAULT_AVAIL));
  if (Array.isArray(json) && json.length) {
    for (const d of [0, 1, 2, 3, 4, 5, 6]) next[d].enabled = false;
    for (const w of json) {
      if (w && typeof w.day === "number") next[w.day] = { enabled: true, start: w.start, end: w.end };
    }
  }
  return next;
}

function ColorSwatches({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SWATCHES.map((c) => {
        const active = value?.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c} type="button" onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-full border flex items-center justify-center transition ${active ? "ring-2 ring-offset-2 ring-offset-background ring-foreground" : "border-black/10 hover:scale-110"}`}
            style={{ backgroundColor: c }} aria-label={`Use ${c}`}
          >
            {active && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
          </button>
        );
      })}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <input type="color" value={value || "#EBB94C"} onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 rounded p-0.5 border border-black/10 bg-transparent cursor-pointer" />
        Custom
      </label>
    </div>
  );
}

// A labelled section inside the builder — gives the sheet real hierarchy.
function BuilderSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

type BuilderState = { mode: "create"; type?: string } | { mode: "edit"; calendar: CalendarRow };

export default function CalendarsPanel() {
  const { activeTenantId, isPlatformStaff } = useTenantContext();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [groups, setGroups] = useState<CalendarGroup[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarRow | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [typeChooser, setTypeChooser] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: grp }] = await Promise.all([
      supabase.from("calendars").select(SELECT_COLS).order("created_at", { ascending: false }),
      supabase.from("calendar_groups").select("id, name, tenant_id").order("name"),
    ]);
    if (error) toast.error(error.message);
    const calRows = (data as CalendarRow[]) ?? [];
    setRows(calRows);
    setGroups((grp as CalendarGroup[]) ?? []);

    // "Who has calendars" — resolve owner names for the calendars we can see.
    const owners = Array.from(new Set(calRows.map((c) => c.created_by).filter(Boolean))) as string[];
    if (owners.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", owners);
      type Prof = { user_id: string; full_name: string | null; avatar_url: string | null };
      const nameMap = new Map(((profs as Prof[] | null) ?? []).map((p) => [p.user_id, p]));
      const counts = new Map<string, number>();
      for (const c of calRows) if (c.created_by) counts.set(c.created_by, (counts.get(c.created_by) ?? 0) + 1);
      setPeople(owners.map((uid) => ({
        user_id: uid,
        full_name: (nameMap.get(uid)?.full_name as string | null) ?? null,
        avatar_url: (nameMap.get(uid)?.avatar_url as string | null) ?? null,
        count: counts.get(uid) ?? 0,
      })).sort((a, b) => b.count - a.count));
    } else {
      setPeople([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const assignGroup = async (calId: string, groupId: string | null) => {
    const { error } = await supabase.from("calendars").update({ group_id: groupId }).eq("id", calId);
    if (error) { toast.error(error.message); return; }
    setRows((r) => r.map((x) => x.id === calId ? { ...x, group_id: groupId } : x));
  };

  const bookingUrl = (slug: string) => `${window.location.origin}/book/${slug}`;
  const copyLink = async (slug: string) => {
    try { await navigator.clipboard.writeText(bookingUrl(slug)); toast.success("Public booking link copied"); }
    catch { toast.error(bookingUrl(slug)); }
  };

  const upsertRow = (c: CalendarRow) =>
    setRows((r) => (r.some((x) => x.id === c.id) ? r.map((x) => x.id === c.id ? c : x) : [c, ...r]));

  // Section the cards by group; groups with calendars first, then Ungrouped.
  const sections = useMemo(() => {
    const byGroup = new Map<string | null, CalendarRow[]>();
    for (const c of rows) {
      const k = c.group_id ?? null;
      if (!byGroup.has(k)) byGroup.set(k, []);
      byGroup.get(k)!.push(c);
    }
    const out: { group: CalendarGroup | null; cals: CalendarRow[] }[] = [];
    for (const g of groups) { const cals = byGroup.get(g.id); if (cals?.length) out.push({ group: g, cals }); }
    const ungrouped = byGroup.get(null); if (ungrouped?.length) out.push({ group: null, cals: ungrouped });
    return out;
  }, [rows, groups]);

  const renderCard = (c: CalendarRow) => {
    const color = c.color || c.accent || "#EBB94C";
    return (
      <div key={c.id} className="rounded-lg border overflow-hidden bg-card">
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="font-medium truncate">{c.title || "Untitled calendar"}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">{TYPE_LABEL[c.type] ?? c.type}</Badge>
                <span className="text-[11px] text-muted-foreground">{c.duration_min} min</span>
                {c.tenant_id === null && <Badge variant="outline" className="text-[10px]">Operator</Badge>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className={`text-[10px] font-medium ${c.enabled ? "text-emerald-500" : "text-muted-foreground"}`}>
                {c.enabled ? "Live" : "Draft"}
              </span>
              <Switch
                checked={c.enabled}
                onCheckedChange={async (v) => {
                  const { error } = await supabase.from("calendars").update({ enabled: v }).eq("id", c.id);
                  if (error) toast.error(error.message);
                  else setRows((r) => r.map((x) => x.id === c.id ? { ...x, enabled: v } : x));
                }}
              />
            </div>
          </div>

          {/* Public web booking link — the URL that goes out to the world. */}
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
            <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground truncate flex-1">/book/{c.slug}</span>
            <button type="button" onClick={() => copyLink(c.slug)} className="p-1 hover:text-primary" title="Copy public link">
              <Copy className="h-3.5 w-3.5" />
            </button>
            <a href={bookingUrl(c.slug)} target="_blank" rel="noreferrer" className="p-1 hover:text-primary" title="Open booking page">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setBuilder({ mode: "edit", calendar: c })}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Customize
            </Button>
            {/* Quick move-to-group */}
            <Select value={c.group_id ?? "__none__"} onValueChange={(v) => assignGroup(c.id, v === "__none__" ? null : v)}>
              <SelectTrigger className="h-8 w-9 px-0 justify-center" aria-label="Move to group"><Folder className="h-3.5 w-3.5" /></SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="__none__">No group</SelectItem>
                {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(c)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-muted-foreground" />
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Calendars</h2>
              <p className="text-xs text-muted-foreground">
                Create as many as you need — one per campaign, service, or team. Each gets its own
                branding, color, schedule, and a public web booking link to send out.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setGroupOpen(true)} size="sm" variant="outline">
              <FolderPlus className="h-4 w-4 mr-1.5" /> New group
            </Button>
            <Button onClick={() => setTypeChooser(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> New calendar
            </Button>
          </div>
        </div>

        {/* Who has calendars — owner roster */}
        {people.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              <Users className="h-3.5 w-3.5" /> Who has calendars
            </div>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <div key={p.user_id} className="flex items-center gap-2 rounded-full border bg-card pl-1 pr-2.5 py-1">
                  <span className="h-6 w-6 rounded-full bg-primary/10 grid place-items-center overflow-hidden flex-shrink-0">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      : <span className="text-[10px] font-semibold text-primary">{initials(p.full_name)}</span>}
                  </span>
                  <span className="text-xs font-medium">{p.full_name || "Unnamed"}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{p.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading calendars…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Palette className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No calendars yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Build your first calendar — set its schedule and branding, then share its booking link.
            </p>
            <Button size="sm" onClick={() => setTypeChooser(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Create a calendar
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map(({ group, cals }) => (
              <div key={group?.id ?? "__ungrouped__"} className="space-y-2">
                {groups.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Folder className="h-3.5 w-3.5" /> {group ? group.name : "Ungrouped"}
                    <span className="tabular-nums text-muted-foreground/60">({cals.length})</span>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {cals.map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CalendarBuilderSheet
        state={builder}
        onOpenChange={(v) => !v && setBuilder(null)}
        tenantId={activeTenantId}
        isPlatformStaff={isPlatformStaff}
        groups={groups}
        onSaved={(c, created) => { upsertRow(c); if (created) setBuilder({ mode: "edit", calendar: c }); }}
        bookingUrl={bookingUrl}
        copyLink={copyLink}
      />

      <NewGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        tenantId={activeTenantId}
        isPlatformStaff={isPlatformStaff}
        onCreated={(g) => { setGroups((prev) => [...prev, g].sort((a, b) => a.name.localeCompare(b.name))); setGroupOpen(false); }}
      />

      <CalendarTypeChooser
        open={typeChooser}
        onOpenChange={setTypeChooser}
        onPick={(type) => { setTypeChooser(false); setBuilder({ mode: "create", type }); }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title || "this calendar"}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Its booking link will stop working. Existing bookings are kept but detached. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const t = deleteTarget!; setDeleteTarget(null);
                const { error } = await supabase.from("calendars").delete().eq("id", t.id);
                if (error) toast.error(error.message);
                else { setRows((r) => r.filter((x) => x.id !== t.id)); toast.success("Calendar deleted"); }
              }}>
              Delete calendar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function NewGroupDialog({ open, onOpenChange, tenantId, isPlatformStaff, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  isPlatformStaff: boolean;
  onCreated: (g: CalendarGroup) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setName(""); }, [open]);

  const save = async () => {
    const n = name.trim();
    if (!n) { toast.error("Name your group"); return; }
    if (!isPlatformStaff && !tenantId) { toast.error("No active workspace — pick a tenant first"); return; }
    setSaving(true);
    const slug = `${slugify(n) || "group"}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from("calendar_groups").insert({ tenant_id: tenantId, name: n, slug }).select("id, name, tenant_id").single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message ?? "Could not create the group"); return; }
    toast.success("Group created");
    onCreated(data as CalendarGroup);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New calendar group</DialogTitle>
          <DialogDescription>Organize related calendars — a team, a service line, a campaign.</DialogDescription>
        </DialogHeader>
        <div className="py-1 space-y-1.5">
          <Label>Group name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales team"
            autoFocus onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// GHL-style "Choose calendar type" step — opens on New calendar, then the builder.
const TYPE_CARDS = [
  { value: "personal", icon: UserRound, title: "Personal booking", desc: "Schedules one-on-one meetings with a specific team member.", eg: "Client meetings, private consultations." },
  { value: "round_robin", icon: Repeat, title: "Round robin", desc: "Distributes appointments among team members in a rotating order.", eg: "Sales calls, onboarding sessions." },
  { value: "event", icon: GraduationCap, title: "Class booking", desc: "One host meets with multiple participants.", eg: "Webinars, group training, online classes." },
  { value: "collective", icon: UsersRound, title: "Collective booking", desc: "Multiple hosts meet with one participant.", eg: "Panel interviews, committee reviews." },
];

function CalendarTypeChooser({ open, onOpenChange, onPick }: {
  open: boolean; onOpenChange: (v: boolean) => void; onPick: (type: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose calendar type</DialogTitle>
          <DialogDescription>Select a calendar type to set up your calendar and customize how appointments are scheduled.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3 py-1">
          {TYPE_CARDS.map((t) => (
            <button key={t.value} type="button" onClick={() => onPick(t.value)}
              className="text-left rounded-xl border p-4 hover:border-primary hover:bg-primary/[0.03] transition-colors group">
              <div className="flex items-start gap-3">
                <span className="h-9 w-9 rounded-lg bg-primary/10 text-primary grid place-items-center flex-shrink-0 group-hover:bg-primary/15">
                  <t.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{t.title}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.desc}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">E.g.: {t.eg}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Blank draft for create mode — every field the builder edits, with sane defaults.
function blankDraft(): Omit<CalendarRow, "id" | "slug" | "tenant_id" | "created_by"> {
  return {
    type: "personal",
    title: "",
    description: "",
    logo_url: null,
    accent: SWATCHES[0],
    color: SWATCHES[0],
    duration_min: 30,
    buffer_before_min: 0,
    buffer_after_min: 0,
    min_notice_min: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    availability_json: null,
    enabled: false,
    group_id: null,
    theme: "light",
    subtitle: "",
    show_company_name: true,
    location_type: "google_meet",
    location_value: "",
    location_options: [{ type: "google_meet", value: null }],
    notify_config: { ...DEFAULT_NOTIFY, reminders: [...DEFAULT_NOTIFY.reminders] },
  };
}

function CalendarBuilderSheet({
  state, onOpenChange, tenantId, isPlatformStaff, groups, onSaved, bookingUrl, copyLink,
}: {
  state: BuilderState | null;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  isPlatformStaff: boolean;
  groups: CalendarGroup[];
  onSaved: (c: CalendarRow, created: boolean) => void;
  bookingUrl: (slug: string) => string;
  copyLink: (slug: string) => void;
}) {
  const isEdit = state?.mode === "edit";
  const existing = state?.mode === "edit" ? state.calendar : null;

  // Draft holds every editable field; slug/id/tenant come from the row (edit) or
  // are minted on save (create).
  const [draft, setDraft] = useState(blankDraft());
  const [avail, setAvail] = useState<AvailState>(DEFAULT_AVAIL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit") {
      const c = state.calendar;
      setDraft({
        type: c.type, title: c.title, description: c.description, logo_url: c.logo_url,
        accent: c.accent, color: c.color, duration_min: c.duration_min,
        buffer_before_min: c.buffer_before_min, buffer_after_min: c.buffer_after_min,
        min_notice_min: c.min_notice_min, timezone: c.timezone, availability_json: c.availability_json,
        enabled: c.enabled, group_id: c.group_id,
        theme: c.theme || "light", subtitle: c.subtitle ?? "", show_company_name: c.show_company_name !== false,
        location_type: c.location_type || "google_meet", location_value: c.location_value ?? "",
        location_options: normalizeLocationOptions(c.location_options),
        notify_config: normalizeNotify(c.notify_config),
      });
      setAvail(jsonToAvail(c.availability_json));
    } else {
      setDraft({ ...blankDraft(), type: state.type ?? "personal" });
      setAvail(DEFAULT_AVAIL);
    }
  }, [state]);

  const set = <K extends keyof ReturnType<typeof blankDraft>>(k: K, v: ReturnType<typeof blankDraft>[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const save = async () => {
    const title = (draft.title ?? "").trim();
    if (!title) { toast.error("Give your calendar a name"); return; }
    const patch = {
      type: draft.type,
      title,
      description: draft.description,
      color: draft.color,
      accent: draft.accent || draft.color,
      logo_url: draft.logo_url,
      duration_min: Math.max(5, draft.duration_min || 30),
      buffer_before_min: Math.max(0, draft.buffer_before_min || 0),
      buffer_after_min: Math.max(0, draft.buffer_after_min || 0),
      min_notice_min: Math.max(0, draft.min_notice_min || 0),
      timezone: draft.timezone,
      availability_json: availToJson(avail),
      group_id: draft.group_id,
      theme: draft.theme === "dark" ? "dark" : "light",
      subtitle: (draft.subtitle ?? "").trim() || null,
      show_company_name: draft.show_company_name,
      location_options: draft.location_options.length ? draft.location_options : [{ type: "google_meet", value: null }],
      // Keep the legacy single columns in sync: 1 method → that method; several → ask_invitee.
      location_type: draft.location_options.length > 1 ? "ask_invitee" : (draft.location_options[0]?.type ?? "google_meet"),
      location_value: draft.location_options.length === 1 ? (draft.location_options[0]?.value ?? null) : null,
      notify_config: draft.notify_config,
    };

    setSaving(true);

    if (isEdit && existing) {
      const { data, error } = await supabase.from("calendars").update(patch).eq("id", existing.id).select(SELECT_COLS).single();
      setSaving(false);
      if (error || !data) { toast.error(error?.message ?? "Save failed"); return; }
      toast.success("Calendar saved");
      onSaved(data as CalendarRow, false);
      onOpenChange(false);
      return;
    }

    // Create.
    if (!isPlatformStaff && !tenantId) { setSaving(false); toast.error("No active workspace — pick a tenant first"); return; }
    const slug = `${slugify(title) || "calendar"}-${randomSuffix()}`;
    // Go live on creation — a new calendar already has working defaults + weekly
    // availability, so its public booking link should accept bookings right away
    // (toggle it back to Draft on the card to unpublish).
    const { data, error } = await supabase
      .from("calendars").insert({ tenant_id: tenantId, slug, enabled: true, ...patch }).select(SELECT_COLS).single();
    if (error || !data) { setSaving(false); toast.error(error?.message ?? "Could not create the calendar"); return; }
    // Register the creator as a host (REQUIRED — a hostless calendar is unbookable
    // and unrecoverable today; roll back rather than leave a dead one behind).
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    const hostErr = uid
      ? (await supabase.from("calendar_hosts").insert({ calendar_id: data.id, user_id: uid, priority: 0 })).error
      : new Error("no-session");
    if (hostErr) {
      await supabase.from("calendars").delete().eq("id", data.id);
      setSaving(false);
      toast.error(uid ? "Couldn't finish setting up the calendar — please try again." : "Session expired — please sign in again.");
      return;
    }
    setSaving(false);
    toast.success("Calendar created and live — its booking link is ready to share");
    onSaved(data as CalendarRow, true);
  };

  return (
    <Sheet open={state !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Customize calendar" : "New calendar"}</SheetTitle>
          <SheetDescription>
            Everything in one place — details, schedule, booking rules, and branding.
          </SheetDescription>
        </SheetHeader>

        {/* Public booking link (edit mode) — the web page that goes out. */}
        {isEdit && existing && (
          <div className="mt-4 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5">
              <Globe className="h-3.5 w-3.5" /> Public booking page
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background rounded px-2 py-1 border truncate flex-1">{bookingUrl(existing.slug)}</code>
              <Button variant="outline" size="sm" onClick={() => copyLink(existing.slug)}><Copy className="h-3.5 w-3.5 mr-1" /> Copy</Button>
              <Button variant="outline" size="sm" asChild>
                <a href={bookingUrl(existing.slug)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
              </Button>
            </div>
            {!existing.enabled && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5">
                This calendar is a Draft — flip it Live on the card for the link to accept bookings.
              </p>
            )}
          </div>
        )}

        <div className="space-y-7 py-5">
          {/* 1 — Details */}
          <BuilderSection title="Details" description="What this calendar is for.">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Discovery call" autoFocus={!isEdit} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={draft.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="font-medium">{t.label}</span>
                        <span className="text-muted-foreground ml-1.5 text-xs hidden sm:inline">— {t.hint}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Color</Label>
                <ColorSwatches value={draft.color} onChange={(c) => { set("color", c); if (!draft.accent) set("accent", c); }} />
              </div>
            </div>
            {groups.length > 0 && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><Folder className="h-3.5 w-3.5" /> Group</Label>
                <Select value={draft.group_id ?? "__none__"} onValueChange={(v) => set("group_id", v === "__none__" ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No group</SelectItem>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Welcome message</Label>
              <Textarea rows={2} value={draft.description ?? ""} placeholder="Pick a time that works for you."
                onChange={(e) => set("description", e.target.value)} />
            </div>
          </BuilderSection>

          {/* 2 — Schedule & availability */}
          <BuilderSection title="Schedule & availability" description="Your timezone and the hours this calendar is open for booking.">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={draft.timezone} onValueChange={(v) => set("timezone", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(COMMON_TZ.includes(draft.timezone) ? COMMON_TZ : [draft.timezone, ...COMMON_TZ]).map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Minimum notice (min)</Label>
                <Input type="number" min={0} value={draft.min_notice_min}
                  onChange={(e) => set("min_notice_min", Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
            <div className="space-y-1.5 rounded-lg border p-3">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-20 cursor-pointer">
                    <Switch checked={avail[d]?.enabled ?? false}
                      onCheckedChange={(v) => setAvail((a) => ({ ...a, [d]: { ...a[d], enabled: v } }))} />
                    <span className="text-sm font-medium">{DAY_NAMES[d]}</span>
                  </label>
                  {avail[d]?.enabled ? (
                    <>
                      <Input type="time" value={avail[d]?.start ?? "09:00"} className="w-28 h-8"
                        onChange={(e) => setAvail((a) => ({ ...a, [d]: { ...a[d], start: e.target.value } }))} />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input type="time" value={avail[d]?.end ?? "17:00"} className="w-28 h-8"
                        onChange={(e) => setAvail((a) => ({ ...a, [d]: { ...a[d], end: e.target.value } }))} />
                    </>
                  ) : <span className="text-sm text-muted-foreground">Unavailable</span>}
                </div>
              ))}
            </div>
          </BuilderSection>

          {/* 3 — Booking rules */}
          <BuilderSection title="Booking rules" description="Meeting length and padding between bookings.">
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {DURATION_PRESETS.map((m) => (
                  <button key={m} type="button" onClick={() => set("duration_min", m)}
                    className={`px-2.5 h-8 rounded-md border text-sm transition ${draft.duration_min === m ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                    {m}m
                  </button>
                ))}
                <Input type="number" min={5} step={5} value={draft.duration_min} className="w-20 h-8"
                  onChange={(e) => set("duration_min", Math.max(5, Number(e.target.value) || 30))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Buffer before (min)</Label>
                <Input type="number" min={0} value={draft.buffer_before_min}
                  onChange={(e) => set("buffer_before_min", Math.max(0, Number(e.target.value) || 0))} />
              </div>
              <div className="space-y-1.5">
                <Label>Buffer after (min)</Label>
                <Input type="number" min={0} value={draft.buffer_after_min}
                  onChange={(e) => set("buffer_after_min", Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>
          </BuilderSection>

          {/* 4 — Meeting location (how the meeting happens) */}
          <BuilderSection title="How to meet" description="Turn on every method you offer. Enable more than one and the invitee picks when they book.">
            <div className="space-y-2">
              {MEETING_METHODS.map((m) => {
                const opt = draft.location_options.find((o) => o.type === m.type);
                const on = !!opt;
                const toggle = (v: boolean) => {
                  const rest = draft.location_options.filter((o) => o.type !== m.type);
                  // Keep at least one method enabled.
                  const next = v ? [...rest, { type: m.type, value: null }] : (rest.length ? rest : draft.location_options);
                  if (!v && rest.length === 0) { toast.error("Offer at least one meeting method"); return; }
                  set("location_options", next);
                };
                return (
                  <div key={m.type} className="rounded-lg border p-2.5">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm font-medium">{m.label}</span>
                      <Switch checked={on} onCheckedChange={toggle} />
                    </label>
                    {on && m.needsValue && (
                      <Input className="mt-2 h-8" value={opt?.value ?? ""} placeholder={m.placeholder}
                        onChange={(e) => {
                          const val = e.target.value;
                          set("location_options", draft.location_options.map((o) => o.type === m.type ? { ...o, value: val || null } : o));
                        }} />
                    )}
                  </div>
                );
              })}
            </div>
          </BuilderSection>

          {/* 5 — Branding + booking-page look */}
          <BuilderSection title="Booking page" description="How the public page looks. Defaults to your workspace brand.">
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <div className="flex items-center gap-2">
                {(["light", "dark"] as const).map((th) => (
                  <button key={th} type="button" onClick={() => set("theme", th)}
                    className={`px-3 h-8 rounded-md border text-sm capitalize transition ${draft.theme === th ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                    {th}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Booking accent</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={draft.accent || draft.color || "#EBB94C"}
                    onChange={(e) => set("accent", e.target.value)}
                    className="h-9 w-10 rounded p-1 border bg-transparent flex-shrink-0" />
                  <Input value={draft.accent ?? ""} placeholder="defaults to color"
                    onChange={(e) => set("accent", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Logo URL</Label>
                <Input value={draft.logo_url ?? ""} placeholder="https://…/logo.png"
                  onChange={(e) => set("logo_url", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Category / subtitle</Label>
              <Input value={draft.subtitle ?? ""} placeholder="e.g. One-on-one coaching"
                onChange={(e) => set("subtitle", e.target.value)} />
            </div>
            <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Show company name</div>
                <div className="text-xs text-muted-foreground">Display your brand name next to the logo.</div>
              </div>
              <Switch checked={draft.show_company_name} onCheckedChange={(v) => set("show_company_name", v)} />
            </label>
          </BuilderSection>

          {/* 6 — Notifications */}
          <BuilderSection title="Notifications" description="Confirmations and reminders sent around each booking.">
            <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Email the guest a confirmation</div>
                <div className="text-xs text-muted-foreground">Branded confirmation + calendar invite when they book.</div>
              </div>
              <Switch checked={draft.notify_config.confirm_guest}
                onCheckedChange={(v) => set("notify_config", { ...draft.notify_config, confirm_guest: v })} />
            </label>
            <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Notify the host of new bookings</div>
                <div className="text-xs text-muted-foreground">Email the assigned host when someone books.</div>
              </div>
              <Switch checked={draft.notify_config.confirm_host}
                onCheckedChange={(v) => set("notify_config", { ...draft.notify_config, confirm_host: v })} />
            </label>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label>Reminders</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => set("notify_config", { ...draft.notify_config, reminders: [...draft.notify_config.reminders, { channel: "email", offset_min: 60 }] })}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add reminder
                </Button>
              </div>
              {draft.notify_config.reminders.length === 0 && (
                <p className="text-xs text-muted-foreground">No reminders — add one to nudge guests before the session.</p>
              )}
              {draft.notify_config.reminders.map((rem, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-14">Email</span>
                  <Select value={String(rem.offset_min)}
                    onValueChange={(v) => {
                      const next = draft.notify_config.reminders.map((r, j) => j === i ? { ...r, offset_min: Number(v) } : r);
                      set("notify_config", { ...draft.notify_config, reminders: next });
                    }}>
                    <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REMINDER_OFFSETS.map((o) => <SelectItem key={o.min} value={String(o.min)}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                    onClick={() => set("notify_config", { ...draft.notify_config, reminders: draft.notify_config.reminders.filter((_, j) => j !== i) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Delivery turns on once the platform email key is configured; settings are saved now.
              </p>
            </div>
          </BuilderSection>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Create calendar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
