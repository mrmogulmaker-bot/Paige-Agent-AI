// Zoom host-token helper. THE ONLY place Zoom token refresh lives (§12) — the
// booking paths (Lane B) import getFreshZoomToken and treat a null return as
// "this host has no usable Zoom", falling back to the 'link to follow' label so a
// Zoom problem NEVER blocks a booking (§13 best-effort mint).
//
// A host connects their OWN Zoom (§9); tokens are stored encrypted on
// staff_calendar_settings (calendarCrypto). Zoom access tokens live ~1h and Zoom
// ROTATES the refresh token on every refresh, so we persist the rotated refresh +
// new access + expiry back, re-encrypted.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "./calendarCrypto.ts";

// Refresh a little before the true expiry so an in-flight mint doesn't race it.
const EXPIRY_SKEW_MS = 60 * 1000;

/**
 * Returns a valid Zoom access token for the host, refreshing (and persisting the
 * rotated tokens) when the stored one is expired. Returns null when the host has no
 * Zoom connection, is misconfigured, or the refresh fails — callers treat null as
 * "no Zoom" and fall back to the link-to-follow label.
 */
export async function getFreshZoomToken(
  admin: SupabaseClient,
  hostUserId: string,
): Promise<string | null> {
  if (!hostUserId) return null;

  const { data: row, error } = await admin
    .from("staff_calendar_settings")
    .select("zoom_connected, zoom_refresh_token_encrypted, zoom_access_token_encrypted, zoom_token_expires_at")
    .eq("user_id", hostUserId)
    .maybeSingle();

  if (error || !row || !row.zoom_connected || !row.zoom_refresh_token_encrypted) {
    return null;
  }

  // Reuse the stored access token while it's comfortably in-date.
  const expiresAtMs = row.zoom_token_expires_at ? new Date(row.zoom_token_expires_at).getTime() : 0;
  if (row.zoom_access_token_encrypted && expiresAtMs - EXPIRY_SKEW_MS > Date.now()) {
    try {
      return await decryptSecret(row.zoom_access_token_encrypted);
    } catch {
      // Fall through to a refresh if the stored ciphertext can't be read.
    }
  }

  const clientId = Deno.env.get("ZOOM_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  let refreshToken: string;
  try {
    refreshToken = await decryptSecret(row.zoom_refresh_token_encrypted);
  } catch {
    return null;
  }

  let tokenJson: Record<string, any>;
  try {
    const res = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    tokenJson = await res.json().catch(() => ({}));
    if (!res.ok || !tokenJson.access_token || !tokenJson.refresh_token) {
      return null;
    }
  } catch {
    return null;
  }

  // Persist the rotated refresh + new access + expiry, re-encrypted.
  try {
    const refreshEnc = await encryptSecret(String(tokenJson.refresh_token));
    const accessEnc = await encryptSecret(String(tokenJson.access_token));
    const expiresAt = new Date(Date.now() + Number(tokenJson.expires_in ?? 3600) * 1000).toISOString();
    await admin
      .from("staff_calendar_settings")
      .update({
        zoom_refresh_token_encrypted: refreshEnc,
        zoom_access_token_encrypted: accessEnc,
        zoom_token_expires_at: expiresAt,
      })
      .eq("user_id", hostUserId);
  } catch (e) {
    // Persistence failure shouldn't deny the caller the token it just minted, but
    // it MUST be diagnosable: the refresh token rotated at Zoom, so if we fail to
    // store the new one the OLD (now-invalid) token stays in the row and the next
    // refresh will silently kill the connection. Log loudly (§13).
    console.error("[zoomMeetings] failed to persist rotated Zoom token for host", hostUserId, (e as Error)?.message);
  }

  return String(tokenJson.access_token);
}

// ═══════════════════════════════════════════════════════════════════════════
// LANE B — meeting lifecycle around a booking (create / reschedule / cancel).
// Each helper mints a fresh host token first and NO-OPS (returns null / void)
// when the host has no usable Zoom. Genuine API failures THROW so the caller's
// best-effort try/catch logs them — the mint NEVER blocks or rolls back a
// booking (§13); on failure the booking keeps the existing 'link to follow'
// label. The meeting always lives on the HOST's OWN account (§9).
// ═══════════════════════════════════════════════════════════════════════════

const ZOOM_API = "https://api.zoom.us/v2";

/** Zoom wants start_time as ISO-8601 UTC without milliseconds
 *  (e.g. 2026-07-20T15:00:00Z). Normalize any ISO input to that shape. */
function zoomStart(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface ZoomMeetingResult {
  join_url: string;
  meeting_id: string;
}

/**
 * Create a scheduled meeting on the host's OWN Zoom account. Returns
 * { join_url, meeting_id } on success, or null when the host has no live Zoom
 * connection (nothing to do — the caller keeps the 'link to follow' label).
 * A real API failure THROWS (caught by the caller's best-effort try/catch) —
 * these helpers never swallow an error into a silent success.
 */
export async function createZoomMeeting(
  admin: SupabaseClient,
  hostUserId: string,
  opts: { topic: string; startISO: string; durationMin: number; timezone: string },
): Promise<ZoomMeetingResult | null> {
  const token = await getFreshZoomToken(admin, hostUserId);
  if (!token) return null;

  const res = await fetch(`${ZOOM_API}/users/me/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: (opts.topic || "Meeting").slice(0, 200),
      type: 2, // scheduled meeting
      start_time: zoomStart(opts.startISO),
      duration: Math.max(1, Math.round(opts.durationMin)),
      timezone: opts.timezone || "UTC",
      settings: { join_before_host: true },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`zoom create meeting failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  const body = await res.json();
  const joinUrl = typeof body?.join_url === "string" ? body.join_url : "";
  if (!joinUrl) throw new Error("zoom create meeting: response had no join_url");
  return { join_url: joinUrl, meeting_id: String(body.id) };
}

/**
 * Move / re-title an existing meeting (reschedule). No-op when there's no
 * meeting id or no live connection. A 404 (host deleted it out-of-band, or a
 * non-owner host in a collective loop) is treated as a no-op; any other API
 * error THROWS for the caller's try/catch to log.
 */
export async function updateZoomMeeting(
  admin: SupabaseClient,
  hostUserId: string,
  meetingId: string,
  opts: { topic?: string; startISO?: string; durationMin?: number; timezone?: string },
): Promise<void> {
  if (!meetingId) return;
  const token = await getFreshZoomToken(admin, hostUserId);
  if (!token) return;

  const patch: Record<string, unknown> = {};
  if (opts.topic != null) patch.topic = String(opts.topic).slice(0, 200);
  if (opts.startISO) patch.start_time = zoomStart(opts.startISO);
  if (opts.durationMin != null) patch.duration = Math.max(1, Math.round(opts.durationMin));
  if (opts.timezone) patch.timezone = opts.timezone;
  if (Object.keys(patch).length === 0) return;

  const res = await fetch(`${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`zoom update meeting failed: ${res.status} ${detail.slice(0, 300)}`);
  }
}

/**
 * Delete a meeting (cancel). No-op when there's no meeting id or no live
 * connection. A 404 (already gone / not this host's meeting) is a successful
 * no-op; any other API error THROWS for the caller's try/catch.
 */
export async function deleteZoomMeeting(
  admin: SupabaseClient,
  hostUserId: string,
  meetingId: string,
): Promise<void> {
  if (!meetingId) return;
  const token = await getFreshZoomToken(admin, hostUserId);
  if (!token) return;

  const res = await fetch(`${ZOOM_API}/meetings/${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`zoom delete meeting failed: ${res.status} ${detail.slice(0, 300)}`);
  }
}
