// Sub-Agent: Coach Copilot
// Summarizes a coach's book of business: client load, overdue tasks, clients
// without recent touchpoints, and BTF progress signals. Scoped by coach user.
//
// Doctrine §116 — Archetype-only references in generated output.
// This agent legitimately names the requesting coach's OWN clients (their book).
// It must NEVER surface names of clients/coaches/admins outside the requesting
// coach's scope. If example phrasing is ever added to this agent's output, use
// archetype phrasing only — "a client", "the contact", "their business".
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface Input {
  coach_user_id?: string;
  silence_days?: number;
}

function ok(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let payload: { input?: Input; context?: { user_id?: string } } = {};
  try { payload = await req.json(); } catch { return ok({ ok: false, error: "Invalid JSON" }, 400); }
  const coachId = payload.input?.coach_user_id ?? payload.context?.user_id;
  if (!coachId) return ok({ ok: false, error: "coach_user_id required" }, 400);
  const silenceDays = payload.input?.silence_days ?? 7;

  const { data: assignments, error: aErr } = await supabase
    .from("coach_clients")
    .select("client_user_id,status,notes,updated_at")
    .eq("coach_user_id", coachId)
    .eq("status", "active");
  if (aErr) return ok({ ok: false, error: aErr.message }, 500);

  const clientUserIds = (assignments ?? []).map((a) => a.client_user_id as string);
  if (clientUserIds.length === 0) {
    return ok({
      ok: true,
      subagent: "coach-copilot",
      summary: "No active clients assigned to this coach.",
      kpis: { active_clients: 0, overdue_tasks: 0, silent_clients: 0 },
      recommendations: [],
      confidence: "high",
      requires_approval: false,
      sources: ["coach_clients"],
    });
  }

  const [clientsRes, tasksRes, convRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id,first_name,last_name,linked_user_id,journey_stage_id,onboarding_stage,updated_at")
      .in("linked_user_id", clientUserIds),
    supabase
      .from("tasks")
      .select("id,title,status,due_date,user_id")
      .in("user_id", clientUserIds)
      .neq("status", "completed")
      .neq("status", "cancelled"),
    supabase
      .from("paige_conversations")
      .select("contact_id,created_at")
      .in("contact_id", clientUserIds)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const now = Date.now();
  const silenceMs = silenceDays * 86400000;
  const overdueTasks = (tasksRes.data ?? []).filter((t) => t.due_date && new Date(t.due_date as string).getTime() < now);

  const lastTouchByClient = new Map<string, number>();
  for (const c of convRes.data ?? []) {
    const cid = c.contact_id as string;
    const t = new Date(c.created_at as string).getTime();
    if (!lastTouchByClient.has(cid) || t > lastTouchByClient.get(cid)!) lastTouchByClient.set(cid, t);
  }
  const silentClients = (clientsRes.data ?? []).filter((c) => {
    const last = lastTouchByClient.get(c.linked_user_id as string);
    return !last || now - last > silenceMs;
  });

  const recommendations = [
    ...overdueTasks.slice(0, 5).map((t) => ({
      priority: "high" as const,
      action: `Resolve overdue task "${t.title}" (due ${t.due_date}).`,
      ref: t.id,
    })),
    ...silentClients.slice(0, 5).map((c) => ({
      priority: "medium" as const,
      action: `Reach out to ${c.first_name ?? "client"} ${c.last_name ?? ""} — no contact in ${silenceDays}+ days.`,
      ref: c.id,
    })),
  ];

  return ok({
    ok: true,
    subagent: "coach-copilot",
    summary: `Coach has ${clientsRes.data?.length ?? 0} active client(s). ${overdueTasks.length} overdue task(s). ${silentClients.length} client(s) silent ${silenceDays}+ days.`,
    kpis: {
      active_clients: clientsRes.data?.length ?? 0,
      overdue_tasks: overdueTasks.length,
      silent_clients: silentClients.length,
    },
    recommendations,
    confidence: "high",
    requires_approval: false,
    sources: ["coach_clients", "tasks", "paige_conversations"],
  });
});
