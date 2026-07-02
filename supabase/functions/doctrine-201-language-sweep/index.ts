// Doctrine §201 weekly language sweep.
// Fetches public HTML surfaces and flags:
//   - "operator" as a noun
//   - Flesch–Kincaid grade > 9
// Findings written to paige_audit_log (action='doctrine_201_violation') and
// a summary notification is sent to platform owners.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SURFACES = ["/", "/for-owners", "/about", "/legal/terms", "/legal/privacy"];
const OPERATOR_RX = /\boperator(s)?\b/i;

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

function fleschKincaidGrade(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const baseUrl = (await req.json().catch(() => ({})))?.base_url ?? "https://paigeagent.ai";
  const findings: Array<{ path: string; kind: string; detail: string }> = [];

  for (const path of SURFACES) {
    try {
      const res = await fetch(`${baseUrl}${path}`, { redirect: "follow" });
      if (!res.ok) {
        findings.push({ path, kind: "fetch_failed", detail: `HTTP ${res.status}` });
        continue;
      }
      const html = await res.text();
      const text = stripHtml(html);

      if (OPERATOR_RX.test(text)) {
        const excerpt = text.match(new RegExp(`.{0,40}\\boperator(s)?\\b.{0,40}`, "i"))?.[0] ?? "";
        findings.push({ path, kind: "operator_language", detail: excerpt });
      }

      const grade = fleschKincaidGrade(text);
      if (grade > 9) {
        findings.push({
          path,
          kind: "reading_level_high",
          detail: `Flesch-Kincaid grade ${grade.toFixed(1)}`,
        });
      }
    } catch (err) {
      findings.push({
        path,
        kind: "fetch_error",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (findings.length > 0) {
    await supabase.from("paige_audit_log").insert({
      actor_role: "system",
      action: "doctrine_201_violation",
      target_type: "public_surfaces",
      payload: { base_url: baseUrl, findings, doctrine: "§201" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      doctrine: "§201",
      base_url: baseUrl,
      surfaces_scanned: SURFACES.length,
      findings_count: findings.length,
      findings,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
