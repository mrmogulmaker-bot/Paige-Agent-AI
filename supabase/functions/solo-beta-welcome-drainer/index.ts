import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LIMIT = 20;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bearer = (req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE_KEY;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    const { data: cronOk } = cronToken
      ? await admin.rpc("verify_cron_token", { _token: cronToken })
      : { data: false };
    authorized = cronOk === true;
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const now = new Date().toISOString();
  const staleClaim = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: due, error: dueError } = await admin
    .from("solo_beta_welcome_deliveries")
    .select("fulfillment_event_id")
    .in("state", ["pending", "retryable_failure"])
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(LIMIT);
  if (dueError) return json({ error: "welcome_scan_failed" }, 503);

  const remaining = Math.max(0, LIMIT - (due?.length ?? 0));
  const { data: stale, error: staleError } = remaining
    ? await admin
        .from("solo_beta_welcome_deliveries")
        .select("fulfillment_event_id")
        .eq("state", "sending")
        .lt("claimed_at", staleClaim)
        .order("claimed_at", { ascending: true })
        .limit(remaining)
    : { data: [], error: null };
  if (staleError) return json({ error: "welcome_scan_failed" }, 503);

  const eventIds = Array.from(
    new Set(
      [...(due ?? []), ...(stale ?? [])].map((row) => row.fulfillment_event_id),
    ),
  );
  let sent = 0;
  let deferred = 0;
  for (const eventId of eventIds) {
    const response = await fetch(
      SUPABASE_URL + "/functions/v1/send-transactional-email",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          templateName: "solo-beta-welcome",
          fulfillmentEventId: eventId,
        }),
      },
    );
    if (response.ok) sent += 1;
    else deferred += 1;
  }

  return json({ ok: true, scanned: eventIds.length, sent, deferred });
});
