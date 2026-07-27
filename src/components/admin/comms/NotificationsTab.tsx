// Comms C-1.5 — Notification quiet hours (inbox DND). USER-LEVEL. Upserts the
// reserved public.notification_preferences row (user_id, 'app', 'comms_inbox');
// the quiet-hours window lives in metadata jsonb. RLS scopes to auth.uid() (§9).
//
// CRITICAL COPY GUARANTEE (§13/§36): this ONLY delays the PING to you — it never
// delays or blocks a message being SENT. That distinction is stated on-surface.
import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { SectionCard } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// A representative IANA set — the common US/EU zones + the tenant's browser zone.
const TZ_OPTIONS = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Australia/Sydney",
];
const DAYS = [
  { v: "0", label: "Sun" }, { v: "1", label: "Mon" }, { v: "2", label: "Tue" },
  { v: "3", label: "Wed" }, { v: "4", label: "Thu" }, { v: "5", label: "Fri" },
  { v: "6", label: "Sat" },
];
const browserTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
  catch { return "America/New_York"; }
};

interface DndMeta {
  dnd: boolean;
  quiet_start: string;   // "HH:mm" local
  quiet_end: string;     // "HH:mm" local
  tz: string;            // IANA
  days: number[];        // 0=Sun … 6=Sat
  mute_channels: string[];
}

const defaultMeta = (): DndMeta => ({
  dnd: false, quiet_start: "21:00", quiet_end: "07:00",
  tz: browserTz(), days: [0, 1, 2, 3, 4, 5, 6], mute_channels: ["app", "email"],
});

export function NotificationsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);   // master: ping me about inbox activity
  const [meta, setMeta] = useState<DndMeta>(defaultMeta());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("notification_preferences")
      .select("enabled, metadata")
      .eq("channel", "app")
      .eq("alert_type", "comms_inbox")
      .maybeSingle();
    if (data) {
      setEnabled(data.enabled ?? true);
      const m = (data.metadata ?? {}) as Partial<DndMeta>;
      setMeta({ ...defaultMeta(), ...m, days: Array.isArray(m.days) ? m.days : defaultMeta().days });
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) { setSaving(false); toast({ title: "Please sign in again", variant: "destructive" }); return; }
    const { error } = await supabase
      .from("notification_preferences")
      .upsert(
        { user_id: uid, channel: "app", alert_type: "comms_inbox", enabled, metadata: meta as unknown as Json },
        { onConflict: "user_id,channel,alert_type" },
      );
    setSaving(false);
    if (error) { toast({ title: "Couldn't save that just now", variant: "destructive" }); return; }
    toast({ title: "Notification settings saved" });
  };

  if (loading) {
    return <SectionCard title="When Paige reaches you"><Skeleton className="h-40 w-full" /></SectionCard>;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="When Paige reaches you"
        description="Control the pings about new inbox activity. This never changes when messages go out — only when you hear about them."
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-md border border-border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="notif-master" className="text-sm font-medium">
                Ping me about new inbox activity
              </Label>
              <p className="text-xs text-muted-foreground">
                New messages and replies that need you.
              </p>
            </div>
            <Switch id="notif-master" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-5 rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="dnd-toggle" className="flex items-center gap-2 text-sm font-medium">
                    <BellRing className="h-4 w-4 text-muted-foreground" /> Quiet hours
                  </Label>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Between these hours Paige won't ping you — new messages still land in your inbox,
                    they just wait quietly. <strong className="text-foreground">This delays the notification,
                    not the sending</strong> — anything scheduled still goes out on time.
                  </p>
                </div>
                {/* R-B2 (§13): no mobile-push emitter ships this slice, so the quiet-hours
                    configuration is honestly gated (disabled) rather than presenting a
                    control that governs a ping that doesn't fire yet. */}
                <Switch
                  id="dnd-toggle" checked={meta.dnd} disabled
                  onCheckedChange={(v) => setMeta({ ...meta, dnd: v })}
                />
              </div>

              {/* Honest gate — the quiet-hours window is real and saved, but the pings it
                  applies to arrive with the mobile app (§13, no phantom control). */}
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Mobile inbox pushes arrive with the mobile app — quiet hours will apply then.
                  Until it ships, your inbox always stays up to date right here in the browser.
                </p>
              </div>

              {meta.dnd && (
                <div className="space-y-4 border-t border-border pt-4 opacity-60">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="q-start">From</Label>
                      <Input
                        id="q-start" type="time" value={meta.quiet_start} disabled
                        onChange={(e) => setMeta({ ...meta, quiet_start: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="q-end">Until</Label>
                      <Input
                        id="q-end" type="time" value={meta.quiet_end} disabled
                        onChange={(e) => setMeta({ ...meta, quiet_end: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Time zone</Label>
                      <Select value={meta.tz} onValueChange={(tz) => setMeta({ ...meta, tz })} disabled>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[meta.tz, ...TZ_OPTIONS.filter((t) => t !== meta.tz)].map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>On these days</Label>
                    <ToggleGroup
                      type="multiple"
                      value={meta.days.map(String)}
                      disabled
                      onValueChange={(vals) =>
                        setMeta({ ...meta, days: vals.map(Number).sort((a, b) => a - b) })
                      }
                      className="justify-start"
                    >
                      {DAYS.map((d) => (
                        <ToggleGroupItem key={d.v} value={d.v} aria-label={d.label} className="px-3">
                          {d.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <p className="text-xs text-muted-foreground">
                      A quiet window that starts at night and ends in the morning is handled automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="gold" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
