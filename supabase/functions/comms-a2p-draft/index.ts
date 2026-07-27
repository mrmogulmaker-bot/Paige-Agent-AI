// comms-a2p-draft — Paige drafts the A2P 10DLC brand + campaign COPY (the beat-GHL move, §36).
//
// A coach fills a SHORT form (legal business name, website, a one-line use-case hint) and Paige
// drafts the regulatory 10DLC campaign prose they would otherwise have to write themselves inside
// Twilio/TrustHub: the campaign use-case DESCRIPTION, 2–3 SAMPLE MESSAGES, and the OPT-IN flow +
// opt-in/opt-out/help message language. The coach reviews, edits, approves, and submits — WITHOUT
// ever opening Twilio or writing 10DLC compliance copy (§36 intuitiveness, §7 tenant-authored).
//
// This is a PURE DRAFT — ZERO DB writes (mirrors growth-page-draft's posture). The approved copy is
// persisted only by the separate, gated comms-a2p-submit. The MODEL call is real (§13); the actual
// TrustHub SUBMIT is not-yet-wired (createBrand/createCampaign are honest needs_config stubs) and is
// owned by comms-a2p-submit.
//
// ── CONTRACT ────────────────────────────────────────────────────────────────
// POST (JWT required; verify_jwt=true). Service-role bearer = Paige's headless agent (§10) may name
// the tenant; a JWT coach/admin has the tenant derived SERVER-SIDE and any body tenant_id is IGNORED.
//
//   Request:
//     { legal_business_name?: string, website?: string, use_case_hint?: string, tenant_id?: string }
//       - use_case_hint: free text — "appointment reminders + follow-ups for my clients", etc.
//       - tenant_id: SERVICE-ROLE CALLERS ONLY (UUID). Ignored for JWT callers (§9 IDOR-safe).
//
//   200  {
//          draft: {
//            use_case: string,               // short label — the campaign's purpose
//            campaign_description: string,    // the 10DLC regulatory description prose
//            sample_messages: string[],       // 2–3 real sample texts (no placeholders, §15)
//            optin_flow: string,              // how consumers consent to receive texts
//            optin_message: string,           // the opt-in confirmation SMS
//            optout_message: string,          // STOP handling reply
//            help_message: string             // HELP reply
//          },
//          legal_business_name: string,       // echoed back (from the form or brand), for the submit step
//          website: string
//        }
//   4xx/5xx { error: { code, message } }   // structured, non-2xx on failure (never a 200-with-error)
//   200     { needs_config: true, error }   // no model configured — HONEST degrade (§13), not a fake draft
//
// ── DOCTRINE ────────────────────────────────────────────────────────────────
//  §9  tenant is server-DERIVED (current_user_tenant_id()) for JWT callers, NEVER the body. Only a
//      service-role bearer may name a tenant. Reads (brand/playbook) use ONLY the tenant WE resolved.
//  §2  COACHING-GENERIC, HARD. A2P use-cases in the wild often mention credit/funding/lending — this
//      draft NEVER does. The default use-case + sample messages are about client management,
//      appointments, follow-ups, onboarding. No credit/funding/lender wording, even if the tenant has
//      funding enabled — regulatory copy stays neutral.
//  §3  mogul-direct voice; no "AI-powered/streamline/seamless/empower".
//  §7  tenant-authored: grounded in the tenant's real business name + Playbook persona/voice.
//  §13 real model call; structured errors; honest needs_config when no model is configured.
//  §15 no bracketed placeholders — sample messages use real, sendable wording or omit the specific.
//  §18 reuses the ONE model seam (routedChatCompletion) — no second model client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { routedChatCompletion } from "../_shared/model-router.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const fail = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: jsonHeaders });
const ok = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), { status: 200, headers: jsonHeaders });

