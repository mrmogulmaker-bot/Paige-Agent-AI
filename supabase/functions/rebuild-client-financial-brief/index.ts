// rebuild-client-financial-brief
// ----------------------------------------------------------------------
// Composes ONE composite "client_financial_brief" rag_documents row per
// client by fusing the latest business credit, owner credit, banking and
// cash-flow snapshots. Runs nightly via cron and is also safe to invoke
// per-contact via { contact_id }.
//
// Service-role only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function embed(text: string, key: string): Promise<number[] | null> {
  try {
    const trimmed = text.length > 8000 ? text.slice(0, 8000) : text;
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: trimmed }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

function fmt(n: unknown): string {
  if (n == null || n === "") return "—";
  if (typeof n === "number") return n.toLocaleString();
  return String(n);
}

async function rebuildOne(admin: any, openaiKey: string, contactId: string) {
  const { data: contact } = await admin
    .from("contacts")
    .select("full_name, email, user_id, owner_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { contact_id: contactId, skipped: "contact_missing" };

  const who = contact.full_name || contact.email || "Client";
  const clientUserId = contact.user_id ?? contact.owner_id ?? null;

  const [bcp, ocs, bc, cfs] = await Promise.all([
    admin.from("paige_business_credit_profiles").select("*").eq("contact_id", contactId)
      .order("last_pulled_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("paige_owner_credit_snapshots").select("*").eq("contact_id", contactId)
      .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
    admin.from("paige_bank_connections").select("*").eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
    admin.from("paige_cash_flow_snapshots").select("*").eq("contact_id", contactId)
      .order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const hasAny = bcp.data || ocs.data || (bc.data && bc.data.length) || cfs.data;
  if (!hasAny) return { contact_id: contactId, skipped: "no_financials" };

  const sections: string[] = [`Capital Readiness Brief — ${who}`];

  if (bcp.data) {
    sections.push(
      `\n## Business credit\n` +
      `Paydex ${fmt(bcp.data.paydex_score)} · Intelliscore ${fmt(bcp.data.intelliscore_plus)} · ` +
      `Equifax delinquency ${fmt(bcp.data.equifax_business_delinquency)} · ` +
      `${fmt(bcp.data.trade_lines_count)} trade lines · last pulled ${bcp.data.last_pulled_at ?? "—"}`,
    );
  }
  if (ocs.data) {
    sections.push(
      `\n## Owner credit\n` +
      `${ocs.data.bureau ?? "?"} score ${fmt(ocs.data.score)} · ` +
      `util ${fmt(ocs.data.revolving_utilization_pct)}% · ` +
      `${fmt(ocs.data.inquiries_12mo)} inquiries in 12mo · ` +
      `${fmt(ocs.data.negative_items_count)} negatives · as of ${ocs.data.snapshot_date ?? "—"}`,
    );
  }
  if (bc.data?.length) {
    const active = bc.data.filter((x: any) => x.status === "active" || x.status === "connected").length;
    const insts = bc.data.map((x: any) => x.institution_name).filter(Boolean).slice(0, 5).join(", ");
    sections.push(
      `\n## Banking\n${active}/${bc.data.length} connections active · institutions: ${insts || "—"}`,
    );
  }
  if (cfs.data) {
    sections.push(
      `\n## Cash flow\n` +
      `${fmt(cfs.data.runway_days)} day runway · readiness ${fmt(cfs.data.funding_readiness_score)}/100 · ` +
      `net $${fmt(cfs.data.net_flow)} over last ${fmt(cfs.data.period_days ?? 30)}d · ` +
      `avg balance $${fmt(cfs.data.avg_balance)}`,
    );
  }

  const readiness = cfs.data?.funding_readiness_score ?? null;
  const verdict =
    readiness == null ? "Insufficient data for a funding-readiness verdict."
      : readiness >= 75 ? "Funding-ready: strong cash flow and stable banking footprint."
      : readiness >= 50 ? "Approachable: solid foundation, address weak spots before high-stakes applications."
      : "Pre-fundability: stabilize cash flow and rebuild profile before pursuing major capital.";
  sections.push(`\n## Verdict\n${verdict}`);

  const content = sections.join("\n");
  const summary = `Readiness ${fmt(readiness)}/100 · Paydex ${fmt(bcp.data?.paydex_score)} · ${ocs.data?.bureau ?? "?"} ${fmt(ocs.data?.score)} · ${fmt(cfs.data?.runway_days)}d runway`;
  const title = `Capital readiness — ${who}`;
  const dedupeKey = `client_financial_brief:${contactId}`;
  const metadata = {
    source_table: "client_financial_brief",
    source_row_id: contactId,
    contact_id: contactId,
    dedupe_key: dedupeKey,
    funding_readiness_score: readiness,
    paydex: bcp.data?.paydex_score ?? null,
    owner_bureau: ocs.data?.bureau ?? null,
    owner_score: ocs.data?.score ?? null,
    runway_days: cfs.data?.runway_days ?? null,
    rebuilt_at: new Date().toISOString(),
  };

  const embedding = openaiKey ? await embed(`${title}\n\n${content}`, openaiKey) : null;

  const { data: existing } = await admin
    .from("rag_documents")
    .select("id")
    .filter("metadata->>dedupe_key", "eq", dedupeKey)
    .maybeSingle();

  if (existing) {
    await admin.from("rag_documents").update({
      title, content, summary, embedding, metadata,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    return { contact_id: contactId, updated: existing.id };
  }
  const { data: ins, error } = await admin.from("rag_documents").insert({
    document_type: "client_financial_brief",
    title, content, summary, embedding, metadata,
    source: "financial_sync",
    client_id: clientUserId,
    is_anonymized: false,
    is_published: true,
    quality_score: 0.8,
  }).select("id").single();
  if (error) throw error;
  return { contact_id: contactId, inserted: ins.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.includes(serviceKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    let contactIds: string[] = [];
    if (body.contact_id) {
      contactIds = [String(body.contact_id)];
    } else {
      // Union of all contacts present in any financial table
      const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString();
      const queries = await Promise.all([
        admin.from("paige_business_credit_profiles").select("contact_id"),
        admin.from("paige_owner_credit_snapshots").select("contact_id").gte("created_at", since),
        admin.from("paige_bank_connections").select("contact_id"),
        admin.from("paige_cash_flow_snapshots").select("contact_id").gte("created_at", since),
      ]);
      const ids = new Set<string>();
      for (const q of queries) for (const r of q.data ?? []) if (r.contact_id) ids.add(r.contact_id);
      contactIds = Array.from(ids);
    }

    const results: any[] = [];
    for (const id of contactIds) {
      try { results.push(await rebuildOne(admin, openaiKey, id)); }
      catch (e) { results.push({ contact_id: id, error: e instanceof Error ? e.message : String(e) }); }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("rebuild-client-financial-brief error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
