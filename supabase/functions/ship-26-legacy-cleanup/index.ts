// Ship #2.6 — Legacy MMA Table Deprecation orchestrator (Doctrine §198)
//
// Four-phase, super-admin-only, manual-trigger cleanup for the legacy
// `subscription_plans` and `user_subscriptions` tables. No auto-progression:
// Antonio calls this function once per phase with an explicit `phase` param.
//
// Phases:
//   1. export_only         → snapshot both tables as CSV, push to Google Drive
//   2. check_dependencies  → FK + policy scan (read-only)
//   3. freeze_writes       → REVOKE write grants, snapshot row counts, audit
//   4. drop_tables         → guarded DROP CASCADE (7-day + row-invariant gates)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEGACY_TABLES = ["subscription_plans", "user_subscriptions"] as const;
type LegacyTable = typeof LEGACY_TABLES[number];

const GDRIVE_FOLDER_PATH = "MMA-Legacy-Archive/2026-07";
const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_drive";

// ─────────────────────────────────────────────────────────────
type Phase = "export_only" | "check_dependencies" | "freeze_writes" | "drop_tables";

interface Body {
  phase: Phase;
  confirm_phrase?: string;
  force?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Auth: caller must be super_admin ────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!role) return json({ error: "super_admin required" }, 403);

    // ── Parse + validate ────────────────────────────────────
    const body = (await req.json()) as Body;
    if (!body?.phase) return json({ error: "phase required" }, 400);

    // Two-key destructive confirmation on freeze + drop
    const needsConfirm: Phase[] = ["freeze_writes", "drop_tables"];
    if (needsConfirm.includes(body.phase) && body.confirm_phrase !== `SHIP_26_${body.phase.toUpperCase()}`) {
      return json({
        error: "confirm_phrase mismatch",
        expected: `SHIP_26_${body.phase.toUpperCase()}`,
      }, 400);
    }

    // ── Dispatch ────────────────────────────────────────────
    switch (body.phase) {
      case "export_only":        return json(await runExport(supabase));
      case "check_dependencies": return json(await runCheck(supabase));
      case "freeze_writes":      return json(await runFreeze(supabase));
      case "drop_tables":        return json(await runDrop(supabase, body.force ?? false));
      default:                   return json({ error: "unknown phase" }, 400);
    }
  } catch (e) {
    console.error("[ship-26]", e);
    return json({ error: e instanceof Error ? e.message : "failed" }, 500);
  }
});

// ─────────────────────────────────────────────────────────────
// PHASE 1 — export_only
// ─────────────────────────────────────────────────────────────
async function runExport(supabase: ReturnType<typeof createClient>) {
  const results: Record<string, unknown> = {};
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gdriveKey = Deno.env.get("GOOGLE_DRIVE_API_KEY"); // gateway connection key

  const canPushToDrive = Boolean(lovableKey && gdriveKey);
  const folderId = canPushToDrive ? await ensureDriveFolder(lovableKey!, gdriveKey!) : null;

  for (const table of LEGACY_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`export ${table}: ${error.message}`);
    const rows = data ?? [];
    const csv = toCsv(rows);
    const filename = `${table}_${new Date().toISOString().slice(0, 10)}.csv`;

    let driveFileId: string | null = null;
    if (canPushToDrive && folderId) {
      driveFileId = await uploadCsvToDrive(lovableKey!, gdriveKey!, folderId, filename, csv);
    }

    results[table] = {
      row_count: rows.length,
      filename,
      drive_file_id: driveFileId,
      inline_csv_preview: csv.slice(0, 500),
    };
  }

  return {
    phase: "export_only",
    exported_at: new Date().toISOString(),
    drive_folder: canPushToDrive ? GDRIVE_FOLDER_PATH : "SKIPPED (GOOGLE_DRIVE_API_KEY not configured)",
    tables: results,
    doctrine: "§198",
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 2 — check_dependencies (delegates to SQL function)
// ─────────────────────────────────────────────────────────────
async function runCheck(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.rpc("ship_26_check_dependencies");
  if (error) throw new Error(`check_dependencies: ${error.message}`);
  return {
    ...(data as Record<string, unknown>),
    reminder: "Also grep the repo for `subscription_plans` / `user_subscriptions` references in edge functions, MCP tools, and RLS policies before freezing.",
  };
}

// ─────────────────────────────────────────────────────────────
// PHASE 3 — freeze_writes
// ─────────────────────────────────────────────────────────────
async function runFreeze(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.rpc("ship_26_freeze_legacy_tables");
  if (error) throw new Error(`freeze_writes: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// PHASE 4 — drop_tables
// ─────────────────────────────────────────────────────────────
async function runDrop(supabase: ReturnType<typeof createClient>, force: boolean) {
  const { data, error } = await supabase.rpc("ship_26_drop_legacy_tables", { _force: force });
  if (error) throw new Error(`drop_tables: ${error.message}`);
  return data;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

async function driveFetch(lovableKey: string, gdriveKey: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gdriveKey,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`gdrive ${res.status}: ${await res.text()}`);
  return res;
}

async function ensureDriveFolder(lovableKey: string, gdriveKey: string): Promise<string> {
  const parts = GDRIVE_FOLDER_PATH.split("/");
  let parentId = "root";
  for (const name of parts) {
    const q = encodeURIComponent(
      `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    );
    const searchRes = await driveFetch(lovableKey, gdriveKey, `/drive/v3/files?q=${q}&fields=files(id,name)`);
    const search = await searchRes.json();
    if (search.files?.length) {
      parentId = search.files[0].id;
    } else {
      const createRes = await driveFetch(lovableKey, gdriveKey, `/drive/v3/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
      });
      parentId = (await createRes.json()).id;
    }
  }
  return parentId;
}

async function uploadCsvToDrive(
  lovableKey: string,
  gdriveKey: string,
  folderId: string,
  filename: string,
  csv: string,
): Promise<string> {
  const boundary = "ship26_boundary_" + crypto.randomUUID();
  const metadata = { name: filename, parents: [folderId], mimeType: "text/csv" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--`;
  const res = await driveFetch(lovableKey, gdriveKey, `/upload/drive/v3/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()).id;
}
