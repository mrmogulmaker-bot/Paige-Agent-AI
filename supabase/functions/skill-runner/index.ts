// deno-lint-ignore-file no-explicit-any
// EXECUTES a `paige_skills` recipe (concept 1 in docs/doctrine/skills-vocabulary.md) — NOT
// a `paige_subagents` specialist (that's `delegate_to_subagent`) and NOT a `marketplace_items`
// add-on (that's the Marketplace). Dispatch is currently a switch(skill.slug); the S1b
// steps-interpreter generalizes it. See docs/doctrine/skills-vocabulary.md before editing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { gatewayCompat } from "../_shared/claude.ts";
import { forge } from "../_shared/prompt-forge.ts";
import { interpretSkill } from "../_shared/skill-interpreter.ts";
import { shouldUseInterpreter, type SkillRow, type CallerTier, type BrowseResult, type PublicBrowseResult } from "../_shared/skill-interpreter-core.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * S1b — the HOST implementation of the interpreter's injected `browse` seam (§18: the core stays pure;
 * the outbound fetch lives here, in the host that already does outbound fetches). Calls the paige-browser
 * /self-verify contract. §34 — references ONLY the env NAMES; when either is unset it degrades honestly
 * to { needs_config:true } (§13), never a fabricated observation. paige-browser always answers HTTP 200
 * with a structured observation (ok:false on failure), so a non-ok body is passed through as an honest
 * failed observation, not swallowed.
 */
// ACTIVATED 2026-08-12: the Fly host is live (paige-browser.fly.dev) and PAIGE_BROWSER_URL /
// PAIGE_BROWSER_SECRET are set as edge secrets. This redeploy is what makes skill-runner read them —
// the seam transitions from needs_config → live calling the host on the next self-verify skill run.
async function browseViaHost(args: { url: string; steps?: unknown[]; waitForSelector?: string; waitMs?: number }): Promise<BrowseResult> {
  const base = Deno.env.get("PAIGE_BROWSER_URL");
  const secret = Deno.env.get("PAIGE_BROWSER_SECRET");
  if (!base || !secret) return { needs_config: true };
  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/self-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Browser-Secret": secret },
      body: JSON.stringify({
        url: args.url,
        steps: args.steps ?? undefined,
        waitForSelector: args.waitForSelector,
        waitMs: args.waitMs,
      }),
    });
    // paige-browser answers 200 with { ok, ... } even on failure; return the parsed observation as-is.
    return await res.json();
  } catch (e) {
    // A network throw is an HONEST failed observation (§13) — never a fabricated success.
    return { ok: false, url: args.url, error: (e as Error)?.message ?? "browse fetch failed" };
  }
}

/**
 * S3b — the HOST implementation of the interpreter's injected `browsePublic` seam (§18: a SECOND browse
 * contract distinct from browseViaHost). Calls paige-browser's /browse-public-url (arbitrary public-URL
 * research). §34 — references ONLY the env NAMES; when either is unset it degrades honestly to
 * { needs_config:true } (§13). D4 — a HARD 30s per-call timeout (AbortController) with a SINGLE retry on
 * a 5xx or a timeout/network throw (short backoff), so a transient host hiccup doesn't fail a legit
 * research call while a real block/failure still returns its honest structured body. paige-browser
 * answers HTTP 200 with { ok, blocked_reason, ... } even on a guarded/failed fetch, so a non-ok body is
 * passed through as an honest observation, never swallowed. The audit row is written by the CALLER
 * (interpretSkill via service_role) — this host holds no DB creds and writes nothing (§9/§34).
 */
const PUBLIC_BROWSE_TIMEOUT_MS = 30_000; // D4 — hard per-call ceiling
async function browsePublicViaHost(args: { url: string; waitForSelector?: string; maxContentBytes?: number }): Promise<PublicBrowseResult> {
  const base = Deno.env.get("PAIGE_BROWSER_URL");
  const secret = Deno.env.get("PAIGE_BROWSER_SECRET");
  if (!base || !secret) return { needs_config: true };
  const endpoint = `${base.replace(/\/+$/, "")}/browse-public-url`;
  const payload = JSON.stringify({
    url: args.url,
    waitForSelector: args.waitForSelector,
    maxContentBytes: args.maxContentBytes,
  });

  const attempt = async (): Promise<{ status: number; body: any } | { throwErr: Error }> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PUBLIC_BROWSE_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Browser-Secret": secret },
        body: payload,
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    } catch (e) {
      return { throwErr: e as Error };
    } finally {
      clearTimeout(timer);
    }
  };

  // First try; retry ONCE on a 5xx, a 429 busy (§39 peer-gate L1 — a MAX_CONCURRENT spike is transient,
  // not a real block), or a timeout/network throw (§13 — a transient hiccup, not a real block).
  let r = await attempt();
  const transient = "throwErr" in r || (r as { status: number }).status >= 500 || (r as { status: number }).status === 429;
  if (transient) {
    await new Promise((res) => setTimeout(res, 400)); // short backoff
    r = await attempt();
  }
  if ("throwErr" in r) {
    // Both attempts threw/timed out — an HONEST failed observation (§13), never a fabricated success.
    const msg = r.throwErr?.name === "AbortError" ? `public-browse timed out after ${PUBLIC_BROWSE_TIMEOUT_MS}ms` : (r.throwErr?.message ?? "public-browse fetch failed");
    return { ok: false, url: args.url, error: msg };
  }
  if (r.status >= 500) {
    return { ok: false, url: args.url, http_status: r.status, error: `public-browse host ${r.status}` };
  }
  // 200 (allowed OR blocked) — pass the structured body through as-is (it already carries ok/blocked_reason).
  return r.body as PublicBrowseResult;
}

