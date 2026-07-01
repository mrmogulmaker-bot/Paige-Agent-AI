// Sub-Agent: Email Composer
// Dedicated free-form email composition with tone control. Paige delegates
// here so she doesn't burn cycles hand-writing every email. Returns a
// structured draft (subject + HTML + text + compliance flags). Does NOT send —
// caller pairs this with `send_transactional_email` after review.
//
// Doctrine §116: never name another specific client, coach, or customer of
// the platform. Archetype phrasing only ("a client", "the contact").
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Tone =
  | "professional"
  | "warm"
  | "welcoming"
  | "stern"
  | "friendly"
  | "executive"
  | "apologetic"
  | "celebratory"
  | "direct"
  | "empathetic"
  | "urgent";

interface Input {
  // Recipient context
  contact_id?: string;
  recipient_name?: string;
  recipient_email?: string;
  // Composition inputs
  intent: string;                 // "what should this email accomplish"
  key_points?: string[];          // bullet points to include
  tone?: Tone | string;           // freeform accepted; validated below
  length?: "short" | "medium" | "long";
  cta?: string;                   // desired call-to-action
  subject_hint?: string;          // optional preferred subject
  sender_name?: string;           // signature name (defaults to tenant)
  sender_title?: string;
  format?: "html" | "plain";      // default html
}

function ok(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

const ALLOWED_TONES = new Set<string>([
  "professional", "warm", "welcoming", "stern", "friendly",
  "executive", "apologetic", "celebratory", "direct", "empathetic", "urgent",
]);

const FORBIDDEN_CLAIMS = [
  /guarantee(d)? (approval|funding|results)/i,
  /remove (all|any) negative/i,
  /erase your debt/i,
  /no risk/i,
  /100% approval/i,
  /credit repair/i,
];

function complianceScan(text: string) {
  const hits: string[] = [];
  for (const rx of FORBIDDEN_CLAIMS) if (rx.test(text)) hits.push(rx.source);
  return hits;
}

function stripToText(html: string) {
  return html.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function paragraphsToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;line-height:1.55;color:#111">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let payload: { input?: Input; context?: { contact_id?: string; user_id?: string } } = {};
  try { payload = await req.json(); } catch { return ok({ ok: false, error: "Invalid JSON" }, 400); }

  const input = payload.input ?? {} as Input;
  if (!input.intent || typeof input.intent !== "string") {
    return ok({ ok: false, error: "intent required (what should this email accomplish?)" }, 400);
  }

  // Resolve recipient — either explicit or via contact_id lookup
  const contactId = input.contact_id ?? payload.context?.contact_id;
  let recipientName = input.recipient_name ?? "";
  let recipientEmail = input.recipient_email ?? "";
  let entityName = "";
  let fundingGoal = "";
  if (contactId) {
    const { data: c } = await supabase
      .from("clients")
      .select("first_name,last_name,email,entity_name,funding_goal")
      .eq("id", contactId)
      .maybeSingle();
    if (c) {
      recipientName ||= [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      recipientEmail ||= c.email ?? "";
      entityName = c.entity_name ?? "";
      fundingGoal = c.funding_goal ?? "";
    }
  }

  const rawTone = (input.tone ?? "professional").toString().toLowerCase().trim();
  const tone = ALLOWED_TONES.has(rawTone) ? rawTone : "professional";
  const length = input.length ?? "medium";
  const format = input.format ?? "html";
  const senderName = input.sender_name ?? "Mogul Maker Academy";
  const senderTitle = input.sender_title ?? "";

  const wordBudget = length === "short" ? "60-100" : length === "long" ? "220-320" : "130-190";

  let subject = input.subject_hint ?? "";
  let bodyPlain = "";

  if (!LOVABLE_API_KEY) {
    // Deterministic fallback so the tool still returns a usable draft.
    subject = subject || `Following up${entityName ? ` — ${entityName}` : ""}`;
    bodyPlain = [
      `Hi ${recipientName || "there"},`,
      "",
      input.intent,
      ...(input.key_points ?? []).map((p) => `• ${p}`),
      "",
      input.cta || "Let me know a good time to connect.",
      "",
      `— ${senderName}${senderTitle ? `\n  ${senderTitle}` : ""}`,
    ].join("\n");
  } else {
    const system = `You are the Email Composer sub-agent for Paige Agent AI.
Draft ONE email in a "${tone}" tone. Word budget: ${wordBudget} words in the body.
Hard rules:
- Never guarantee approval, funding, or results.
- Never promise to remove negatives, erase debt, or claim "no risk".
- Never use the phrase "credit repair".
- No legal or tax advice.
- Never name another specific client, coach, admin, or customer of the platform. Use archetype phrasing only ("a client", "the contact", "their business"). Doctrine §116.
- Sign off exactly as: "${senderName}${senderTitle ? `, ${senderTitle}` : ""}".
- Do NOT invent facts about the recipient beyond what is provided.

Return STRICT JSON with this shape (no markdown, no code fences):
{"subject": "<one-line subject>", "body": "<plain-text body with \\n paragraph breaks, no HTML>"}`;

    const user = [
      `Recipient name: ${recipientName || "(unknown)"}`,
      `Recipient email: ${recipientEmail || "(unknown)"}`,
      entityName ? `Business: ${entityName}` : "",
      fundingGoal ? `Funding goal: ${fundingGoal}` : "",
      `Tone: ${tone}`,
      `Length target: ${length} (${wordBudget} words)`,
      `Intent: ${input.intent}`,
      input.key_points?.length ? `Key points to include:\n- ${input.key_points.join("\n- ")}` : "",
      input.cta ? `Call to action: ${input.cta}` : "",
      input.subject_hint ? `Preferred subject: ${input.subject_hint}` : "",
    ].filter(Boolean).join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!aiRes.ok) {
      return ok({ ok: false, error: `AI gateway ${aiRes.status}`, detail: (await aiRes.text()).slice(0, 400) }, 502);
    }
    const j = await aiRes.json();
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw);
      subject = String(parsed.subject ?? subject ?? "").trim() || `Following up${entityName ? ` — ${entityName}` : ""}`;
      bodyPlain = String(parsed.body ?? "").trim();
    } catch {
      // If the model didn't return clean JSON, treat the whole payload as the body.
      bodyPlain = String(raw).trim();
      subject = subject || `Following up${entityName ? ` — ${entityName}` : ""}`;
    }
  }

  if (!bodyPlain) {
    return ok({ ok: false, error: "composer_returned_empty_body" }, 502);
  }

  const bodyHtml = format === "plain" ? "" : paragraphsToHtml(bodyPlain);
  const bodyText = format === "plain" ? bodyPlain : stripToText(bodyHtml);
  const flags = complianceScan(bodyPlain + "\n" + subject);

  return ok({
    ok: true,
    subagent: "email-composer",
    summary: `Composed ${tone} email (${length}) for ${recipientName || recipientEmail || "recipient"}${flags.length ? ` — ${flags.length} compliance flag(s)` : ""}.`,
    draft: {
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      tone_used: tone,
      length,
      word_count: bodyPlain.split(/\s+/).filter(Boolean).length,
    },
    recipient: {
      contact_id: contactId ?? null,
      name: recipientName || null,
      email: recipientEmail || null,
    },
    compliance_flags: flags,
    requires_approval: flags.length > 0,
    confidence: flags.length > 0 ? "low" : "high",
    next_action_hint: flags.length > 0
      ? "Review flagged phrasing before sending."
      : "Pass draft.subject + draft.body_html to the `send_composed_email` (or `send_transactional_email`) MCP tool.",
  });
});
