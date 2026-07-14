// marketplace-install — the universal install entry point for the marketplace
// registry (Client Experience epic / Marketplace Registry Spine).
//
// Why an edge function and not just the RPC: a kb_pack item's docs are only
// retrievable once their chunks are embedded via Voyage, and Postgres cannot call
// Voyage. So this function does the ONE thing SQL can't — embed + insert the KB
// docs (reusing the proven kb-ingest path) — and then hands the resulting doc IDs
// to install_marketplace_item(), which atomically flips skills, records the exact
// provenance, and writes the §17 ledger. A pure skill item (no kb_pack) skips the
// embedding and installs via the RPC alone; Paige can also call that RPC straight
// from chat (§10) without this function.
//
// BUNDLES (Wave 1): installing a bundle fans out to its children inside the RPC.
// A config-only child installs fully in-SQL; a child that carries a kb_pack is
// created active-but-embedding_pending and returned in the receipt's
// `children_deferred_embedding` list. This function then embeds each such child's
// docs and calls install_marketplace_item(child_slug, docIds) — which lands in the
// RPC's FINALIZE branch (fills kb_doc_ids, clears embedding_pending; does NOT
// re-ledger, re-count, or change held_directly). §13: the receipt reports exactly
// which children were embedded vs. left KB-pending (e.g. if Voyage is down).
//
// Authorization is enforced server-side against the caller's JWT (the target
// tenant is authorized via the gated RPCs, never trusted from the payload — §9/§13).
// §13 honesty: the receipt reports what actually embedded/installed. If a doc can't
// embed (e.g. VOYAGE_API_KEY down) it is NOT counted as seeded and the orphan row
// is removed, so the KB never fills with phantom un-searchable entries.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { voyageEmbed } from "../_shared/voyage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  item_slug: z.string().min(1).max(120).regex(/^[a-z0-9_]+$/),
  tenant_id: z.string().uuid().optional(), // platform-owner override; ignored otherwise
  installed_by_agent: z.string().max(40).optional(), // 'paige' when driven from chat
});

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Embed + insert every kb_pack doc in a version manifest for one item, returning
// the IDs of the docs that were ACTUALLY seeded (embedded 1:1) — never a phantom.
// Shared by the top-level item and each deferred bundle child so the honesty rules
// (exact vector/chunk alignment, orphan cleanup) live in exactly one place (§12/§13).
async function embedManifestKbDocs(
  admin: SupabaseClient,
  tenantId: string,
  itemSlug: string,
  manifest: Record<string, unknown>,
  userId: string,
  warnings: string[],
): Promise<string[]> {
  const seededDocIds: string[] = [];
  const kb = (manifest?.kb_pack ?? null) as { docs?: unknown[] } | null;
  const docs: any[] = Array.isArray(kb?.docs) ? kb!.docs! : [];
  for (const d of docs) {
    const title = String(d?.title ?? "").slice(0, 300);
    const content = String(d?.content ?? "");
    if (!title || !content.trim()) { warnings.push(`skipped a doc with empty title/content`); continue; }
    const chunks = chunkText(content);
    if (chunks.length === 0) { warnings.push(`"${title}" had no chunkable content`); continue; }

    // Insert the doc row (service role — authorization already confirmed by caller).
    const tags = Array.isArray(d?.tags) ? d.tags.slice(0, 20).map((t: any) => String(t)) : [];
    const { data: doc, error: docErr } = await admin
      .from("tenant_knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title,
        content,
        summary: d?.summary ? String(d.summary).slice(0, 2000) : null,
        category: d?.category ? String(d.category).slice(0, 100) : "onboarding",
        tags: [...new Set([`marketplace:${itemSlug}`, ...tags])],
        source: "sync",
        share_to_network: false,
        network_review_status: "none",
        token_count: Math.ceil(content.length / 4),
        chunk_count: chunks.length,
        created_by: userId,
      })
      .select("id")
      .single();
    if (docErr || !doc) { warnings.push(`"${title}" could not be saved: ${docErr?.message ?? "insert failed"}`); continue; }

    // Embed the chunks. document input type for stored content.
    let vecs: number[][] = [];
    try {
      vecs = await voyageEmbed(chunks, { inputType: "document" });
    } catch (e) {
      vecs = [];
      warnings.push(`embedding unavailable — "${title}" not seeded (${(e as Error).message})`);
    }
    // A short/misaligned return would pair the wrong vector with the wrong chunk
    // text (positional index). Never store a guess: require exact 1:1 alignment or
    // fail the doc (§13).
    if (vecs.length !== chunks.length || vecs.some((v) => !Array.isArray(v) || v.length === 0)) {
      await admin.from("tenant_knowledge_docs").delete().eq("id", doc.id);
      if (vecs.length > 0) {
        warnings.push(`"${title}" embedding was misaligned (${vecs.length}/${chunks.length}) — not seeded`);
      }
      continue;
    }
    const rows = vecs.map((embedding, i) => ({
      tenant_id: tenantId,
      doc_id: doc.id,
      chunk_index: i,
      content: chunks[i],
      embedding,
      token_count: Math.ceil(chunks[i].length / 4),
    }));

    if (rows.length === 0) {
      // Nothing embedded → not retrievable → not a real seed. Remove the orphan (§13).
      await admin.from("tenant_knowledge_docs").delete().eq("id", doc.id);
      continue;
    }
    await admin.from("tenant_knowledge_chunks").insert(rows);
    if (rows.length !== chunks.length) {
      await admin.from("tenant_knowledge_docs").update({ chunk_count: rows.length }).eq("id", doc.id);
      warnings.push(`"${title}" partially embedded (${rows.length}/${chunks.length} chunks)`);
    }
    seededDocIds.push(doc.id);
  }
  return seededDocIds;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    // User-scoped client — carries the caller's JWT so the gated RPCs see the real
    // auth.uid() and enforce is_platform_owner()/is_tenant_admin().
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    // Service client — used ONLY to read manifests and write KB rows AFTER the
    // caller's authorization for the tenant has been confirmed.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = auth.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { item_slug, installed_by_agent } = parsed.data;

    // Resolve the target tenant. A tenant_id override is only honored for a
    // platform owner; everyone else installs into their own active tenant.
    let tenantId = parsed.data.tenant_id ?? null;
    const { data: isOwner } = await userClient.rpc("is_platform_owner");
    if (tenantId && !isOwner) tenantId = null; // ignore spoofed override
    if (!tenantId) {
      const { data: prof } = await admin
        .from("profiles").select("active_tenant_id").eq("user_id", userId).maybeSingle();
      tenantId = prof?.active_tenant_id ?? null;
    }
    if (!tenantId) return json({ error: "No active tenant for this user" }, 400);

    // Authorization probe: this RPC RAISES 42501 unless the caller is the platform
    // owner or an admin of tenantId. Confirm BEFORE we spend embed calls / write rows.
    const { error: gateErr } = await userClient.rpc("marketplace_catalog_for_tenant", {
      _tenant_id: tenantId,
    });
    if (gateErr) {
      const forbidden = /not authorized/i.test(gateErr.message);
      return json({ error: forbidden ? "Not authorized for this tenant" : gateErr.message },
        forbidden ? 403 : 400);
    }

    // Load the item + its current published version manifest.
    const { data: item, error: itemErr } = await admin
      .from("marketplace_items")
      .select("id, slug, item_type, status, current_version_id")
      .eq("slug", item_slug)
      .maybeSingle();
    if (itemErr) return json({ error: itemErr.message }, 400);
    if (!item) return json({ error: `marketplace item ${item_slug} not found` }, 404);
    if (!item.current_version_id) return json({ error: `item ${item_slug} has no published version` }, 409);

    const { data: version, error: verErr } = await admin
      .from("marketplace_item_versions")
      .select("id, semver, install_manifest")
      .eq("id", item.current_version_id)
      .maybeSingle();
    if (verErr || !version) return json({ error: verErr?.message ?? "version not found" }, 400);

    const manifest = (version.install_manifest ?? {}) as Record<string, any>;

    // Idempotency: if an active install already exists, don't re-embed — return the
    // RPC's already-installed receipt (the RPC is the single source of truth).
    const { data: existing } = await admin
      .from("marketplace_installs")
      .select("id, status")
      .eq("tenant_id", tenantId).eq("item_id", item.id).maybeSingle();

    const warnings: string[] = [];
    let seededDocIds: string[] = [];

    if (!existing || existing.status !== "active") {
      // Embed + insert THIS item's own kb_pack docs (the part SQL can't do). For a
      // bundle whose own manifest carries no kb_pack this is a no-op; its children
      // are embedded below.
      seededDocIds = await embedManifestKbDocs(admin, tenantId, item.slug, manifest, userId, warnings);
    }

    // Finalize: flip skills, fan out the bundle, record provenance (incl. the doc
    // IDs we just seeded), write the ledger — all atomic + idempotent in the RPC.
    const { data: receipt, error: rpcErr } = await userClient.rpc("install_marketplace_item", {
      _tenant_id: tenantId,
      _item_slug: item_slug,
      _seeded_kb_doc_ids: seededDocIds,
      _installed_by_agent: installed_by_agent ?? null,
    });
    if (rpcErr) {
      // Roll back the KB rows we optimistically inserted so a failed finalize
      // doesn't leave un-tracked docs behind.
      if (seededDocIds.length) {
        await admin.from("tenant_knowledge_docs").delete().in("id", seededDocIds);
      }
      const forbidden = /not authorized/i.test(rpcErr.message);
      return json({ error: rpcErr.message }, forbidden ? 403 : 400);
    }

    const rec = (receipt ?? {}) as Record<string, unknown>;

    // A parallel install won the race: the RPC returned the already-active receipt
    // and did NOT record the docs we just embedded (its seeded_refs are the
    // winner's). Delete our now-unreferenced batch so it can't strand orphaned,
    // un-searchable KB (§13). The winner's docs are untouched.
    if (rec.already_installed === true && seededDocIds.length) {
      await admin.from("tenant_knowledge_docs").delete().in("id", seededDocIds);
      warnings.push("this item was already installed — no duplicate knowledge was added");
    }

    // ── BUNDLE FAN-OUT: finalize each deferred kb_pack child ────────────────────
    // The RPC created each kb-carrying child active-but-embedding_pending and listed
    // it here. Embed its docs and call the RPC again per child (FINALIZE branch:
    // fills kb_doc_ids, clears the pending flag — no re-ledger/re-count). Each child
    // is independent: one child's embedding failure never blocks the others, and is
    // reported honestly rather than silently leaving a phantom-KB install (§13).
    const deferred = Array.isArray(rec.children_deferred_embedding)
      ? (rec.children_deferred_embedding as any[]) : [];
    const bundleChildren: Record<string, unknown>[] = [];
    for (const child of deferred) {
      const childSlug = String(child?.item_slug ?? "");
      if (!childSlug) continue;

      const { data: childItem } = await admin
        .from("marketplace_items")
        .select("id, slug, current_version_id")
        .eq("slug", childSlug).maybeSingle();
      if (!childItem?.current_version_id) {
        warnings.push(`bundle child "${childSlug}" has no published version — its knowledge was not seeded`);
        bundleChildren.push({ item_slug: childSlug, ok: false, reason: "no published version" });
        continue;
      }
      const { data: childVer } = await admin
        .from("marketplace_item_versions")
        .select("install_manifest")
        .eq("id", childItem.current_version_id).maybeSingle();
      const childManifest = (childVer?.install_manifest ?? {}) as Record<string, any>;

      const childWarnings: string[] = [];
      const childDocIds = await embedManifestKbDocs(admin, tenantId, childSlug, childManifest, userId, childWarnings);
      childWarnings.forEach((w) => warnings.push(`[${childSlug}] ${w}`));

      // Finalize the child (docIds present → FINALIZE branch clears embedding_pending).
      // If nothing embedded (childDocIds empty), the RPC is a no-op and the child
      // stays KB-pending — surfaced as a warning, not a silent success.
      const { data: childReceipt, error: childErr } = await userClient.rpc("install_marketplace_item", {
        _tenant_id: tenantId,
        _item_slug: childSlug,
        _seeded_kb_doc_ids: childDocIds,
        _installed_by_agent: installed_by_agent ?? null,
      });
      if (childErr) {
        if (childDocIds.length) {
          await admin.from("tenant_knowledge_docs").delete().in("id", childDocIds);
        }
        warnings.push(`bundle child "${childSlug}" could not be finalized: ${childErr.message}`);
        bundleChildren.push({ item_slug: childSlug, ok: false, reason: childErr.message });
        continue;
      }
      if (childDocIds.length === 0) {
        warnings.push(`bundle child "${childSlug}" is active but its knowledge is still pending (embedding unavailable) — retry to seed it`);
      }
      bundleChildren.push({
        item_slug: childSlug,
        ok: true,
        kb_docs_seeded: childDocIds.length,
        status: (childReceipt as Record<string, unknown>)?.status ?? null,
      });
    }

    return json({ ...rec, warnings, ...(deferred.length ? { bundle_children: bundleChildren } : {}) });
  } catch (e) {
    console.error("[marketplace-install] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
