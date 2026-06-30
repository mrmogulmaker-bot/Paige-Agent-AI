// Sub-Agent: Sales / Pipeline Agent
// Reads the deals pipeline and surfaces stalled deals, close-this-week, and
// next-best-action recommendations. Tenant-scoped via the deal owner.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface Input {
  owner_user_id?: string;
  contact_id?: string;
  stalled_days?: number;
}

function ok(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let payload: { input?: Input; context?: { contact_id?: string; user_id?: string } } = {};
  try { payload = await req.json(); } catch { return ok({ ok: false, error: "Invalid JSON" }, 400); }
  const input = payload.input ?? {};
  const stalledDays = input.stalled_days ?? 14;
  const contactId = input.contact_id ?? payload.context?.contact_id;
  const ownerId = input.owner_user_id ?? payload.context?.user_id;

  let q = supabase
    .from("deals")
    .select("id,title,value_cents,currency,status,expected_close_date,actual_close_date,stage_id,owner_user_id,contact_client_id,updated_at,source,lost_reason")
    .neq("status", "won")
    .neq("status", "lost")
    .order("updated_at", { ascending: true })
    .limit(200);
  if (contactId) q = q.eq("contact_client_id", contactId);
  else if (ownerId) q = q.eq("owner_user_id", ownerId);

  const { data: deals, error } = await q;
  if (error) return ok({ ok: false, error: error.message }, 500);

  const { data: stages } = await supabase.from("pipeline_stages").select("id,label,probability,stage_type");
  const stageMap = new Map((stages ?? []).map((s) => [s.id as string, s]));

  const now = Date.now();
  const ms = stalledDays * 24 * 60 * 60 * 1000;
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;

  const stalled = (deals ?? []).filter((d) => now - new Date(d.updated_at as string).getTime() > ms);
  const closingSoon = (deals ?? []).filter((d) =>
    d.expected_close_date && new Date(d.expected_close_date as string).getTime() <= weekAhead
  );
  const noNextStep = (deals ?? []).filter((d) => !d.expected_close_date);

  const totalOpen = (deals ?? []).length;
  const totalValueCents = (deals ?? []).reduce((s, d) => s + Number(d.value_cents ?? 0), 0);
  const weightedCents = (deals ?? []).reduce((s, d) => {
    const prob = Number(stageMap.get(d.stage_id as string)?.probability ?? 0);
    return s + Number(d.value_cents ?? 0) * (prob / 100);
  }, 0);

  const recommendations = [
    ...stalled.slice(0, 5).map((d) => ({
      priority: "high" as const,
      deal_id: d.id,
      title: d.title,
      action: `Stalled ${Math.round((now - new Date(d.updated_at as string).getTime()) / 86400000)}d in "${stageMap.get(d.stage_id as string)?.label ?? "stage"}". Send a re-engagement note or move to lost.`,
    })),
    ...closingSoon.slice(0, 5).map((d) => ({
      priority: "high" as const,
      deal_id: d.id,
      title: d.title,
      action: `Expected close within 7 days — confirm final terms and signature path.`,
    })),
    ...noNextStep.slice(0, 5).map((d) => ({
      priority: "medium" as const,
      deal_id: d.id,
      title: d.title,
      action: "No expected close date set — schedule one or downgrade the stage.",
    })),
  ];

  return ok({
    ok: true,
    subagent: "sales-pipeline",
    summary: `${totalOpen} open deal(s) · $${(totalValueCents / 100).toLocaleString()} pipeline · $${Math.round(weightedCents / 100).toLocaleString()} weighted · ${stalled.length} stalled · ${closingSoon.length} closing this week.`,
    kpis: {
      open_count: totalOpen,
      pipeline_value_cents: totalValueCents,
      weighted_value_cents: Math.round(weightedCents),
      stalled_count: stalled.length,
      closing_this_week: closingSoon.length,
    },
    recommendations,
    confidence: "high",
    requires_approval: false,
    sources: ["deals", "pipeline_stages"],
  });
});
