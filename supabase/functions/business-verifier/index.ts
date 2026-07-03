// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { ALL_ADAPTERS, type BusinessVerifyInput } from "../_shared/businessVerifyAdapters/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const business_id: string | undefined = body.business_id;
    const triggered_by: string = body.triggered_by ?? "system";
    if (!business_id) {
      return jsonResponse({ ok: false, error: "BUSINESS_ID_REQUIRED", message: "A business ID is required." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .select("id, owner_user_id, legal_name, dba, ein, state, city, address_line_1, postal_code, phone, website, entity_type")
      .eq("id", business_id)
      .maybeSingle();
    if (bizErr) {
      console.error("business-verifier business lookup error", bizErr);
      return jsonResponse({
        ok: false,
        error: "BUSINESS_LOOKUP_FAILED",
        message: "Business verification could not load this business. Please retry.",
        fallback: true,
      });
    }

    if (!biz) {
      return jsonResponse({
        ok: false,
        error: "BUSINESS_NOT_FOUND",
        message: "This business record is no longer available. Refresh the contact and try again.",
        business_id,
        fallback: true,
      });
    }

    // Resolve contact_id (best-effort) via owner
    let contact_id: string | null = null;
    if (biz.owner_user_id) {
      const { data: contact } = await admin
        .from("clients")
        .select("id")
        .eq("linked_user_id", biz.owner_user_id)
        .limit(1)
        .maybeSingle();
      contact_id = contact?.id ?? null;
    }

    const { data: run, error: runErr } = await admin
      .from("business_verification_runs")
      .insert({
        business_id,
        contact_id,
        triggered_by,
        status: "running",
      })
      .select()
      .single();
    if (runErr || !run) throw runErr ?? new Error("failed to create run");

    const input: BusinessVerifyInput = {
      legal_name: biz.legal_name ?? "",
      dba: biz.dba,
      ein: biz.ein,
      state: biz.state,
      city: biz.city,
      address_line_1: biz.address_line_1,
      postal_code: biz.postal_code,
      phone: biz.phone,
      website: biz.website,
      entity_type: biz.entity_type,
    };

    if (!input.legal_name) {
      await admin.from("business_verification_runs")
        .update({ status: "failed", error: "missing legal_name", completed_at: new Date().toISOString() })
        .eq("id", run.id);
      return jsonResponse({ ok: true, run_id: run.id, status: "failed" });
    }

    const results = await Promise.allSettled(
      ALL_ADAPTERS.map(async (a) => ({ adapter: a, result: await a.verify(input) })),
    );

    const rows = results.map((r) => {
      if (r.status === "fulfilled") {
        const { adapter, result } = r.value;
        return {
          run_id: run.id,
          business_id,
          source: result.source ?? adapter.source,
          source_kind: result.source_kind,
          status: result.status,
          confidence: result.confidence ?? null,
          matched_fields: result.matched_fields ?? [],
          mismatched_fields: result.mismatched_fields ?? [],
          raw_payload: result.raw_payload ?? {},
          normalized: result.normalized ?? {},
          source_url: result.source_url ?? null,
          error: result.error ?? null,
        };
      }
      return {
        run_id: run.id,
        business_id,
        source: "unknown",
        source_kind: "public",
        status: "error",
        error: String((r as PromiseRejectedResult).reason),
      };
    });

    await admin.from("business_verifications").insert(rows);

    // Composite: average confidence of successful matches; cap at 100
    const matchRows = rows.filter((r) => r.status === "match" && typeof r.confidence === "number");
    const composite = matchRows.length
      ? Math.min(100, Math.round(matchRows.reduce((s, r) => s + (r.confidence as number), 0) / matchRows.length))
      : null;

    const mismatches = rows.filter((r) => r.status === "mismatch").map((r) => ({
      source: r.source,
      fields: r.mismatched_fields,
    }));

    const finalStatus = rows.some((r) => r.status === "match")
      ? (rows.some((r) => r.status === "error" || r.status === "unavailable") ? "partial" : "succeeded")
      : "failed";

    await admin.from("business_verification_runs")
      .update({
        status: finalStatus,
        composite_score: composite,
        summary: {
          sources_run: rows.length,
          matches: rows.filter((r) => r.status === "match").length,
          unavailable: rows.filter((r) => r.status === "unavailable").length,
          errors: rows.filter((r) => r.status === "error").length,
        },
        mismatches,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return jsonResponse({ ok: true, run_id: run.id, status: finalStatus, composite_score: composite, sources: rows.length });
  } catch (err) {
    console.error("business-verifier error", err);
    return jsonResponse({
      ok: false,
      error: "BUSINESS_VERIFICATION_FAILED",
      message: "Business verification could not complete. Please retry.",
      fallback: true,
    });
  }
});