/** Read the (gateway-verified) bearer's claims — only to decide caller KIND (service-role vs JWT). */
function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The tenant's Playbook persona (domain/role/tone) → a compact "THIS PRACTICE" block so the copy
 *  reads native to this business (§7). Lengths capped so a large Playbook can't blow the budget.
 *  Returns "" when there's nothing real to add (§13 — never fabricates a persona). */
function buildPracticeBlock(pb: unknown): string {
  const cfg = (pb ?? {}) as Record<string, unknown>;
  const p = (cfg.persona ?? {}) as Record<string, unknown>;
  const domain = str(p.domain).trim().slice(0, 120);
  const role = str(p.role).trim().slice(0, 160);
  const tone = str(p.tone).trim().slice(0, 160);
  const lines = [
    domain && `Practice domain: ${domain}`,
    role && `Who this practice serves: ${role}`,
    tone && `Voice & tone to hold: ${tone}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (!lines) return "";
  return `\n\nTHIS PRACTICE — write the copy NATIVE to this specific business, never a generic template:\n${lines}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "POST only.");

  try {
    // ── 1. Authenticate + decide caller kind ────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(401, "UNAUTHENTICATED", "A bearer token is required.");
    }
    const token = authHeader.slice("Bearer ".length).trim();
    const isServiceRole = parseJwtClaims(token)?.role === "service_role";

    // ── 2. Parse the request ────────────────────────────────────────────────
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return fail(400, "BAD_JSON", "Request body must be JSON.");
    }
    const legalNameInput = str(body?.legal_business_name).trim().slice(0, 200);
    const websiteInput = str(body?.website).trim().slice(0, 300);
    const useCaseHint = str(body?.use_case_hint).trim().slice(0, 1000);

    // ── 3. Resolve the tenant SERVER-SIDE (IDOR-safe, §9) ───────────────────
    let tenantId: string | null = null;
    if (isServiceRole) {
      const named = str(body?.tenant_id).trim();
      if (named) {
        if (!UUID_RE.test(named)) return fail(400, "INVALID_TENANT_ID", "tenant_id must be a UUID.");
        tenantId = named;
      }
    } else {
      const authed = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: uErr } = await authed.auth.getUser();
      if (uErr || !user) return fail(401, "UNAUTHENTICATED", uErr?.message || "Could not verify this session.");

      const { data: roleRows, error: rErr } = await authed.from("user_roles").select("role").eq("user_id", user.id);
      if (rErr) {
        console.error("comms-a2p-draft: role lookup failed:", rErr);
        return fail(500, "INTERNAL", `Could not read your roles: ${rErr.message}`);
      }
      const roles = (roleRows || []).map((r: { role: string }) => r.role);
      // Gate on the SAME authority comms-a2p-submit enforces (is_platform_owner() OR admin/coach of
      // the caller's own tenant), so a caller who can DRAFT can also SUBMIT — no dead-end where a bare
      // super_admin drafts copy and then hits a 403/RLS wall at submit. The owner passes via
      // is_platform_owner() even when super_admin is their only role.
      const { data: ownerFlag } = await authed.rpc("is_platform_owner");
      const canDraft = ownerFlag === true || roles.some((r: string) => r === "admin" || r === "coach");
      if (!canDraft) {
        return fail(403, "FORBIDDEN", "Admin or coach access required.");
      }
      const { data: resolved, error: tErr } = await authed.rpc("current_user_tenant_id");
      if (tErr) {
        console.error("comms-a2p-draft: tenant resolve failed:", tErr);
        return fail(500, "INTERNAL", `Could not resolve your workspace: ${tErr.message}`);
      }
      tenantId = str(resolved) || null;
    }

    // ── 4. Brand + Playbook (truthful, §13; IDOR-safe reads on the tenant WE resolved) ──
    let brandName = "";
    let tagline = "";
    let practiceBlock = "";
    if (tenantId) {
      const admin = createClient(supabaseUrl, supabaseServiceKey);
      try {
        const { data: b, error: bErr } = await admin.rpc("resolve_tenant_brand", { _tenant_id: tenantId });
        if (bErr) {
          console.warn("comms-a2p-draft: brand lookup failed, continuing without it:", bErr.message);
        } else {
          const row = Array.isArray(b) ? b[0] : b;
          if (row) {
            brandName = str(row.product_name) || str(row.tenant_name) || "";
            tagline = str(row.tagline) || "";
          }
        }
      } catch (e) {
        console.warn("comms-a2p-draft: brand lookup threw, continuing:", (e as Error)?.message);
      }
      try {
        let pb: unknown = null;
        if (isServiceRole) {
          const { data: trow } = await admin.from("tenants").select("features").eq("id", tenantId).maybeSingle();
          const f = ((trow as { features?: Record<string, unknown> } | null)?.features ?? {}) as Record<string, unknown>;
          pb = f.playbook_config ?? null;
        } else {
          const authed2 = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
          const { data: pc } = await authed2.rpc("get_paige_persona_context");
          const row = Array.isArray(pc) ? pc[0] : pc;
          if (row) pb = (row as Record<string, unknown>).playbook_config ?? null;
        }
        practiceBlock = buildPracticeBlock(pb);
      } catch (e) {
        console.warn("comms-a2p-draft: persona lookup failed, brand-only:", (e as Error)?.message);
      }
    }

    // Business name the copy is written for: the form value wins; else the tenant brand.
    const legalName = legalNameInput || brandName;

    // ── 5. The draft ────────────────────────────────────────────────────────
    const SYSTEM = `You are Paige, drafting the A2P 10DLC campaign registration copy for a client-based service business${legalName ? ` called "${legalName}"` : ""}. Carriers (via Twilio/TrustHub) review this copy to approve business texting — it must read as a legitimate, specific, compliant SMS program.

VOICE (§3): direct, confident, professional. Never use "AI-powered", "streamline", "seamless", or "empower". Write for a broad client-based-services audience — coaches, consultants, agencies, advisors, thought leaders — using inclusive words (practice, business, clients, work) rather than narrowly "coaching".

USE-CASE (§2 — HARD): this is a business-to-client relationship texting program. The DEFAULT purpose is client management: appointment reminders and confirmations, session/booking follow-ups, onboarding steps, and account/service notifications to people who are already the business's clients or who opted in. Do NOT introduce credit, funding, lending, loans, financing, "readiness/funding score", or any consumer-finance framing — EVEN IF the use-case hint mentions it — regulatory copy stays neutral and client-relationship focused. Never invent a marketing/promotional blast program the business did not describe.

NO FABRICATION, NO PLACEHOLDERS (§15): do NOT invent specifics you were not given — no fake phone numbers, prices, dates, or links. Every sample message must be a REAL, sendable text a client would actually receive. Do NOT emit any bracketed token ("[NAME]", "[DATE]", "[LINK]") — write the message so it reads complete without a missing specific (use the business name you were given; word times/dates generically like "your upcoming appointment"). Sample messages MUST include the business name and, per carrier norms, a natural opt-out reference (e.g. "Reply STOP to opt out") on at least one sample.

OPT-IN (compliance): describe a realistic, honest opt-in flow — how a client agrees to receive texts (e.g. checking a consent box on an intake/booking form, or texting a keyword) — matched to a client-based service business. Never claim purchased lists or non-consented contacts.

OUTPUT — return ONLY a single JSON object, no prose, no markdown fences:
{
  "use_case": string,               // a short label for the campaign's purpose (e.g. "Client appointment reminders & follow-ups")
  "campaign_description": string,   // 2–4 sentences: who is texted, why, and that they opted in — the carrier-facing description
  "sample_messages": string[],      // EXACTLY 2 or 3 real, complete sample texts (each <= 320 chars), no placeholders
  "optin_flow": string,             // 2–3 sentences: how clients consent to receive these texts
  "optin_message": string,          // the single confirmation SMS sent right after a client opts in
  "optout_message": string,         // the reply sent when a client texts STOP
  "help_message": string            // the reply sent when a client texts HELP
}${practiceBlock}${tagline ? `\n\nThe practice's tagline (for tone only, do not quote): "${tagline.slice(0, 200)}"` : ""}`;

    const userTurn = [
      legalName ? `Legal business name: ${legalName}` : "",
      websiteInput ? `Website: ${websiteInput}` : "",
      useCaseHint ? `What they want to text clients about: ${useCaseHint}` : "What they want to text clients about: appointment reminders, confirmations, and follow-ups for their clients.",
    ]
      .filter(Boolean)
      .join("\n");

    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: userTurn },
    ];

    // doc_draft: this is copy a human reviews before it is submitted (reasoning tier, never an open
    // model). Routed, never a hardcoded model (§14/§18).
    let parsed: Record<string, unknown> | null = null;
    try {
      const data = await routedChatCompletion("doc_draft", {
        messages,
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      const raw = str(data?.choices?.[0]?.message?.content);
      if (!raw.trim()) {
        // No completion returned — most often no model configured for this environment. Honest
        // needs_config, not a fabricated draft (§13).
        return ok({ needs_config: true, error: "model_returned_empty" });
      }
      try {
        // Strip a stray markdown fence if the model added one, then parse.
        const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        parsed = JSON.parse(cleaned) as Record<string, unknown>;
      } catch (parseErr) {
        console.error("comms-a2p-draft: unparseable model output (tail):", raw.slice(-300));
        return fail(502, "MODEL_BAD_OUTPUT", `The model did not return usable copy: ${(parseErr as Error)?.message}`);
      }
    } catch (modelErr) {
      // A configured-but-unreachable model is a real 502; a NOT-configured model surfaces earlier as
      // an empty completion. Report the real cause (§13).
      const msg = (modelErr as Error)?.message || "unknown error";
      if (/not.*configured|no.*model|missing.*key|api key/i.test(msg)) {
        console.warn("comms-a2p-draft: model not configured:", msg);
        return ok({ needs_config: true, error: "model_not_configured" });
      }
      console.error("comms-a2p-draft: model call failed:", modelErr);
      return fail(502, "MODEL_UNAVAILABLE", `Could not reach the model to draft the copy: ${msg}`);
    }

    // ── 6. Shape + cap the draft (never trust the model's lengths/shape blindly) ──
    const samplesRaw = Array.isArray(parsed?.sample_messages) ? (parsed!.sample_messages as unknown[]) : [];
    const sample_messages = samplesRaw
      .map((s) => str(s).trim().slice(0, 320))
      .filter(Boolean)
      .slice(0, 3);

    if (sample_messages.length < 2) {
      // A campaign with fewer than two real samples is not a usable draft (carriers require them).
      // Refuse rather than hand back a skeleton dressed as a success (§13).
      return fail(422, "NO_VALID_DRAFT",
        "That draft didn't produce usable sample messages. Try again with a little more detail about what you text clients.");
    }

    const draft = {
      use_case: str(parsed?.use_case).trim().slice(0, 160),
      campaign_description: str(parsed?.campaign_description).trim().slice(0, 2000),
      sample_messages,
      optin_flow: str(parsed?.optin_flow).trim().slice(0, 2000),
      optin_message: str(parsed?.optin_message).trim().slice(0, 320),
      optout_message: str(parsed?.optout_message).trim().slice(0, 320),
      help_message: str(parsed?.help_message).trim().slice(0, 320),
    };

    return ok({ draft, legal_business_name: legalName, website: websiteInput });
  } catch (e) {
    console.error("comms-a2p-draft: unhandled error:", e);
    return fail(500, "INTERNAL", (e as Error)?.message || "Failed to draft the A2P copy.");
  }
});
