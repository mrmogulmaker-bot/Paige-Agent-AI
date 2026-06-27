// embed-client-financials
// ----------------------------------------------------------------------
// Builds a redacted, embedded knowledge-base brief whenever a Phase 3
// financial table row changes. One rag_documents row per (source_table,
// source_row_id) — upserted on the dedupe_key in metadata.
//
// Triggered by Postgres AFTER INSERT/UPDATE on:
//   - paige_business_credit_profiles  -> business_credit_snapshot
//   - paige_owner_credit_snapshots    -> owner_credit_snapshot
//   - paige_bank_connections          -> banking_snapshot
//   - paige_cash_flow_snapshots       -> cash_flow_snapshot
//
// Body: { source_table, source_row_id, contact_id }
// Auth: service-role only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  source_table: string;
  source_row_id: string;
  contact_id: string;
};

const TABLE_TO_TYPE: Record<string, string> = {
  paige_business_credit_profiles: "business_credit_snapshot",
  paige_owner_credit_snapshots: "owner_credit_snapshot",
  paige_bank_connections: "banking_snapshot",
  paige_cash_flow_snapshots: "cash_flow_snapshot",
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

function buildContent(
  table: string,
  row: Record<string, any>,
  contact: { full_name?: string | null; email?: string | null } | null,
): { title: string; content: string; summary: string; metadata: Record<string, unknown> } {
  const who = contact?.full_name || contact?.email || "Client";
  const meta: Record<string, unknown> = {
    source_table: table,
    source_row_id: row.id,
  };

  if (table === "paige_business_credit_profiles") {
    const lines = [
      `Business Credit Snapshot — ${who}`,
      `Business: ${row.business_legal_name ?? "—"} (EIN: ${row.ein_last4 ? "***" + row.ein_last4 : "—"})`,
      `Dun & Bradstreet Paydex: ${fmt(row.paydex_score)} | D&B Delinquency: ${fmt(row.dnb_delinquency_score)}`,
      `Experian Intelliscore: ${fmt(row.intelliscore_plus)} | Experian FSR: ${fmt(row.experian_fsr)}`,
      `Equifax Business Delinquency: ${fmt(row.equifax_business_delinquency)} | Equifax Failure: ${fmt(row.equifax_business_failure)}`,
      `Trade lines reported: ${fmt(row.trade_lines_count)} | Total tradeline balance: $${fmt(row.tradeline_total_balance)}`,
      `Last pulled: ${row.last_pulled_at ?? "—"} | Source: ${row.data_source ?? "nav"}`,
    ];
    Object.assign(meta, {
      paydex: row.paydex_score,
      intelliscore: row.intelliscore_plus,
      trade_lines_count: row.trade_lines_count,
    });
    return {
      title: `Business credit — ${who}`,
      content: lines.join("\n"),
      summary: `Paydex ${fmt(row.paydex_score)} · Intelliscore ${fmt(row.intelliscore_plus)} · ${fmt(row.trade_lines_count)} trades`,
      metadata: meta,
    };
  }

  if (table === "paige_owner_credit_snapshots") {
    const lines = [
      `Owner Credit Snapshot — ${who}`,
      `Bureau: ${row.bureau ?? "—"} | Score: ${fmt(row.score)} | Model: ${row.score_model ?? "—"}`,
      `Utilization: ${fmt(row.revolving_utilization_pct)}% | Inquiries (12mo): ${fmt(row.inquiries_12mo)}`,
      `Open accounts: ${fmt(row.open_accounts_count)} | Negative items: ${fmt(row.negative_items_count)}`,
      `Top factors: ${(row.score_factors ?? []).join(" · ") || "—"}`,
      `Snapshot date: ${row.snapshot_date ?? "—"}`,
      `Note: read-only — Paige does not run dispute workflows (Doctrine §84).`,
    ];
    Object.assign(meta, {
      bureau: row.bureau,
      score: row.score,
      snapshot_date: row.snapshot_date,
    });
    return {
      title: `Owner credit (${row.bureau ?? "?"}) — ${who}`,
      content: lines.join("\n"),
      summary: `${row.bureau ?? "?"} ${fmt(row.score)} · util ${fmt(row.revolving_utilization_pct)}%`,
      metadata: meta,
    };
  }

  if (table === "paige_bank_connections") {
    const lines = [
      `Banking Connection — ${who}`,
      `Institution: ${row.institution_name ?? "—"} | Status: ${row.status ?? "—"}`,
      `Accounts linked: ${fmt(row.accounts_count)} | Connection type: ${row.connection_type ?? "plaid"}`,
      `Last successful sync: ${row.last_synced_at ?? "—"}`,
      `Consent recorded: ${row.consent_granted_at ?? "—"}`,
    ];
    Object.assign(meta, {
      institution: row.institution_name,
      status: row.status,
      accounts_count: row.accounts_count,
    });
    return {
      title: `Banking — ${row.institution_name ?? "Plaid"} — ${who}`,
      content: lines.join("\n"),
      summary: `${row.institution_name ?? "Bank"} · ${row.status ?? "?"} · ${fmt(row.accounts_count)} accts`,
      metadata: meta,
    };
  }

  if (table === "paige_cash_flow_snapshots") {
    const lines = [
      `Cash-Flow Snapshot — ${who}`,
      `Period: last ${fmt(row.period_days ?? 30)} days (as of ${row.snapshot_date ?? "—"})`,
      `Total deposits: $${fmt(row.total_deposits)} | Total withdrawals: $${fmt(row.total_withdrawals)}`,
      `Net flow: $${fmt(row.net_flow)} | Average balance: $${fmt(row.avg_balance)}`,
      `Runway: ${fmt(row.runway_days)} days | Funding readiness score: ${fmt(row.funding_readiness_score)}/100`,
      `Volatility band: ${row.volatility_band ?? "—"}`,
    ];
    Object.assign(meta, {
      runway_days: row.runway_days,
      funding_readiness_score: row.funding_readiness_score,
      net_flow: row.net_flow,
      snapshot_date: row.snapshot_date,
    });
    return {
      title: `Cash flow — ${who}`,
      content: lines.join("\n"),
      summary: `${fmt(row.runway_days)}d runway · readiness ${fmt(row.funding_readiness_score)}/100`,
      metadata: meta,
    };
  }

  return { title: who, content: JSON.stringify(row).slice(0, 4000), summary: who, metadata: meta };
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

    const body = (await req.json()) as Body;
    const docType = TABLE_TO_TYPE[body.source_table];
    if (!docType) {
      return new Response(JSON.stringify({ error: "Unsupported source_table" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: row, error: rowErr } = await admin
      .from(body.source_table)
      .select("*")
      .eq("id", body.source_row_id)
      .maybeSingle();
    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Row not found", detail: rowErr?.message }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve contact -> client_id (auth user) for RLS gating
    const { data: contact } = await admin
      .from("contacts")
      .select("full_name, email, user_id, owner_id")
      .eq("id", body.contact_id)
      .maybeSingle();
    const clientUserId: string | null =
      (contact as any)?.user_id ?? (contact as any)?.owner_id ?? null;

    const built = buildContent(body.source_table, row, contact as any);
    const dedupeKey = `${body.source_table}:${body.source_row_id}`;
    const metadata = {
      ...built.metadata,
      contact_id: body.contact_id,
      dedupe_key: dedupeKey,
    };

    const embedding = openaiKey ? await embed(`${built.title}\n\n${built.content}`, openaiKey) : null;

    // Upsert by dedupe_key
    const { data: existing } = await admin
      .from("rag_documents")
      .select("id")
      .filter("metadata->>dedupe_key", "eq", dedupeKey)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await admin
        .from("rag_documents")
        .update({
          title: built.title,
          content: built.content,
          summary: built.summary,
          embedding,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (updErr) throw updErr;
      return new Response(JSON.stringify({ updated: existing.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ins, error: insErr } = await admin
      .from("rag_documents")
      .insert({
        document_type: docType,
        title: built.title,
        content: built.content,
        summary: built.summary,
        embedding,
        metadata,
        source: "financial_sync",
        client_id: clientUserId,
        is_anonymized: false,
        is_published: true,
        quality_score: 0.7,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ inserted: ins.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("embed-client-financials error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
