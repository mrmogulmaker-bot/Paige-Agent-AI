// Ingest an uploaded document or scan into a tenant's private Knowledge Base.
// The client uploads the file to the `tenant-knowledge` bucket under
// `<tenant_id>/<uuid>_<name>` (RLS-scoped), then calls this with the path. We
// download it (RLS-enforced via the caller's JWT), extract text — txt/md decoded
// directly, PDF + images via Claude's native document/image blocks (OCR for
// scans) — and hand off to kb-ingest-doc (source 'upload' | 'scan'), which
// chunks + embeds it. Keeping the chunk/embed pipeline single-sourced.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { callClaude } from "../_shared/claude.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  path: z.string().min(3).max(1024), // storage path: <tenant_id>/<uuid>_<name>
  mime: z.string().max(200).optional(),
  filename: z.string().max(300).optional(),
  title: z.string().min(1).max(300).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  share_to_network: z.boolean().optional(),
  tenant_id: z.string().uuid().optional(), // platform-owner override
});

// kb-ingest-doc caps content at 500k; stay comfortably under after extraction.
const MAX_CONTENT = 480_000;

const IMAGE_MIME: Record<string, string> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Chunked base64 — spreading a big Uint8Array into btoa blows the call stack.
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function extFromPath(p: string): string {
  const base = p.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

// Resolve (source, kind) from mime + extension. kind drives extraction.
function classify(mime: string | undefined, ext: string): { kind: "text" | "pdf" | "image"; source: "upload" | "scan" } | null {
  const m = (mime || "").toLowerCase();
  if (m === "application/pdf" || ext === "pdf") return { kind: "pdf", source: "upload" };
  if (IMAGE_MIME[m] || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return { kind: "image", source: "scan" };
  if (m.startsWith("text/") || ["txt", "md", "markdown", "csv", "json"].includes(ext)) return { kind: "text", source: "upload" };
  return null;
}

const EXTRACT_PROMPT =
  "Extract the full text content of this document verbatim as clean plain text. " +
  "Preserve headings, lists, and paragraph structure. Do not summarize, add commentary, " +
  "or omit anything. If it's a scan or image, transcribe all legible text. Output only the extracted text.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Invalid authentication token" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { path, mime, filename, title, category, tags, share_to_network, tenant_id } = parsed.data;

    const ext = extFromPath(filename ?? path);
    const cls = classify(mime, ext);
    if (!cls) {
      return json({ error: "Unsupported file type. Upload a PDF, image (png/jpg/webp), or text/markdown file." }, 400);
    }

    // Download via the caller's JWT so bucket RLS enforces tenant ownership —
    // a caller can only read files under their own tenant's folder.
    const { data: blob, error: dlErr } = await supabase.storage.from("tenant-knowledge").download(path);
    if (dlErr || !blob) {
      return json({ error: "Couldn't read that file — it may have failed to upload." }, 400);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0) return json({ error: "That file was empty." }, 400);

    // Extract text.
    let content = "";
    if (cls.kind === "text") {
      content = new TextDecoder().decode(bytes).trim();
    } else {
      const b64 = toBase64(bytes);
      const block = cls.kind === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: IMAGE_MIME[(mime || "").toLowerCase()] ?? "image/png", data: b64 } };
      const result = await callClaude({
        maxTokens: 8000,
        messages: [{ role: "user", content: [block, { type: "text", text: EXTRACT_PROMPT }] }],
      });
      content = (result.text || "").trim();
    }

    if (!content || content.length < 10) {
      return json({ error: "We couldn't pull any readable text out of that file." }, 400);
    }
    if (content.length > MAX_CONTENT) content = content.slice(0, MAX_CONTENT);

    const derivedTitle = (title?.trim() || filename?.replace(/\.[^.]+$/, "") || path.split("/").pop() || "Uploaded document").slice(0, 300);

    // Hand off to kb-ingest-doc, forwarding the caller's JWT so the doc is
    // created + chunked + embedded under the SAME tenant via RLS.
    const ingestRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")!}/functions/v1/kb-ingest-doc`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        },
        body: JSON.stringify({
          title: derivedTitle,
          content,
          // category is string | undefined in kb-ingest-doc's schema — omit if absent.
          ...(category ? { category } : {}),
          tags: tags ?? [],
          source: cls.source,
          share_to_network: share_to_network ?? false,
          ...(tenant_id ? { tenant_id } : {}),
        }),
      },
    );
    const ingestBody = await ingestRes.json().catch(() => ({}));
    if (!ingestRes.ok) {
      return json({ error: (ingestBody as any)?.error ?? "Indexing failed" }, ingestRes.status);
    }
    return json({ ...ingestBody, source: cls.source }, 200);
  } catch (error) {
    console.error("[kb-ingest-file] error:", error);
    return json({ error: error instanceof Error ? error.message : "Failed to ingest file" }, 500);
  }
});
