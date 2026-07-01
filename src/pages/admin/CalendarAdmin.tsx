import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarDays, Plus, Link as LinkIcon, Unlink, Loader2 } from "lucide-react";

type Settings = {
  google_calendar_connected: boolean;
  google_email: string | null;
  apple_caldav_connected: boolean;
  booking_page_slug: string | null;
  booking_page_enabled: boolean;
  default_meeting_duration_min: number;
  timezone: string;
};

type Booking = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  guest_name: string | null;
  guest_email: string | null;
  meeting_link: string | null;
};

export default function CalendarAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); return; }

    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from("staff_calendar_settings").select("google_calendar_connected, google_email, apple_caldav_connected, booking_page_slug, booking_page_enabled, default_meeting_duration_min, timezone").eq("user_id", uid).maybeSingle(),
      supabase.from("internal_bookings").select("id, title, start_at, end_at, status, source, guest_name, guest_email, meeting_link").eq("host_user_id", uid).gte("start_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()).order("start_at", { ascending: true }).limit(50),
    ]);
    setSettings(s as Settings | null ?? {
      google_calendar_connected: false, google_email: null, apple_caldav_connected: false,
      booking_page_slug: null, booking_page_enabled: false, default_meeting_duration_min: 30, timezone: "America/New_York",
    });
    setBookings((b as Booking[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const connectGoogle = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("google-calendar-oauth-start", {
      body: { origin: window.location.origin },
    });
    setConnecting(false);
    const url = (data as any)?.authorization_url;
    if (error || !url) {
      toast.error((data as any)?.error ?? error?.message ?? "Could not start Google OAuth");
      return;
    }
    window.location.href = url;
  };

  const disconnectGoogle = async () => {
    if (!confirm("Disconnect Google Calendar?")) return;
    const { data, error } = await supabase.functions.invoke("google-calendar-disconnect", { body: {} });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success("Google Calendar disconnected");
    void load();
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("staff_calendar_settings").upsert({
      user_id: uid,
      ...settings,
      ...patch,
    }, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); void load(); }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = new Date(b.start_at).toLocaleDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return Array.from(m.entries());
  }, [bookings]);

  if (loading) {
    return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading calendar…</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">My Calendar</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Google Calendar</CardTitle>
                <CardDescription>Connect your own Google account so bookings sync both ways.</CardDescription>
              </div>
              {settings?.google_calendar_connected
                ? <Badge className="bg-emerald-600">Connected</Badge>
                : <Badge variant="secondary">Not connected</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings?.google_calendar_connected ? (
              <>
                <p className="text-sm text-muted-foreground">{settings.google_email ?? "Connected account"}</p>
                <Button variant="outline" size="sm" onClick={disconnectGoogle}>
                  <Unlink className="h-4 w-4 mr-2" /> Disconnect
                </Button>
              </>
            ) : (
              <Button onClick={connectGoogle} disabled={connecting}>
                {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                Connect Google Calendar
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Apple Calendar</CardTitle>
                <CardDescription>iCloud connect via CalDAV (coming next).</CardDescription>
              </div>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You'll enter your iCloud email and an app-specific password from appleid.apple.com. We'll wire the sync next.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking page</CardTitle>
          <CardDescription>Share a public URL so contacts can book time with you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Slug</Label>
              <Input
                placeholder="your-name"
                value={settings?.booking_page_slug ?? ""}
                onChange={(e) => setSettings((s) => s && { ...s, booking_page_slug: e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
              />
              {settings?.booking_page_slug && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {window.location.origin}/book/{settings.booking_page_slug}
                </p>
              )}
            </div>
            <div>
              <Label>Default duration (min)</Label>
              <Input type="number" value={settings?.default_meeting_duration_min ?? 30}
                onChange={(e) => setSettings((s) => s && { ...s, default_meeting_duration_min: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Timezone</Label>
              <Input value={settings?.timezone ?? "America/New_York"}
                onChange={(e) => setSettings((s) => s && { ...s, timezone: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => saveSettings({})}>Save</Button>
            <Button variant={settings?.booking_page_enabled ? "outline" : "default"}
              onClick={() => saveSettings({ booking_page_enabled: !settings?.booking_page_enabled })}>
              {settings?.booking_page_enabled ? "Disable page" : "Enable page"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Upcoming bookings</CardTitle>
            <CardDescription>Your internal bookings plus synced Google/Apple events.</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled>
            <Plus className="h-4 w-4 mr-2" /> New (coming next)
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {grouped.length === 0 && <p className="text-sm text-muted-foreground">No bookings yet.</p>}
            {grouped.map(([date, items]) => (
              <div key={date} className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{date}</div>
                {items.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(b.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {" – "}
                        {new Date(b.end_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {b.guest_name ? ` · ${b.guest_name}` : b.guest_email ? ` · ${b.guest_email}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{b.source}</Badge>
                      <Badge variant={b.status === "scheduled" ? "default" : "secondary"} className="capitalize">{b.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
