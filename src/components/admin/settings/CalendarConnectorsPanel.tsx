/**
 * Calendar connectors — per-user calendar/meeting account links.
 *
 * Lives in the ONE integrations home (Automation → Integrations, folded in as a
 * section) so people aren't hunting connect flows across screens. It is also
 * legitimately reused in the person's own Profile ("connected accounts") as a
 * personal surface — the connection is keyed to the signed-in user
 * (`staff_calendar_settings.user_id`), so "my Google / my Zoom" belongs on the
 * profile too; that is contextual reuse (§12), not a rival management home.
 *
 * Built on the shared primitive layer (§11): SectionCard + StatePill so it reads
 * as one continuous system beside the hub's own connector tiles — no raw Card,
 * no Badge status, no native confirm() (an AlertDialog governs disconnect).
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard, StatePill } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link as LinkIcon, Unlink, Loader2, CalendarCheck, Video, Apple } from "lucide-react";

interface ConnState {
  google_calendar_connected: boolean;
  google_email: string | null;
  apple_caldav_connected: boolean;
  zoom_connected: boolean;
  zoom_email: string | null;
}

/** Which account a pending disconnect confirmation targets. */
type DisconnectTarget = "google" | "zoom" | null;

export function CalendarConnectorsPanel() {
  const [conn, setConn] = useState<ConnState | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectingZoom, setConnectingZoom] = useState(false);
  const [disconnectTarget, setDisconnectTarget] = useState<DisconnectTarget>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase
      .from("staff_calendar_settings")
      .select("google_calendar_connected, google_email, apple_caldav_connected, zoom_connected, zoom_email")
      .eq("user_id", uid)
      .maybeSingle();
    setConn((data as ConnState | null) ?? {
      google_calendar_connected: false, google_email: null, apple_caldav_connected: false,
      zoom_connected: false, zoom_email: null,
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

  const connectZoom = async () => {
    setConnectingZoom(true);
    const { data, error } = await supabase.functions.invoke("zoom-oauth-start", {
      body: { origin: window.location.origin },
    });
    setConnectingZoom(false);
    const url = (data as { authorization_url?: string } | null)?.authorization_url;
    if (error || !url) {
      toast.error((data as { error?: string } | null)?.error ?? error?.message ?? "Could not start Zoom OAuth");
      return;
    }
    window.location.href = url;
  };

  // One AlertDialog governs both disconnects (§11 — no native confirm()). It
  // fires the right edge function for whichever account the user chose to drop.
  const confirmDisconnect = async () => {
    const target = disconnectTarget;
    if (!target) return;
    setDisconnecting(true);
    const fn = target === "google" ? "google-calendar-disconnect" : "zoom-disconnect";
    const { data, error } = await supabase.functions.invoke(fn, { body: {} });
    setDisconnecting(false);
    if (error || (data as { error?: string } | null)?.error) {
      toast.error((data as { error?: string } | null)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success(target === "google" ? "Google Calendar disconnected" : "Zoom disconnected");
    setDisconnectTarget(null);
    void load();
  };

  const googleConnected = conn?.google_calendar_connected ?? false;
  const zoomConnected = conn?.zoom_connected ?? false;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" /> Calendar connectors
        </h2>
        <p className="text-sm text-muted-foreground">
          Connect your calendar and meeting tools so your bookings stay in sync both ways.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Google Calendar */}
        <SectionCard
          icon={CalendarCheck}
          title="Google Calendar"
          description="Two-way sync with your Google account."
          actions={
            loading ? <Skeleton className="h-5 w-24 rounded-full" />
              : googleConnected
                ? <StatePill state="success">Connected</StatePill>
                : <StatePill state="off">Not connected</StatePill>
          }
        >
          {loading ? (
            <Skeleton className="h-9 w-48" />
          ) : googleConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{conn?.google_email ?? "Connected account"}</p>
              <Button variant="outline" size="sm" onClick={() => setDisconnectTarget("google")}>
                <Unlink className="h-4 w-4 mr-2" /> Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={connectGoogle} disabled={connecting}>
              {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
              Connect Google Calendar
            </Button>
          )}
        </SectionCard>

        {/* Zoom */}
        <SectionCard
          icon={Video}
          title="Zoom"
          description="Add a meeting link to your bookings automatically."
          actions={
            loading ? <Skeleton className="h-5 w-24 rounded-full" />
              : zoomConnected
                ? <StatePill state="success">Connected</StatePill>
                : <StatePill state="off">Not connected</StatePill>
          }
        >
          {loading ? (
            <Skeleton className="h-9 w-36" />
          ) : zoomConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{conn?.zoom_email ?? "Connected account"}</p>
              <Button variant="outline" size="sm" onClick={() => setDisconnectTarget("zoom")}>
                <Unlink className="h-4 w-4 mr-2" /> Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={connectZoom} disabled={connectingZoom}>
              {connectingZoom ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
              Connect Zoom
            </Button>
          )}
        </SectionCard>

        {/* Apple Calendar — not yet wired */}
        <SectionCard
          icon={Apple}
          title="Apple Calendar"
          description="iCloud connect via CalDAV."
          actions={<StatePill state="pending">Coming soon</StatePill>}
        >
          <p className="text-sm text-muted-foreground">
            You'll enter your iCloud email and an app-specific password from appleid.apple.com. We'll wire the sync next.
          </p>
        </SectionCard>
      </div>

      <AlertDialog open={disconnectTarget !== null} onOpenChange={(v) => !v && setDisconnectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {disconnectTarget === "google" ? "Google Calendar" : "Zoom"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {disconnectTarget === "google"
                ? "New bookings will stop syncing to your Google Calendar. You can reconnect anytime."
                : "New bookings will stop getting a Zoom link added automatically. You can reconnect anytime."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Keep connected</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDisconnect(); }} disabled={disconnecting}>
              {disconnecting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export default CalendarConnectorsPanel;
