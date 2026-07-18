// _shared/studio-brain.ts — the Vibe Studio's brain (#310, §7/§8/§15).
//
// The Studio does NOT get its own knowledge store — the platform already has a two-tier
// vector KB (tenant_knowledge_docs / tenant_knowledge_chunks / match_tenant_knowledge,
// Voyage 1024-dim), the same one paige-ai-chat retrieves from. This is the ONE seam that
// lets the Studio's generators (growth-page-draft / growth-funnel-draft / growth-form-draft)
// draft against the tenant's OWN knowledge instead of generic-to-the-brief (§18 — extend the
// existing KB, never fork a second retriever; §12 — one home, shared by all three generators).
//
// Two exports:
//   retrieveTenantKnowledge() — embed the brief, pull the top-k most relevant tenant chunks.
//   buildKnowledgeBlock()     — turn those chunks into a SYSTEM-prompt block, size-capped.
//
// Doctrine:
//   §13 — NON-FATAL by construction. No VOYAGE key, no tenant, an embed/RPC error, or an empty
//         KB all resolve to "" so the generator degrades to its brand/playbook-only prompt
//         rather than failing. A page that drafts without KB context is still a real page; a
//         500 because the KB was slow is not.
//   §9  — reads ONLY the tenant_id the CALLER already resolved server-side (never the request
//         body). match_tenant_knowledge is SECURITY DEFINER over an explicit p_tenant_id, so
//         passing a foreign tenant would be an IDOR — callers MUST pass the tenant they pinned
//         via current_user_tenant_id() (JWT path) or the service-role-named tenant (§10).
//   §15 — the block frames chunks as the practice's own source material to GROUND in, and says
//         plainly they do NOT license inventing anything beyond them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { embeddingsCompat } from "./voyage.ts";

export interface KnowledgeChunk {
  content: string;
  similarity: number;
  title?: string;
}

/**
 * Retrieve the tenant's own knowledge most relevant to a brief. Returns [] on ANY problem
 * (no tenant, short brief, missing VOYAGE key, embed/RPC failure) — the caller degrades to
 * brand/playbook-only context (§13). `tenantId` MUST be a server-resolved tenant the caller
 * is entitled to (§9) — this function trusts it and passes it straight to the SECURITY DEFINER
 * RPC.
 */
export async function retrieveTenantKnowledge(
  tenantId: string | null,
  brief: string,
  matchCount = 5,
): Promise<KnowledgeChunk[]> {
  const q = (brief ?? "").trim();
  if (!tenantId || q.length < 5) return [];

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return [];

  try {
    const r = await embeddingsCompat("voyage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: q.slice(0, 2000) }),
    });
    if (!r.ok) {
      console.warn("studio-brain: embed failed:", r.status);
      return [];
    }
    const j = await r.json();
    const vec = j?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) return [];

    const admin = createClient(url, serviceKey);
    const { data, error } = await admin.rpc("match_tenant_knowledge", {
      p_tenant_id: tenantId,
      p_query_embedding: vec as unknown as string,
      p_match_count: Math.min(Math.max(matchCount, 1), 10),
    });
    if (error) {
      console.warn("studio-brain: match_tenant_knowledge failed:", error.message);
      return [];
    }
    return (Array.isArray(data) ? data : [])
      .map((row: Record<string, unknown>) => ({
        content: typeof row?.content === "string" ? row.content : "",
        similarity: Number(row?.similarity ?? 0),
        title: typeof row?.title === "string" ? row.title : undefined,
      }))
      .filter((c) => c.content.trim().length > 0);
  } catch (e) {
    console.warn("studio-brain: retrieval failed:", (e as Error)?.message);
    return [];
  }
}

/**
 * Turn retrieved tenant knowledge into a SYSTEM-prompt block. Keeps only chunks above a
 * relevance floor (a weak semantic match is noise, not signal) and hard-caps total size so a
 * large KB can never blow the prompt budget. Returns "" when nothing relevant survived — the
 * caller then omits the block entirely (§13, degrade cleanly).
 */
export function buildKnowledgeBlock(
  chunks: KnowledgeChunk[],
  opts?: { minSimilarity?: number; maxChars?: number; maxChunks?: number },
): string {
  const min = opts?.minSimilarity ?? 0.25;
  const maxChars = opts?.maxChars ?? 2400;
  const maxChunks = opts?.maxChunks ?? 5;

  const kept = chunks
    .filter((c) => c.content.trim().length >= 40 && c.similarity >= min)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxChunks);
  if (!kept.length) return "";

  let budget = maxChars;
  const snippets: string[] = [];
  for (const c of kept) {
    if (budget <= 40) break;
    const take = c.content.trim().replace(/\s+/g, " ").slice(0, Math.min(600, budget));
    if (take.length < 40) continue;
    snippets.push(`- ${take}`);
    budget -= take.length;
  }
  if (!snippets.length) return "";

  return (
    `\n\nWHAT THIS PRACTICE ACTUALLY KNOWS — excerpts from this business's OWN knowledge base ` +
    `(their materials, methods, offers, proof, and the language they and their clients use). ` +
    `Ground the copy in these specifics — reuse their real terminology, offers, and framing so ` +
    `the result reads native to THEM, not a generic template. This is source material to draw ` +
    `from, NOT text to quote verbatim or print on the page, and it does NOT license inventing ` +
    `anything beyond what's here (§15):\n${snippets.join("\n")}`
  );
}