interface RunRequest {
  skill_slug: string;
  contact_id?: string;
  inputs?: Record<string, unknown>;
  invoker_kind?: "admin" | "coach" | "paige" | "system" | "mcp";
  invoker_user_id?: string;
  confirm_token?: string;
  // ── S1b interpreter fields (all OPTIONAL → backward-compatible with every existing caller, §37) ──
  /** Server-resolved tenant for the interpreter's forge (never a body-trusted auth claim, §9). */
  tenant_id?: string;
  /** Caller's §51/§60 tier, when the caller resolved it — enables the interpreter's server-side tier belt. */
  caller_tier?: CallerTier;
  /** Route a KNOWN (bespoke) slug through the interpreter too — ONLY for Slice 3's diff proof. Default false. */
  force_interpreter?: boolean;
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
    let runStatus: "succeeded" | "failed" | "cancelled" | "awaiting_confirm" = "succeeded";
    let runError: string | null = null;

    try {
      // Dispatch. Non-bespoke slugs (and force_interpreter) flow through the generic S1b interpreter;
      // the 4 shipped slugs stay on their bespoke handlers below — byte-identical (§58 by construction),
      // since force_interpreter defaults false and only NON-bespoke slugs otherwise take this path.
      if (shouldUseInterpreter(skill.slug, body.force_interpreter)) {
        // Resolve the tenant server-side (§9/§59). The contact's tenant is SERVER-DERIVED and therefore
        // authoritative; a body-supplied tenant_id is only trusted for a genuinely no-contact skill. If
        // both are present and DISAGREE, that's an IDOR attempt (a stranger tenant passed alongside a
        // contact) — reject, never forge under the caller-supplied tenant.
        let contactTenantId: string | null = null;
        if (body.contact_id) {
          const { data: c } = await admin.from("clients").select("tenant_id").eq("id", body.contact_id).maybeSingle();
          contactTenantId = (c?.tenant_id as string) ?? null;
        }
        if (contactTenantId && body.tenant_id && body.tenant_id !== contactTenantId) {
          throw new Error("tenant_mismatch: body tenant_id does not match the contact's tenant");
        }
        const interpTenantId = contactTenantId ?? body.tenant_id ?? null;
        const interp = await interpretSkill(
          { forge, admin, browse: browseViaHost, browsePublic: browsePublicViaHost },
          {
            skill: skill as unknown as SkillRow,
            inputs: body.inputs ?? {},
            contactId: body.contact_id ?? null,
            tenantId: interpTenantId,
            callerTier: body.caller_tier ?? null,
            actorUserId: body.invoker_user_id ?? null,
            actorRole: body.invoker_kind === "admin" ? "admin" : (body.invoker_kind ?? null),
            runId: run.id,
          },
        );
        stepsLog.push(...interp.steps_log);
        // Surface the interpreter's richer outcome honestly (§13) and map it onto the run-table's
        // CHECK-constrained status vocabulary (queued|running|succeeded|failed|cancelled|awaiting_confirm).
        // Only a genuine completion (succeeded/awaiting_approval/brief) counts as success below — a
        // policy stop (denied), an honest degrade (needs_config), or a paused input request (needs_input)
        // must NOT inflate success_count.
        outputs = { ...interp.outputs, interpreter_status: interp.status };
        switch (interp.status) {
          case "failed":
            runStatus = "failed";
            break;
          case "succeeded":
          case "awaiting_approval":
          case "brief":
            runStatus = "succeeded"; // a real completion
            break;
          case "needs_input":
            runStatus = "awaiting_confirm"; // paused for the user's format choice (Slice 4)
            break;
          case "denied":
          case "needs_config":
          default:
            runStatus = "cancelled"; // stopped before a deliverable — honest, does not count as success
            break;
        }
        runError = interp.error ?? null;
      } else {
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
          {
            const summary = sources.map((s: any, i: number) => `[${i + 1}] ${s.title ?? s.url}\n${(s.markdown ?? "").slice(0, 1500)}`).join("\n\n");
            const ai = await gatewayCompat("anthropic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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
          }
          break;
        }
        case "build_game_plan": {
          const contact_id = body.contact_id;
          if (!contact_id) throw new Error("contact_id required");
          const { data: contact } = await admin.from("clients").select("*").eq("id", contact_id).maybeSingle();
          const { data: memory } = await admin.from("client_memory").select("*").eq("client_id", contact_id).order("created_at", { ascending: false }).limit(10);
          stepsLog.push({ step: "context", memory_count: memory?.length ?? 0 });
          {
            const ai = await gatewayCompat("anthropic", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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
          const { data: contact } = await admin.from("clients").select("id, first_name, last_name, email, tenant_id").eq("id", contact_id).maybeSingle();
          if (!contact?.email) throw new Error("contact has no email on file");

          const ai = await gatewayCompat("anthropic", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
          // Resolve the tenant's per-tenant sending identity (unique shared-domain
          // address on the verified sending domain) so this client-facing doc goes
          // out under the coach's brand — never a shared hardcoded platform address.
          const { data: senderRow } = await admin.rpc("get_tenant_sender", { _tenant_id: contact.tenant_id ?? null });
          const sRow = Array.isArray(senderRow) ? senderRow[0] : senderRow;
          const fromName = sRow?.from_name || "Paige";
          const fromEmail = sRow?.from_email || "notify@mail.paigeagent.ai";
          const fromHeader = `${fromName} <${fromEmail}>`;
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromHeader,
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
          // Unreachable in practice: a non-bespoke slug is handled by the interpreter above. Kept as a
          // defensive guard in case BESPOKE_SKILL_SLUGS and the switch ever drift.
          throw new Error(`Skill '${skill.slug}' is registered but has no runtime handler. Use skill-forge to scaffold one.`);
      }
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
