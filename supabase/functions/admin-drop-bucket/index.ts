import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(status: number, message: string) {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError(401, "Unauthorized");

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  )!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jsonError(401, "Invalid session");
  const callerId = userData.user.id;

  const { data: isSuperAdmin, error: rpcErr } = await supabase.rpc(
    "is_super_admin",
  );
  if (rpcErr) return jsonError(500, `is_super_admin rpc: ${rpcErr.message}`);
  if (!isSuperAdmin) {
    console.log(
      JSON.stringify({
        event: "bucket_drop_denied",
        caller: callerId,
        reason: "not_super_admin",
      }),
    );
    return jsonError(403, "Forbidden");
  }

  let body: { bucket_id?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }
  const { bucket_id, confirm } = body;
  if (!bucket_id || typeof bucket_id !== "string") {
    return jsonError(400, "bucket_id (string) required");
  }
  if (confirm !== true) {
    return jsonError(400, "confirm: true required");
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Defensive: verify bucket exists
  const { data: bucketMeta, error: getBucketErr } =
    await supabaseAdmin.storage.getBucket(bucket_id);
  if (getBucketErr || !bucketMeta) {
    console.log(
      JSON.stringify({
        event: "bucket_drop_failed",
        caller: callerId,
        bucket_id,
        reason: "not_found",
      }),
    );
    return jsonError(404, `Bucket ${bucket_id} not found`);
  }

  // Defensive: verify empty
  const { data: objects, error: listError } = await supabaseAdmin.storage
    .from(bucket_id)
    .list("", { limit: 1 });
  if (listError) return jsonError(500, `list: ${listError.message}`);
  if (objects && objects.length > 0) {
    console.log(
      JSON.stringify({
        event: "bucket_drop_refused",
        caller: callerId,
        bucket_id,
        reason: "not_empty",
      }),
    );
    return jsonError(
      409,
      `Bucket ${bucket_id} is not empty — refusing to drop`,
    );
  }

  const { error: dropError } = await supabaseAdmin.storage.deleteBucket(
    bucket_id,
  );
  if (dropError) {
    console.log(
      JSON.stringify({
        event: "bucket_drop_failed",
        caller: callerId,
        bucket_id,
        reason: dropError.message,
      }),
    );
    return jsonError(500, dropError.message);
  }

  const deleted_at = new Date().toISOString();
  console.log(
    JSON.stringify({
      event: "bucket_dropped",
      bucket_id,
      dropped_by: callerId,
      dropped_at: deleted_at,
    }),
  );

  return new Response(
    JSON.stringify({ success: true, bucket_id, deleted_at }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
