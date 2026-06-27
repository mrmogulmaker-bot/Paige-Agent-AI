// DocuSign Connect webhook receiver.
// Verifies HMAC1 signature, updates envelope status, fires bridge verb on completion.
import { adminClient, corsHeaders, jsonResponse } from "../_shared/adminAuth.ts";
import { verifyDocuSignHmac } from "../_shared/webhookSig.ts";
import { fireAndForgetBridge } from "../_shared/mmaOsBridge.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const raw = await req.text();
  const secret = Deno.env.get("DOCUSIGN_WEBHOOK_HMAC_KEY");
  if (secret) {
    const sig = req.headers.get("x-docusign-signature-1");
    const ok = await verifyDocuSignHmac(secret, raw, sig);
    if (!ok) return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return jsonResponse({ error: "invalid_json" }, 400); }

  // Tolerant extraction across DocuSign Connect schemas.
  const env = (payload as any)?.data?.envelopeSummary ?? (payload as any)?.envelopeStatus ?? payload;
  const envelopeId: string | undefined = (payload as any)?.data?.envelopeId
    ?? (payload as any)?.envelopeId
    ?? env?.envelopeId;
  const rawStatus = String(env?.status ?? "").toLowerCase();
  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    completed: "completed",
    declined: "declined",
    voided: "voided",
  };
  const status = statusMap[rawStatus];

  if (!envelopeId || !status) {
    return jsonResponse({ ok: true, skipped: true });
  }

  const admin = adminClient();
  const update: Record<string, unknown> = { status };
  if (status === "completed") update.signed_at = new Date().toISOString();

  // Optional: download completed PDF URL
  if (status === "completed" && env?.documentsUri) {
    update.completed_pdf_url = env.documentsUri;
  }

  const { data: updated } = await admin
    .from("paige_signature_envelopes")
    .update(update)
    .eq("envelope_id", envelopeId)
    .select("contact_id, envelope_type")
    .maybeSingle();

  if (status === "completed" && updated) {
    fireAndForgetBridge("signature_completed", {
      envelope_id: envelopeId,
      contact_id: updated.contact_id,
      envelope_type: updated.envelope_type,
      completed_at: update.signed_at,
    });
  }

  return jsonResponse({ ok: true });
});
