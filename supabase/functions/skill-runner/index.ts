// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { gatewayCompat } from "../_shared/claude.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = "unused";

interface RunRequest {
  skill_slug: string;
  contact_id?: string;
  inputs?: Record<string, unknown>;
  invoker_kind?: "admin" | "coach" | "paige" | "system" | "mcp";
  invoker_user_id?: string;
  confirm_token?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body: RunRequest = await req.json();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: skill, error: skillErr } = await admin
      .from("paige_skills")
      .select("*")
      .eq("slug", body.skill_slug)
      .maybeSingle();
    if (skillErr || !skill) {
      return new Response(JSON.stringify({ error: `Unknown skill: ${body.skill_slug}` }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (skill.status !== "active") {
      return new Response(JSON.stringify({ error: `Skill is ${skill.status}` }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // First-N admin confirmation gate
    let needsConfirm = false;
    if (skill.require_admin_confirm_first_n > 0 && skill.run_count < skill.require_admin_confirm_first_n) {
      if (body.invoker_kind !== "admin" && !body.confirm_token) {
        needsConfirm = true;
      }
    }

    const { data: run, error: runErr } = await admin
      .from("paige_skill_runs")
      .insert({
        skill_id: skill.id,
        skill_slug: skill.slug,
        contact_id: body.contact_id ?? null,
        invoker_kind: body.invoker_kind ?? "admin",
        invoker_user_id: body.invoker_user_id ?? null,
        inputs: body.inputs ?? {},
        status: needsConfirm ? "awaiting_confirm" : "running",
      })
      .select()
      .single();
    if (runErr || !run) throw runErr ?? new Error("failed to create run");

    if (needsConfirm) {
      return new Response(
        JSON.stringify({ run_id: run.id, status: "awaiting_confirm", message: `First-${skill.require_admin_confirm_first_n} runs require admin confirmation.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const start = Date.now();
    const stepsLog: Array<Record<string, unknown>> = [];
    let outputs: Record<string, unknown> = {};
    let runStatus: "succeeded" | "failed" = "succeeded";
    let runError: string | null = null;

    try {
      // Dispatch by slug. Each branch invokes specialized tools.
      switch (skill.slug) {
        case "verify_business_sos": {
          const business_id = (body.inputs?.business_id as string) ?? null;
          if (!business_id) throw new Error("business_id required");
          const res = await fetch(`${SUPABASE_URL}/functions/v1/business-verifier`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify({ business_id, triggered_by: "skill" }),
          });
          outputs = await res.json();
          stepsLog.push({ step: "business-verifier", ok: res.ok });
          break;
        }
        case "research_to_concept_brief": {
          const topic = (body.inputs?.topic as string) ?? "";
          if (!topic) throw new Error("topic required");
          // Firecrawl search
          const fcKey = Deno.env.get("FIRECRAWL_API_KEY");
          let sources: any[] = [];
          if (fcKey) {
            const fc = await fetch("https://api.firecrawl.dev/v2/search", {
              method: "POST",
              headers: { "Authorization": `Bearer ${fcKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ query: topic, limit: 5, scrapeOptions: { formats: ["markdown"] } }),
            });
            const fcData = await fc.json();
            sources = fcData?.web ?? fcData?.data ?? [];
            stepsLog.push({ step: "firecrawl", count: sources.length });
          }
          // LLM synthesize
          if (LOVABLE_API_KEY) {
            const summary = sources.map((s: any, i: number) => `[${i + 1}] ${s.title ?? s.url}\n${(s.markdown ?? "").slice(0, 1500)}`).join("\n\n");
            const ai = await gatewayCompat("anthropic", {
              method: "POST",
              headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "You produce structured concept briefs. Output sections: Problem, Approach, Risks, Next Steps. Cite sources with [n]." },
                  { role: "user", content: `Topic: ${topic}\n\nSources:\n${summary}` },
                ],
              }),
            });
            const aiData = await ai.json();
            outputs = { brief: aiData?.choices?.[0]?.message?.content ?? "", sources };
            stepsLog.push({ step: "synthesize", ok: ai.ok });
          } else {
            outputs = { brief: "LOVABLE_API_KEY missing", sources };
          }
          break;
        }
        case "build_game_plan": {
          const contact_id = body.contact_id;
          if (!contact_id) throw new Error("contact_id required");
          const { data: contact } = await admin.from("clients").select("*").eq("id", contact_id).maybeSingle();
          const { data: memory } = await admin.from("client_memory").select("*").eq("client_id", contact_id).order("created_at", { ascending: false }).limit(10);
          stepsLog.push({ step: "context", memory_count: memory?.length ?? 0 });
          if (LOVABLE_API_KEY) {
            const ai = await gatewayCompat("anthropic", {
              method: "POST",
              headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: [
                  { role: "system", content: "You are Paige. Produce a personalized step-by-step game plan for this client. Use ACCEL/BUILD/FUND frameworks. Numbered steps, with owner + timeline per step. End with a 'next 7 days' checklist." },
                  { role: "user", content: `Client: ${JSON.stringify(contact)}\n\nRecent memory:\n${JSON.stringify(memory)}` },
                ],
              }),
            });
            const aiData = await ai.json();
            const plan = aiData?.choices?.[0]?.message?.content ?? "";
            outputs = { game_plan: plan };
            await admin.from("client_memory").insert({
              client_id: contact_id,
              memory_type: "game_plan",
              content: plan,
              metadata: { source: "skill:build_game_plan", run_id: run.id },
            });
            stepsLog.push({ step: "save_memory", ok: true });
          }
          break;
        }
        case "draft_and_email_document": {
          const contact_id = body.contact_id;
          const doc_type = (body.inputs?.doc_type as string) ?? "summary";
          const prompt = (body.inputs?.prompt as string) ?? "";
          if (!contact_id) throw new Error("contact_id required");
          const { data: contact } = await admin.from("clients").select("id, first_name, last_name, email").eq("id", contact_id).maybeSingle();
          if (!contact?.email) throw new Error("contact has no email on file");
          if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

          const ai = await gatewayCompat("anthropic", {
            method: "POST",
            headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: `You are Paige. Draft a professional client ${doc_type} in HTML (no <html>/<body> wrapper). Keep tone confident, plainspoken, compliance-safe.` },
                { role: "user", content: `Client: ${contact.first_name ?? ""} ${contact.last_name ?? ""}\n\nRequest:\n${prompt}` },
              ],
            }),
          });
          const aiData = await ai.json();
          const html = aiData?.choices?.[0]?.message?.content ?? "";
          stepsLog.push({ step: "draft", ok: ai.ok });

          // Email via Resend (already configured)
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (!resendKey) throw new Error("RESEND_API_KEY missing");
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Paige <notify@paigeagent.ai>",
              to: [contact.email],
              subject: `Your ${doc_type} from Paige`,
              html: `<div style="font-family:Inter,sans-serif;max-width:640px;margin:0 auto;padding:24px">${html}</div>`,
            }),
          });
          const emailData = await emailRes.json();
          stepsLog.push({ step: "send", ok: emailRes.ok, id: emailData?.id });

          await admin.from("communication_log").insert({
            client_id: contact_id,
            channel: "email",
            direction: "outbound",
            subject: `Your ${doc_type} from Paige`,
            body: html,
            metadata: { source: "skill:draft_and_email_document", resend_id: emailData?.id },
          }).then(() => {}).catch(() => {});

          outputs = { resend_id: emailData?.id, recipient: contact.email };
          break;
        }
        default:
          throw new Error(`Skill '${skill.slug}' is registered but has no runtime handler. Use skill-forge to scaffold one.`);
      }
    } catch (err) {
      runStatus = "failed";
      runError = (err as Error).message;
    }

    const duration_ms = Date.now() - start;
    await admin.from("paige_skill_runs")
      .update({
        status: runStatus,
        steps_log: stepsLog,
        outputs,
        duration_ms,
        error: runError,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    await admin.from("paige_skills")
      .update({
        run_count: skill.run_count + 1,
        success_count: skill.success_count + (runStatus === "succeeded" ? 1 : 0),
      })
      .eq("id", skill.id);

    return new Response(
      JSON.stringify({ run_id: run.id, status: runStatus, outputs, error: runError }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("skill-runner error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
