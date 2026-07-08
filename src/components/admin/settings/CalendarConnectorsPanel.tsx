/**
 * Connectors — account-level calendar connections, tucked into Settings.
 *
 * The owner wanted the Google/Apple connect flows OUT of the Calendar page and
 * into one organized home in Settings, so people aren't hunting across screens.
 * This is the calendar-sync connector surface (per-user Google/Apple accounts);
 * the per-calendar schedule/branding lives in the Calendars builder itself.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link as LinkIcon, Unlink, Loader2, CalendarCheck } from "lucide-react";

interface ConnState {
  google_calendar_connected: boolean;
  google_email: string | null;
  apple_caldav_connected: boolean;
}

export function CalendarConnectorsPanel() {
  const [conn, setConn] = useState<ConnState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase
      .from("staff_calendar_settings")
      .select("google_calendar_connected, google_email, apple_caldav_connected")
      .eq("user_id", uid)
      .maybeSingle();
    setConn((data as ConnState | null) ?? {
      google_calendar_connected: false, google_email: null, apple_caldav_connected: false,
    });
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const connectGoogle = async () => {
    setConnecting(true);
    const { data, error } = await supabase.functions.invoke("google-calendar-oauth-start", {
      body: { origin: window.location.origin },
    });
    setConnecting(false);
    const url = (data as { authorization_url?: string } | null)?.authorization_url;
    if (error || !url) {
      toast.error((data as { error?: string } | null)?.error ?? error?.message ?? "Could not start Google OAuth");
      return;
    }
    window.location.href = url;
  };

  const disconnectGoogle = async () => {
    if (!confirm("Disconnect Google Calendar?")) return;
    const { data, error } = await supabase.functions.invoke("google-calendar-disconnect", { body: {} });
    if (error || (data as { error?: string } | null)?.error) {
      toast.error((data as { error?: string } | null)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success("Google Calendar disconnected");
    void load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" /> Calendar connectors
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect your personal calendar so bookings sync both ways. This is separate from the
          calendars you create — those carry their own schedule.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Google Calendar</CardTitle>
                <CardDescription>Two-way sync with your Google account.</CardDescription>
              </div>
              {conn?.google_calendar_connected
                ? <Badge className="bg-emerald-600">Connected</Badge>
                : <Badge variant="secondary">Not connected</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : conn?.google_calendar_connected ? (
              <>
                <p className="text-sm text-muted-foreground">{conn.google_email ?? "Connected account"}</p>
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
                <CardTitle className="text-base">Apple Calendar</CardTitle>
                <CardDescription>iCloud connect via CalDAV.</CardDescription>
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
    </div>
  );
}

export default CalendarConnectorsPanel;
