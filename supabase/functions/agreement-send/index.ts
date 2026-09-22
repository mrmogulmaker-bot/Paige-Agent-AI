// agreement-send — freeze, hash, mint and send (INT-163). Authenticated; `verify_jwt` default true.
//
// ORDER MATTERS MORE THAN ANYTHING ELSE IN THIS FILE. `draft -> sent` is one-way, so every step that
// can fail must fail BEFORE the status moves:
//
//   1. authorize the caller and resolve their tenant FROM THE SESSION
//   2. check the email provider is configured        <- first, because a missing key discovered at
//   3. render the document ONCE                          step 6 leaves an agreement stuck in `sent`
//   4. upload it (upsert:false), re-read, re-hash        with live tokens nobody received and no
//   5. mint one token per signer                         way back to draft
//   6. email each signer
//   7. only now: status -> sent
//
// §9 — HOW THIS DIFFERS FROM THE FUNCTION IT SITS BESIDE. `docusign-send-envelope` takes contact_id
// off the request body and resolves it against `clients` with the service-role client and no tenant
// filter, behind a guard that checks the tenant-blind `has_role()` over `user_roles`. Here the tenant
// comes from `current_user_tenant_id()` under the CALLER'S OWN JWT, every query is scoped to it, and
// the database re-proves each link by trigger even for the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderPresentedPdf, hashDocument, assertNamesAreStampable, UnrenderableNameError } from "../_shared/agreements/document.ts";
import { expiryFromNow, mintSignerToken, sha256Hex, SIGNING_TOKEN_TTL_DAYS } from "../_shared/agreements/token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ ok: false, error: "Sign in and try again." }, 401);

  // The caller's own client. Its RLS and its tenant resolution are the authority; the service-role
  // client below is only used for the writes the engine must perform itself.
  const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: userData } = await caller.auth.getUser();
  const actorId = userData?.user?.id ?? null;
  if (!actorId) return json({ ok: false, error: "Sign in and try again." }, 401);

  const { data: tenantId } = await caller.rpc("current_user_tenant_id");
  if (!tenantId) return json({ ok: false, error: "Open a workspace and try again." }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Malformed request." }, 400); }

  const agreementId = String(body.agreementId ?? "");
  const resend = body.resend === true;
  if (!agreementId) return json({ ok: false, error: "Which agreement?" }, 400);

  // ── 2) PROVIDER FIRST. Nothing is rendered, minted or moved until we know a send can happen.
  if (!Deno.env.get("RESEND_API_KEY")) {
    return json({
      ok: false,
      status: "needs_config",
      error: "No email provider is connected yet, so this agreement was not sent and nothing was changed. Connect email delivery in Settings, then send it again.",
    }, 503);
  }

  // Scoped by the caller's tenant, never by an id from the body alone.
  const { data: agreement } = await admin.from("paige_agreements")
    .select("id,tenant_id,title,body_markdown,status,expires_at,content_storage_key,content_sha256")
    .eq("id", agreementId).eq("tenant_id", tenantId).maybeSingle();
  if (!agreement) return json({ ok: false, error: "That agreement is not in this workspace." }, 404);

  if (!resend && agreement.status !== "draft") {
    return json({ ok: false, error: `This agreement is already ${agreement.status}. Draft a new one rather than resending this.` }, 409);
  }
  if (resend && !["sent", "viewed", "partially_signed"].includes(agreement.status)) {
    return json({ ok: false, error: `An agreement that is ${agreement.status} cannot be resent.` }, 409);
  }

  const { data: signers } = await admin.from("paige_agreement_signers")
    .select("id,full_name,email,signing_order,status,token_hash,token_expires_at,token_revoked_at")
    .eq("agreement_id", agreementId).eq("tenant_id", tenantId).order("signing_order", { ascending: true });

  if (!signers || signers.length === 0) {
    return json({ ok: false, error: "Add at least one signer before sending." }, 400);
  }

  // Refuse a name the signature block cannot render faithfully — BEFORE anything is sent, so nobody
  // discovers it after they have already signed. Stamping `?` would make the record wrong about the
  // one fact it exists to establish.
  try {
    assertNamesAreStampable(signers.map((s: Record<string, unknown>) => String(s.full_name ?? "")));
  } catch (e) {
    if (e instanceof UnrenderableNameError) return json({ ok: false, error: e.message, names: e.names }, 422);
    throw e;
  }

  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();
  const tenantName = (tenant?.name as string) ?? "Your business";

  // ── 3/4) Render ONCE and freeze. On a resend the document is already frozen and is NOT re-rendered:
  // the whole integrity claim is that every signer saw the same bytes.
  let contentKey = agreement.content_storage_key as string | null;
  let contentHash = agreement.content_sha256 as string | null;

  if (!contentKey || !contentHash) {
    let bytes: Uint8Array;
    try {
      bytes = await renderPresentedPdf({ title: agreement.title, bodyMarkdown: agreement.body_markdown });
    } catch (e) {
      console.error("[agreement-send] render failed", { agreementId, error: String(e) });
      return json({ ok: false, error: "This agreement could not be turned into a document. Nothing was sent." }, 422);
    }

    const key = `${tenantId}/${agreementId}/presented-${crypto.randomUUID()}.pdf`;
    const up = await admin.storage.from("paige-agreements")
      .upload(key, bytes, { contentType: "application/pdf", upsert: false });
    if (up.error) {
      console.error("[agreement-send] presented upload failed", { agreementId, error: up.error.message });
      return json({ ok: false, error: "The document could not be stored, so nothing was sent." }, 502);
    }

    // Hash what IS stored, not what we meant to store.
    const back = await admin.storage.from("paige-agreements").download(key);
    if (back.error || !back.data) {
      console.error("[agreement-send] stored document could not be re-read", { agreementId, key });
      return json({ ok: false, error: "The document could not be verified, so nothing was sent." }, 502);
    }
    const stored = new Uint8Array(await back.data.arrayBuffer());
    const storedHash = await hashDocument(stored);
    if (storedHash !== await hashDocument(bytes)) {
      console.error("[agreement-send] stored bytes differ from rendered bytes", { agreementId, key });
      return json({ ok: false, error: "The stored document did not match what was produced, so nothing was sent." }, 502);
    }
    contentKey = key;
    contentHash = storedHash;
  }

  // ── 5) Tokens. A signer already holding a LIVE link keeps it: a double-submitted send must not
  // silently kill a URL the person may already have open. An explicit resend re-mints deliberately.
  const now = new Date();
  const siteUrl = (Deno.env.get("PUBLIC_SITE_URL") ?? supabaseUrl).replace(/\/+$/, "");
  const sent: Array<{ email: string; reused: boolean }> = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const s of signers as Array<Record<string, unknown>>) {
    if (s.status === "signed" || s.status === "declined") continue;

    const live = s.token_hash && !s.token_revoked_at && s.token_expires_at &&
      new Date(String(s.token_expires_at)).getTime() > now.getTime();

    let token: string | null = null;
    if (!live || resend) {
      token = mintSignerToken();
      const { error } = await admin.from("paige_agreement_signers").update({
        token_hash: await sha256Hex(token),
        token_expires_at: expiryFromNow(now, SIGNING_TOKEN_TTL_DAYS),
        token_revoked_at: null,
      }).eq("id", s.id).eq("tenant_id", tenantId);
      if (error) {
        console.error("[agreement-send] token mint failed", { signerId: s.id, error: error.message });
        failed.push({ email: String(s.email), reason: "link could not be created" });
        continue;
      }
    }

    if (!token) {
      // A live link exists but its plaintext is gone by design, so it cannot be re-sent in an email.
      // Say so plainly instead of pretending a message went out.
      sent.push({ email: String(s.email), reused: true });
      continue;
    }

    const link = `${supabaseUrl}/functions/v1/agreement-sign?token=${token}`;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      // The sender's real contract — templateName / recipientEmail / tenantId / templateData —
      // read off an existing caller rather than assumed. `idempotencyKey` folds a retried send into
      // one message instead of mailing the signer twice; it includes the token hash so a deliberate
      // re-mint is a genuinely different message.
      body: JSON.stringify({
        templateName: "agreement-signature-request",
        recipientEmail: s.email,
        tenantId,
        idempotencyKey: `agreement-${agreementId}-${s.id}-${(await sha256Hex(token)).slice(0, 16)}`,
        templateData: {
          signer_name: s.full_name,
          tenant_name: tenantName,
          agreement_title: agreement.title,
          signing_url: link,
          expires_in_days: SIGNING_TOKEN_TTL_DAYS,
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[agreement-send] signer email failed", { signerId: s.id, status: res.status, detail: detail.slice(0, 300) });
      failed.push({ email: String(s.email), reason: "the email could not be delivered" });
      continue;
    }

    sent.push({ email: String(s.email), reused: false });
    await admin.from("paige_agreement_events").insert({
      agreement_id: agreementId, tenant_id: tenantId, signer_id: s.id,
      event_type: resend ? "resent" : "sent", actor_kind: "owner", actor_user_id: actorId,
    });
  }

  if (sent.length === 0) {
    // Nothing reached anybody, so the agreement stays a draft and can simply be sent again.
    return json({ ok: false, status: "not_sent", error: "No signer could be reached, so this agreement is still a draft.", failed }, 502);
  }

  // ── 7) Only now does the status move.
  const { error: statusError } = await admin.from("paige_agreements").update({
    status: "sent",
    sent_at: new Date().toISOString(),
    content_storage_key: contentKey,
    content_sha256: contentHash,
    expires_at: agreement.expires_at ?? expiryFromNow(now, SIGNING_TOKEN_TTL_DAYS),
  }).eq("id", agreementId).eq("tenant_id", tenantId).in("status", ["draft", "sent", "viewed", "partially_signed"]);

  if (statusError) {
    console.error("[agreement-send] status write failed after sending", { agreementId, error: statusError.message });
    // The emails ARE out. Reporting failure here would be a lie in the other direction.
    return json({
      ok: true, status: "sent", documentSha256: contentHash, sent, failed,
      warning: "The agreement was sent but its status did not update. Reload before sending again.",
    });
  }

  return json({ ok: true, status: resend ? "resent" : "sent", documentSha256: contentHash, sent, failed });
});
