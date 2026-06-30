// Security canary: probes growth_forms and growth_pages as an anonymous caller
// to verify that internal/restricted columns are not reachable. Logs every run
// and raises an admin notification on regression.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Columns the public anon role MUST NOT be able to select. If any of these
// come back populated (or the request succeeds at all on the restricted
// projection), we treat the run as a regression.
const PROBES: Array<{
  name: string;
  table: "growth_forms" | "growth_pages";
  restrictedCols: string[];
  filter: string;
}> = [
  {
    name: "growth_forms_internal_columns",
    table: "growth_forms",
    restrictedCols: ["tenant_id", "notify_user_ids", "workflow_slug", "pipeline_id", "stage_id"],
    filter: "status=eq.active",
  },
  {
    name: "growth_pages_internal_columns",
    table: "growth_pages",
    restrictedCols: ["tenant_id", "entry_page_id"],
    filter: "status=eq.published",
  },
];

type ProbeResult = {
  probe_name: string;
  target: string;
  status: "pass" | "regression" | "error";
  leaked_columns: string[];
  sample_payload: unknown;
  http_status: number | null;
  error_message: string | null;
};

async function runProbe(p: typeof PROBES[number]): Promise<ProbeResult> {
  const select = encodeURIComponent(p.restrictedCols.join(","));
  const url = `${SUPABASE_URL}/rest/v1/${p.table}?select=${select}&${p.filter}&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    // Expected outcome: 401/403 OR a 200 with rows that contain only NULLs
    // for restricted columns (i.e. column-level grants stripped them).
    if (res.status === 401 || res.status === 403) {
      return {
        probe_name: p.name,
        target: p.table,
        status: "pass",
        leaked_columns: [],
        sample_payload: { http: res.status, body: text.slice(0, 300) },
        http_status: res.status,
        error_message: null,
      };
    }
    if (res.status === 200) {
      let rows: Array<Record<string, unknown>> = [];
      try { rows = JSON.parse(text); } catch { /* ignore */ }
      const leaked = new Set<string>();
      for (const row of rows) {
        for (const col of p.restrictedCols) {
          if (row && Object.prototype.hasOwnProperty.call(row, col) && row[col] !== null && row[col] !== undefined) {
            leaked.add(col);
          }
        }
      }
      return {
        probe_name: p.name,
        target: p.table,
        status: leaked.size > 0 ? "regression" : "pass",
        leaked_columns: [...leaked],
        sample_payload: rows.slice(0, 1),
        http_status: 200,
        error_message: null,
      };
    }
    return {
      probe_name: p.name,
      target: p.table,
      status: "error",
      leaked_columns: [],
      sample_payload: { body: text.slice(0, 300) },
      http_status: res.status,
      error_message: `unexpected_status_${res.status}`,
    };
  } catch (e) {
    return {
      probe_name: p.name,
      target: p.table,
      status: "error",
      leaked_columns: [],
      sample_payload: null,
      http_status: null,
      error_message: String(e).slice(0, 500),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const results = await Promise.all(PROBES.map(runProbe));

  const { error: insertErr } = await admin.from("security_canary_runs").insert(results);
  if (insertErr) console.error("canary_insert_failed", insertErr);

  const regressions = results.filter((r) => r.status === "regression");
  if (regressions.length > 0) {
    const lines = regressions.map(
      (r) => `• ${r.target}: leaked columns [${r.leaked_columns.join(", ")}]`,
    );
    await admin.from("paige_admin_notifications").insert({
      severity: "urgent",
      title: `🚨 Security canary regression (${regressions.length})`,
      body:
        `Anonymous probe was able to read restricted columns:\n` +
        lines.join("\n") +
        `\n\nReview RLS policies and column GRANTs on growth_forms / growth_pages.`,
      link_to: `/admin/security`,
      source_workflow_key: "security_canary_regression",
      scope: "admin",
    });

    // Notify the admin email list. Pull every user whose role is owner /
    // super_admin / admin and resolve their email from profiles.
    try {
      const { data: roleRows } = await admin
        .from("user_roles")
        .select("user_id")
        .in("role", ["owner", "super_admin", "admin"]);
      const userIds = [...new Set((roleRows ?? []).map((r: any) => r.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: profileRows } = await admin
          .from("profiles")
          .select("user_id, email, full_name")
          .in("user_id", userIds);
        const recipients = (profileRows ?? []).filter((p: any) => p?.email);
        const runAt = new Date().toISOString();
        const emailRegressions = regressions.map((r) => ({
          target: r.target,
          leaked_columns: r.leaked_columns,
          http_status: r.http_status,
        }));
        await Promise.allSettled(
          recipients.map((p: any) =>
            fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_KEY}`,
              },
              body: JSON.stringify({
                templateName: "security-canary-regression",
                recipientEmail: p.email,
                recipientUserId: p.user_id,
                idempotencyKey: `canary-${runAt}-${p.user_id}`,
                purpose: "transactional",
                templateData: {
                  recipientName: p.full_name?.split(" ")?.[0] ?? null,
                  runAt,
                  regressions: emailRegressions,
                  reviewUrl: "https://paigeagent.ai/admin/security",
                },
              }),
            }).catch((e) => console.error("canary_email_send_failed", p.email, e)),
          ),
        );
      } else {
        console.warn("canary: no admin recipients found for regression email");
      }
    } catch (e) {
      console.error("canary_email_dispatch_failed", e);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      checked: results.length,
      regressions: regressions.length,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
