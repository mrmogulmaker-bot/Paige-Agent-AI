// _shared/kb-ingest-core.ts — the ONE knowledge-ingestion pipeline (§12 — extract, never fork).
//
// The chunk → embed → write logic used to live only inside kb-ingest-doc/index.ts. The Studio
// brain's learn-from-published-work seam (studio-learn-from-artifact, #310 Slice B) needs the
// EXACT same pipeline — same 1000/150 chunking, same Voyage 1024-dim embedding, same honesty
// guard (a doc that embeds zero chunks is deleted, never left as a phantom un-retrievable row),
// same chunk_count reconcile. So it lives here once and both functions import it — a WRITE-side
// mirror of how Slice A extracted the READ side into _shared/studio-brain.ts.
//
// Doctrine:
//   §13 — HONESTY: if nothing embeds, the doc is not retrievable, so it is NOT a save. We delete
//         the orphan row and return ok:false so the caller (Paige) never claims a save that isn't
//         real. A fire is not a delivery.
//   §12 — one home; kb-ingest-doc and studio-learn-from-artifact both call ingestDoc().
import { embeddingsCompat } from "./voyage.ts";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

/** Sliding-window chunker — identical to kb-ingest-doc's original (1000 chars, 150 overlap). */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + CHUNK_SIZE, clean.length);
    out.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return out;
}

/** Embed one string via Voyage (voyage-3, 1024-dim) through the shared gateway. Throws on failure
 *  so the caller's per-chunk try/catch can drop just that chunk (kb-ingest's proven behavior). */
export async function embed(text: string): Promise<number[]> {
  const r = await embeddingsCompat("voyage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text }),
  });
  if (!r.ok) throw new Error(`embed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.data[0].embedding as number[];
}

export interface IngestDocParams {
  tenantId: string;
  title: string;
  content: string;
  source: string;            // 'upload'|'url'|'paste'|'sync'|'scan' (CHECK-constrained)
  source_url?: string | null;
  category?: string | null;
  tags?: string[];
  summary?: string | null;
  share_to_network?: boolean; // MUST stay false for auto-ingested content (§2)
  created_by?: string | null;
}

export interface IngestResult {
  ok: boolean;
  doc_id?: string;
  chunk_count: number;
  embedded: boolean;         // true only if EVERY chunk embedded
  error?: string;
  detail?: string;
}

/**
 * Run the full ingestion pipeline for one doc: insert the doc row, embed each chunk, write the
 * chunks, delete-the-orphan-on-zero-embeds (§13 honesty), and reconcile chunk_count to what
 * actually embedded.
 *
 * `admin` is a service-role client used for chunk writes + cleanup + reconcile. `opts.docClient`
 * is the client that INSERTS the doc row — pass a user-scoped (RLS) client to keep kb-ingest-doc's
 * RLS-on-insert enforcement; omit it (defaults to `admin`) for callers that have already authorized
 * the tenant server-side (the Studio seam resolves the tenant from the artifact row and checks
 * membership before calling, so it inserts via admin).
 */
export async function ingestDoc(
  // deno-lint-ignore no-explicit-any
  admin: any,
  params: IngestDocParams,
  // deno-lint-ignore no-explicit-any
  opts?: { docClient?: any },
): Promise<IngestResult> {
  const docClient = opts?.docClient ?? admin;
  const chunks = chunkText(params.content);
  if (chunks.length === 0) {
    return { ok: false, chunk_count: 0, embedded: false, error: "empty_content", detail: "Nothing to save — the content was empty after cleanup." };
  }

  const share = params.share_to_network ?? false;
  const { data: doc, error: docErr } = await docClient
    .from("tenant_knowledge_docs")
    .insert({
      tenant_id: params.tenantId,
      title: params.title,
      content: params.content,
      summary: params.summary ?? null,
      category: params.category ?? null,
      tags: params.tags ?? [],
      source: params.source,
      source_url: params.source_url ?? null,
      share_to_network: share,
      network_review_status: share ? "pending" : "none",
      token_count: Math.ceil(params.content.length / 4),
      chunk_count: chunks.length,
      created_by: params.created_by ?? null,
    })
    .select("id, tenant_id")
    .single();
  if (docErr || !doc) {
    return { ok: false, chunk_count: 0, embedded: false, error: docErr?.message ?? "insert_failed" };
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const vec = await embed(chunks[i]);
      rows.push({
        tenant_id: doc.tenant_id,
        doc_id: doc.id,
        chunk_index: i,
        content: chunks[i],
        embedding: vec,
        token_count: Math.ceil(chunks[i].length / 4),
      });
    } catch (e) {
      console.warn(`[kb-ingest-core] chunk ${i} embed failed:`, (e as Error).message);
    }
  }
  if (rows.length) {
    const { error: chunkErr } = await admin.from("tenant_knowledge_chunks").insert(rows);
    if (chunkErr) console.warn("[kb-ingest-core] chunk insert error:", chunkErr.message);
  }

  // §13 honesty: nothing embedded → the doc can't be retrieved → it's not a real save. Delete
  // the orphan and tell the truth (root cause is usually a missing/invalid VOYAGE_API_KEY).
  if (rows.length === 0) {
    await admin.from("tenant_knowledge_docs").delete().eq("id", doc.id);
    return {
      ok: false,
      chunk_count: 0,
      embedded: false,
      error: "embedding_failed",
      detail: "The entry couldn't be embedded, so it wouldn't be searchable — nothing was saved. The embedding service looks unavailable (check VOYAGE_API_KEY).",
    };
  }

  // Reconcile chunk_count to what actually embedded (row was created with the intended count).
  if (rows.length !== chunks.length) {
    await admin.from("tenant_knowledge_docs").update({ chunk_count: rows.length }).eq("id", doc.id);
  }

  return { ok: true, doc_id: doc.id, chunk_count: rows.length, embedded: rows.length === chunks.length };
}
