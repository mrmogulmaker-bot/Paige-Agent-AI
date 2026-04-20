// Fetch economic rates from FRED (Federal Reserve Economic Data) API.
// ADMIN SETUP: Add FRED_API_KEY as a Supabase edge function secret.
// Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SERIES = [
  { id: "PRIME", name: "Bank Prime Loan Rate" },
  { id: "FEDFUNDS", name: "Federal Funds Effective Rate" },
  { id: "DGS10", name: "10-Year Treasury Constant Maturity Rate" },
  { id: "DGS30", name: "30-Year Treasury Constant Maturity Rate" },
  { id: "MORTGAGE30US", name: "30-Year Fixed Rate Mortgage Average" },
  { id: "MORTGAGE15US", name: "15-Year Fixed Rate Mortgage Average" },
  { id: "DPCREDIT", name: "Discount Window Primary Credit Rate" },
  { id: "TERMCBPER24NS", name: "Interest Rates on Personal Loans (24mo)" },
];

async function fetchSeries(seriesId: string, apiKey: string) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.error(
      `FRED ${seriesId} HTTP ${res.status} — body: ${body.slice(0, 500)}`
    );
    throw new Error(`FRED ${seriesId} ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  // Find most recent non-"." observation
  const obs = (data.observations || []).find(
    (o: any) => o.value && o.value !== "."
  );
  if (!obs) return null;
  return { value: parseFloat(obs.value), date: obs.date };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawKey = Deno.env.get("FRED_API_KEY");
    const apiKey = rawKey?.trim().replace(/[\r\n\s]/g, "") || undefined;
    console.log(
      `FRED_API_KEY status: ${
        rawKey ? `populated (raw len=${rawKey.length}, trimmed len=${apiKey?.length}, valid_format=${apiKey && /^[a-z0-9]{32}$/i.test(apiKey)})` : "NULL"
      }`
    );
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Read existing cache
    const { data: cached } = await supabase
      .from("economic_rates_cache")
      .select("*");

    const cacheMap = new Map((cached || []).map((c: any) => [c.series_id, c]));
    const now = new Date();
    const results: any[] = [];
    const toUpsert: any[] = [];

    for (const series of SERIES) {
      const existing: any = cacheMap.get(series.id);
      const isFresh =
        existing && new Date(existing.expires_at).getTime() > now.getTime();

      if (isFresh) {
        results.push(existing);
        continue;
      }

      if (!apiKey) {
        // No API key — return existing stale data if present, else skip
        if (existing) results.push(existing);
        continue;
      }

      try {
        const obs = await fetchSeries(series.id, apiKey);
        if (!obs) {
          if (existing) results.push(existing);
          continue;
        }
        const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        const row = {
          series_id: series.id,
          series_name: series.name,
          value: obs.value,
          observation_date: obs.date,
          fetched_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        };
        toUpsert.push(row);
        results.push(row);
      } catch (err) {
        console.error(`fetch ${series.id} failed`, err);
        if (existing) results.push(existing);
      }
    }

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("economic_rates_cache")
        .upsert(toUpsert, { onConflict: "series_id" });
      if (error) console.error("upsert error", error);
    }

    return new Response(
      JSON.stringify({
        success: true,
        rates: results,
        api_key_configured: !!apiKey,
        fetched_count: toUpsert.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message || String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
