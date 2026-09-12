// paige-social — the Upload-Post API adapter (#1140-era, NEXUS's domain).
//
// Paige's social media operations: post, schedule, read analytics, manage
// connected accounts — all through Upload-Post's unified API (14 platforms).
//
// THE FLOW:
//   Chat tool → this function → Upload-Post API → response → Rail receipt
//
// Every POST/PUBLISH is confirm-first (external_effect on the Trust Compass).
// Reads (analytics, accounts) are open. Multi-account per platform supported.
//
// Auth: service-role bearer or Vault cron token. The Upload-Post API key
// lives in function env (UPLOAD_POST_API_KEY).
//
// Platforms: TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads,
// Pinterest, Reddit, Bluesky, Discord, Telegram, Google Business, Snapchat.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { socialPublishContainment, containedPublishResponse } from "../_shared/social-publish-containment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UPLOAD_POST_API = Deno.env.get("UPLOAD_POST_API_BASE") ?? "https://api.upload-post.com/api";
const UPLOAD_POST_KEY = Deno.env.get("UPLOAD_POST_API_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function uploadPost(endpoint: string, method: string, body?: Record<string, unknown>) {
  if (!UPLOAD_POST_KEY) return { error: "UPLOAD_POST_API_KEY not configured" };
  const r = await fetch(`${UPLOAD_POST_API}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Apikey ${UPLOAD_POST_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: data?.message ?? `upload_post_${r.status}`, detail: data };
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    if (cronToken) {
      const { data: ok } = await admin.rpc("verify_cron_token", { _token: cronToken });
      authorized = ok === true;
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : null;
  const profile = typeof body.profile === "string" ? body.profile : "";

  // ── SOCIAL PUBLISH CONTAINMENT (owner ruling, Gate A 2026-09-12) ──────────────────────────────
  // Deny PUBLICATION at the seam, before any Upload-Post call, success claim, or receipt/Rail. This
  // is the every-entry-point safeguard: it holds for the Chat tool, a direct service-role call, a
  // cron token, or any future producer, and a configured UPLOAD_POST_API_KEY cannot change it (the
  // decision takes only the action name). Reads and cancel stay available. The governed, tenant-safe
  // Social capability is not built/proven; until it is, Paige publishes nothing. See
  // _shared/social-publish-containment.ts for the lift path.
  const containment = socialPublishContainment(action);
  if (containment.denied) {
    // `containedPublishResponse` carries success:false so Chat's write-audit records this as a
    // FAILED attempt, never a succeeded external publish (the false-receipt hole #1164's review found).
    return json(containedPublishResponse(containment), 403);
  }

  // ---- ACTIONS ----

  // List connected accounts (per profile)
  if (action === "accounts") {
    const result = await uploadPost("/uploadposts/profiles", "GET");
    return json({ ok: !result.error, accounts: result });
  }

  // Post content (video, photos, text, or document) to one or more platforms.
  // CONFIRM-FIRST: the caller (paige-ai-chat) must have already obtained owner approval.
  if (action === "post") {
    const { content_type, platforms, title, description, media_url, scheduled_date, profile_username } = body;
    if (!platforms || !Array.isArray(platforms) || !platforms.length) {
      return json({ error: "platforms_required" }, 400);
    }
    if (!profile_username) return json({ error: "profile_required" }, 400);

    let endpoint = "/uploadposts/upload"; // default: video
    const payload: Record<string, unknown> = {
      user: profile_username,
      platform: platforms,
      title: title ?? "",
      description: description ?? "",
      scheduled_date: scheduled_date,
    };

    if (content_type === "photos") {
      endpoint = "/uploadposts/upload_photos";
      payload.photos = body.photos ?? (media_url ? [media_url] : []);
    } else if (content_type === "text") {
      endpoint = "/uploadposts/upload_text";
      payload.title = title ?? content; // text posts use title as the content
    } else if (content_type === "document") {
      endpoint = "/uploadposts/upload_document";
      payload.document = body.document_url;
    } else {
      // video (default)
      payload.video = media_url;
    }

    const result = await uploadPost(endpoint, "POST", payload);
    if (result.error) return json({ ok: false, error: result.error, detail: result.detail }, 502);

    // Record on the Rail.
    if (tenantId) {
      const { data: m } = await admin.from("tenant_members")
        .select("user_id").eq("tenant_id", tenantId).eq("status", "active")
        .in("role", ["owner", "admin"]).limit(1);
      // Import recordCapabilityRun inline (avoid import chain issues).
      await admin.rpc("record_capability_run", {
        _tenant_id: tenantId,
        _actor_id: m?.[0]?.user_id ?? null,
        _capability_key: "social_post",
        _outcome: "capability_succeeded",
        _run_id: crypto.randomUUID(),
        _agent_slug: "paige-social",
      }).catch(() => {});
    }

    return json({ ok: true, post: result });
  }

  // Check post status (async uploads)
  if (action === "status") {
    const result = await uploadPost(`/uploadposts/status?request_id=${body.request_id}`, "GET");
    return json({ ok: !result.error, status: result });
  }

  // List scheduled posts
  if (action === "scheduled") {
    const result = await uploadPost("/uploadposts/schedule", "GET");
    return json({ ok: !result.error, scheduled: result });
  }

  // Cancel a scheduled post
  if (action === "cancel_scheduled") {
    const result = await uploadPost(`/uploadposts/schedule/${body.job_id}`, "DELETE");
    return json({ ok: !result.error, cancelled: result });
  }

  // Get analytics (cross-platform)
  if (action === "analytics") {
    const platforms = Array.isArray(body.platforms) ? body.platforms.join(",") : "";
    const result = await uploadPost(`/analytics/${profile}?platforms=${platforms}`, "GET");
    return json({ ok: !result.error, analytics: result });
  }

  // Get per-post cached analytics
  if (action === "post_analytics") {
    const params = new URLSearchParams({ user: profile, ...(body.platform ? { platform: body.platform } : {}), ...(body.limit ? { limit: String(body.limit) } : { limit: "20" }) });
    const result = await uploadPost(`/uploadposts/post-analytics/cached?${params}`, "GET");
    return json({ ok: !result.error, posts: result });
  }

  // Get audience insights (TikTok only currently)
  if (action === "audience") {
    const params = new URLSearchParams({ platform: body.platform ?? "tiktok", user: profile });
    const result = await uploadPost(`/uploadposts/audience?${params}`, "GET");
    return json({ ok: !result.error, audience: result });
  }

  // List comments (across platforms)
  if (action === "comments") {
    const params = new URLSearchParams({ user: profile, ...(body.platform ? { platform: body.platform } : {}) });
    const result = await uploadPost(`/uploadposts/comments?${params}`, "GET");
    return json({ ok: !result.error, comments: result });
  }

  return json({ error: "unknown_action", available: ["accounts", "post", "status", "scheduled", "cancel_scheduled", "analytics", "post_analytics", "audience", "comments"] }, 400);
});
