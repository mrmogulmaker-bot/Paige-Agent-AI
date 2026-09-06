// export-document — turn a document a workspace ALREADY created (a marketing_content row, kind
// 'document', the output of document_generate) into a real, DOWNLOADABLE file (pdf / docx / pptx / md)
// and return a private, 30-day signed URL. Admin|coach only.
//
// WHY THIS EXISTS (§18/§13). The binary renderer (_shared/doc-render.ts) and the model router's
// persist+sign lane already existed and were UNREACHED — no caller ever invoked the doc-render
// modality, so `document_generate` produced only on-canvas block-JSON (a browser Print→PDF was the
// only "download"). This function is the missing caller: it reads a document the tenant owns, renders
// it to a real file via `callModel("doc-render", …)` — which uploads the bytes to the private,
// tenant-scoped `studio-deliverables` bucket, mints a 30-day signed URL, and writes a
// `studio_deliverable` provenance row — and returns that URL. It is the callable seam (§10): Paige's
// `document_generate` invokes it when a caller asks for a downloadable format, and a future download
// control can call it too.
//
// TENANT ISOLATION (§9). The source document is read with the CALLER's JWT client, so RLS scopes the
// read to the caller's own tenant — a caller can only export a document they can already see. The
// tenant the file is filed under is the ROW's tenant_id (RLS-confirmed), never a value from the body.
//
// HONEST DEGRADE (§13/§32). Each doc-render format is independently fail-closed: if a format's lib
// cannot load on the Deno runtime it returns needs_config, and this function reports that honestly
// (never a broken or empty file). md is a pure serializer and never degrades. The Rail records the
// true outcome (succeeded / failed / outcome_unknown) via record_capability_run (service-role).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { callModel } from "../_shared/model-router.ts";
import { recordCapabilityRun } from "../_shared/capability-record.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The formats the in-band renderer serves today. Owner MVP set is md/docx/pptx/pdf; xlsx (a different,
// tabular content model needing a new lib) is a named follow-up, so it is deliberately NOT offered here
// rather than accepted and silently failed (§13).
const FORMATS = new Set(["pdf", "docx", "pptx", "md"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "No authorization header" });
    const authed = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await authed.auth.getUser();
    if (uErr || !user) return json(401, { error: "Unauthorized" });
    const { data: roleRows } = await authed.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows || []).map((r: any) => r.role);
    if (!roles.some((r: string) => r === "admin" || r === "super_admin" || r === "coach")) {
      return json(403, { error: "Admin or coach access required." });
    }

    const body = await req.json().catch(() => ({}));
    const format = String(body?.format ?? "").toLowerCase();
    const contentId = String(body?.content_id ?? "");
    if (!FORMATS.has(format)) {
      return json(400, { error: `Unsupported format "${format}". Choose one of: pdf, docx, pptx, md.` });
    }
    if (!UUID_RE.test(contentId)) {
      return json(400, { error: "A valid document content_id is required." });
    }

    // §9 — read the source document with the CALLER's JWT client; RLS confirms they own it. A row they
    // cannot see returns null (indistinguishable from missing), which is the correct fail-closed.
    const { data: doc, error: docErr } = await authed
      .from("marketing_content")
      .select("id, tenant_id, title, body, kind")
      .eq("id", contentId)
      .maybeSingle();
    if (docErr) return json(500, { error: "Could not read that document." });
    if (!doc) return json(404, { error: "Document not found, or you don't have access to it." });
    if (doc.kind !== "document") {
      return json(400, { error: "That content isn't a document — only documents can be exported to a file." });
    }
    const tenantId = doc.tenant_id as string | null;
    if (!tenantId) return json(422, { error: "That document has no workspace and cannot be exported." });

    // §9/§59 — CLOSE THE GLOBAL-ADMIN IDOR (the §39 peer-gate's blocking finding). `marketing_content`'s
    // RLS carries an OR-branch that grants the GLOBAL `admin` app_role a cross-tenant read, and EVERY
    // tenant owner/admin holds that global role (the tenant_members→user_roles sync). So the caller-JWT
    // read above does NOT by itself scope to the caller's tenant — a tenant-A admin could read a tenant-B
    // document by id. Per §59, a new by-id data-EXPORT reader must RE-ENFORCE caller scope IN-BODY rather
    // than trust the grant. Require membership of the DOC's tenant. Cross-tenant authority is ALWAYS the
    // platform-operator role (super_admin/platform_admin) — never the tenant-level app_role: an operator
    // legitimately spans tenants (the operator seam), a tenant admin never does. (The pre-existing RLS
    // OR-branch is a platform-wide §9/§59 gap reachable via raw PostgREST — filed as its own follow-up;
    // this gate closes the export vector regardless.)
    const isOperator = roles.some((r: string) => r === "super_admin" || r === "platform_admin");
    if (!isOperator) {
      const { data: isMember } = await authed.rpc("is_tenant_member", { _tenant: tenantId });
      if (!isMember) return json(403, { error: "You don't have access to that document's workspace." });
    }

    // The document body is the block JSON document_generate saved: `{ docType, title, blocks }`. Unwrap
    // to the blocks array; renderDoc coerces defensively, so a legacy/plain body still produces a file.
    let content: unknown = doc.body;
    if (typeof doc.body === "string") {
      try {
        const parsed = JSON.parse(doc.body);
        content = Array.isArray(parsed?.blocks) ? parsed.blocks : parsed;
      } catch {
        content = doc.body; // not JSON — hand the raw text to the renderer's markdown/plain path
      }
    }
    const title = (typeof body?.title === "string" && body.title.trim())
      ? body.title.trim().slice(0, 200)
      : String((doc.title as string) ?? "Document").slice(0, 200);

    const service = createClient(supabaseUrl, supabaseServiceKey);
    // Rail record is for TENANT (member) callers. `record_capability_run` requires the actor to be a
    // member of the target tenant (§52), so an OPERATOR export (super_admin/platform_admin, not a member)
    // would raise CAPABILITY_RUN_FORBIDDEN and log a false-alarm error for a legitimate God action. An
    // operator export is still audited via the studio_deliverable provenance row + the router audit, so
    // we skip the Rail row for operators rather than emit a spurious error (§5 finding; §13 — loud logs
    // for real faults only).
    const record = (outcome: Parameters<typeof recordCapabilityRun>[1]["outcome"]) =>
      isOperator
        ? Promise.resolve(false)
        : recordCapabilityRun(service, { tenantId, actorId: user.id, capabilityKey: "document_export", outcome });

    let rendered: Awaited<ReturnType<typeof callModel>>;
    try {
      rendered = await callModel(
        "doc-render",
        "frontier",
        { format, title, content },
        { tenantId, actorUserId: user.id, callerFunction: "export-document" },
      );
    } catch (e) {
      // A pre-produce throw: nothing was rendered or persisted. Honest `failed` (§947 — writeAttempted
      // is false; the deliverable never reached storage).
      await record("capability_failed");
      console.error("[export-document] render threw:", (e as Error)?.message);
      return json(200, { success: false, status: "failed", format, note: "The file could not be produced." });
    }

    // Honest degrade: the format's renderer lib isn't available on the runtime yet (or HTML fidelity is
    // deferred) — say so, never a broken file. The act did not complete; nothing was delivered.
    if (rendered?.needs_config) {
      await record("capability_outcome_unknown");
      return json(200, {
        success: false,
        needs_config: true,
        format,
        note: `The ${format.toUpperCase()} exporter isn't available on the server yet. PDF and Markdown are the most reliable.`,
      });
    }
    const url = rendered?.artifact_url ?? null;
    if (!url) {
      // The render succeeded but persistence returned no URL — the file may or may not have landed.
      await record("capability_outcome_unknown");
      return json(200, { success: false, status: "unknown", format, note: "The file could not be prepared for download right now." });
    }

    await record("capability_succeeded");
    return json(200, {
      success: true,
      format,
      download_url: url,
      deliverable_id: rendered.deliverable_id ?? null,
      title,
      content_id: contentId,
    });
  } catch (err) {
    console.error("[export-document] error:", (err as Error)?.message);
    return json(500, { error: "Export failed." });
  }
});
