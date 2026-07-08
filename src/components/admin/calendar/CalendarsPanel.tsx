/**
 * Calendars manager (every tier: operator / agency / sub-account).
 *
 * The owner's ask: "I don't see how someone can create a calendar." This is the
 * create/list/customize surface on top of the first-class `calendars` entity —
 * many independently-branded, color-coded calendars per login (one per campaign,
 * service, or team), each with its own public booking link. RLS scopes what you
 * can manage: you manage the calendars you create; tenant admins/owners manage
 * every calendar in their tenant; platform staff manage operator-owned
 * (null-tenant) calendars. On create we also register the creator as a
 * calendar_host so the booking engine has an availability owner.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Plus, Copy, ExternalLink, Loader2, Trash2, Pencil, Palette,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
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
}

type DayWindow = { day: number; start: string; end: string };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type AvailState = Record<number, { enabled: boolean; start: string; end: string }>;
const DEFAULT_AVAIL: AvailState = Object.fromEntries(
  [0, 1, 2, 3, 4, 5, 6].map((d) => [d, { enabled: d >= 1 && d <= 5, start: "09:00", end: "17:00" }]),
);

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
      {SWATCHES.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border transition ${value?.toLowerCase() === c.toLowerCase() ? "ring-2 ring-offset-2 ring-offset-background ring-foreground" : "border-black/10"}`}
          style={{ backgroundColor: c }} aria-label={`Use ${c}`}
        />
      ))}
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
        <input type="color" value={value || "#EBB94C"} onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 rounded p-0.5 border border-black/10 bg-transparent cursor-pointer" />
        Custom
      </label>
    </div>
  );
}

export default function CalendarsPanel() {
  const { activeTenantId, isPlatformStaff } = useTenantContext();
  const [rows, setRows] = useState<CalendarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CalendarRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("calendars")
      .select("id, tenant_id, slug, type, title, description, logo_url, accent, color, duration_min, buffer_before_min, buffer_after_min, min_notice_min, timezone, availability_json, enabled")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as CalendarRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const bookingUrl = (slug: string) => `${window.location.origin}/book/${slug}`;
  const copyLink = async (slug: string) => {
    try { await navigator.clipboard.writeText(bookingUrl(slug)); toast.success("Booking link copied"); }
    catch { toast.error(bookingUrl(slug)); }
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
                branding, color, and public booking link.
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New calendar
          </Button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading calendars…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Palette className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">No calendars yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Spin up your first calendar — a booking page your contacts can use in minutes.
            </p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Create a calendar
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((c) => {
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
                            else { setRows((r) => r.map((x) => x.id === c.id ? { ...x, enabled: v } : x)); }
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
                      <span className="text-[11px] text-muted-foreground truncate flex-1">/book/{c.slug}</span>
                      <button type="button" onClick={() => copyLink(c.slug)} className="p-1 hover:text-primary" title="Copy link">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <a href={bookingUrl(c.slug)} target="_blank" rel="noreferrer" className="p-1 hover:text-primary" title="Preview">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(c)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Customize
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CreateCalendarDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={activeTenantId}
        isPlatformStaff={isPlatformStaff}
        onCreated={(c) => { setRows((r) => [c, ...r]); setEditing(c); }}
      />

      <EditCalendarSheet
        calendar={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={(c) => setRows((r) => r.map((x) => x.id === c.id ? c : x))}
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

function CreateCalendarDialog({
  open, onOpenChange, tenantId, isPlatformStaff, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  isPlatformStaff: boolean;
  onCreated: (c: CalendarRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState("personal");
  const [color, setColor] = useState(SWATCHES[0]);
  const [duration, setDuration] = useState(30);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(""); setType("personal"); setColor(SWATCHES[0]); setDuration(30);
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
    }
  }, [open]);

  const create = async () => {
    const t = title.trim();
    if (!t) { toast.error("Give your calendar a name"); return; }
    // A platform-staff operator with no active tenant creates an operator-owned
    // (null-tenant) calendar; everyone else creates inside their active tenant.
    if (!isPlatformStaff && !tenantId) { toast.error("No active workspace — pick a tenant first"); return; }
    setSaving(true);
    const slug = `${slugify(t) || "calendar"}-${randomSuffix()}`;
    const { data, error } = await supabase
      .from("calendars")
      .insert({
        tenant_id: tenantId, // null for operator-owned
        slug,
        type,
        title: t,
        color,
        accent: color,
        duration_min: duration,
        timezone,
        availability_json: availToJson(DEFAULT_AVAIL),
        enabled: false,
      })
      .select("id, tenant_id, slug, type, title, description, logo_url, accent, color, duration_min, buffer_before_min, buffer_after_min, min_notice_min, timezone, availability_json, enabled")
      .single();
    if (error || !data) {
      setSaving(false);
      toast.error(error?.message ?? "Could not create the calendar");
      return;
    }
    // Register the creator as a host so the booking engine has an availability
    // owner. This is REQUIRED, not best-effort: a calendar with no host is
    // unbookable and (until a host-management UI exists) unrecoverable — so if
    // it fails we roll back the calendar rather than leave a dead one behind.
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
    onOpenChange(false);
    toast.success("Calendar created — customize it, then flip it Live");
    onCreated(data as CalendarRow);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New calendar</DialogTitle>
          <DialogDescription>Name it and pick a type — you can brand and fine-tune it next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Discovery call"
              onKeyDown={(e) => { if (e.key === "Enter") create(); }} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs">— {t.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input type="number" min={5} step={5} value={duration}
                onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 30))} />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(COMMON_TZ.includes(timezone) ? COMMON_TZ : [timezone, ...COMMON_TZ]).map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Color</Label>
            <ColorSwatches value={color} onChange={setColor} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={create} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Create calendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCalendarSheet({
  calendar, onOpenChange, onSaved,
}: {
  calendar: CalendarRow | null;
  onOpenChange: (v: boolean) => void;
  onSaved: (c: CalendarRow) => void;
}) {
  const [draft, setDraft] = useState<CalendarRow | null>(calendar);
  const [avail, setAvail] = useState<AvailState>(DEFAULT_AVAIL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(calendar);
    setAvail(jsonToAvail(calendar?.availability_json));
  }, [calendar]);

  const set = <K extends keyof CalendarRow>(k: K, v: CalendarRow[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const patch = {
      title: draft.title,
      description: draft.description,
      type: draft.type,
      color: draft.color,
      accent: draft.accent,
      logo_url: draft.logo_url,
      duration_min: Math.max(5, draft.duration_min || 30),
      buffer_before_min: Math.max(0, draft.buffer_before_min || 0),
      buffer_after_min: Math.max(0, draft.buffer_after_min || 0),
      min_notice_min: Math.max(0, draft.min_notice_min || 0),
      timezone: draft.timezone,
      availability_json: availToJson(avail),
    };
    const { data, error } = await supabase
      .from("calendars").update(patch).eq("id", draft.id)
      .select("id, tenant_id, slug, type, title, description, logo_url, accent, color, duration_min, buffer_before_min, buffer_after_min, min_notice_min, timezone, availability_json, enabled")
      .single();
    setSaving(false);
    if (error || !data) { toast.error(error?.message ?? "Save failed"); return; }
    toast.success("Calendar saved");
    onSaved(data as CalendarRow);
    onOpenChange(false);
  };

  if (!draft) return null;

  return (
    <Sheet open={calendar !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customize calendar</SheetTitle>
          <SheetDescription>Branding, color, hours, and booking rules — all per calendar.</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={draft.title ?? ""} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Welcome message</Label>
            <Textarea rows={2} value={draft.description ?? ""} placeholder="Pick a time that works for you."
              onChange={(e) => set("description", e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Calendar color</Label>
            <ColorSwatches value={draft.color} onChange={(c) => { set("color", c); if (!draft.accent) set("accent", c); }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Duration</Label>
              <Input type="number" min={5} step={5} value={draft.duration_min}
                onChange={(e) => set("duration_min", Math.max(5, Number(e.target.value) || 30))} />
            </div>
            <div className="space-y-1.5">
              <Label>Buffer before</Label>
              <Input type="number" min={0} value={draft.buffer_before_min}
                onChange={(e) => set("buffer_before_min", Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label>Buffer after</Label>
              <Input type="number" min={0} value={draft.buffer_after_min}
                onChange={(e) => set("buffer_after_min", Math.max(0, Number(e.target.value) || 0))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Min notice (min)</Label>
              <Input type="number" min={0} value={draft.min_notice_min}
                onChange={(e) => set("min_notice_min", Math.max(0, Number(e.target.value) || 0))} />
            </div>
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
          </div>

          <div className="space-y-2">
            <Label>Weekly availability</Label>
            <p className="text-xs text-muted-foreground">The hours this calendar is open for booking.</p>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <div key={d} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-20 cursor-pointer">
                  <input type="checkbox" checked={avail[d]?.enabled ?? false}
                    onChange={(e) => setAvail((a) => ({ ...a, [d]: { ...a[d], enabled: e.target.checked } }))} />
                  <span className="text-sm font-medium">{DAY_NAMES[d]}</span>
                </label>
                {avail[d]?.enabled ? (
                  <>
                    <Input type="time" value={avail[d]?.start ?? "09:00"} className="w-28"
                      onChange={(e) => setAvail((a) => ({ ...a, [d]: { ...a[d], start: e.target.value } }))} />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" value={avail[d]?.end ?? "17:00"} className="w-28"
                      onChange={(e) => setAvail((a) => ({ ...a, [d]: { ...a[d], end: e.target.value } }))} />
                  </>
                ) : <span className="text-sm text-muted-foreground">Unavailable</span>}
              </div>
            ))}
          </div>
        </div>

        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
