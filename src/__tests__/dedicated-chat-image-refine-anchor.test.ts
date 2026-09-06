// @vitest-environment node
//
// Task #15 — dedicated Paige chat in-place image refinement. Structural + safety-invariant guard on
// the server-owned refine anchor. The end-to-end runtime behavior (the model refining an image in
// place in an authenticated dedicated chat) is §32.c-owed to a browser-capable session; the SQL
// version-preservation behavior is proven on real Postgres by scripts/marketing-content-refine-db-proof.mjs
// (9/9). This test locks the wiring + the OWNER SAFETY CONSTRAINTS into source so a refactor cannot
// silently regress them:
//   * the trust anchor is SERVER-OWNED (read from the thread row), never an arbitrary client id;
//   * reuse in the dedicated chat happens ONLY when the model echoes the exact server anchor id;
//   * the anchor advances only on a genuine success with a FILED content_id;
//   * the Studio canvas clamp is untouched;
//   * the reuse UPDATE preserves prior versions (meta.versions snapshot before overwrite), tenant-scoped.
import { readFileSync, existsSync } from "node:fs";
import { describe, it, expect } from "vitest";

const CHAT = "supabase/functions/paige-ai-chat/index.ts";
const ANCHOR_MIG = "supabase/migrations/20261227000000_thread_image_refine_anchor.sql";
const VERSION_MIG = "supabase/migrations/20261227000001_marketing_content_reuse_preserves_versions.sql";
const chat = readFileSync(CHAT, "utf8");

describe("Task #15 — migrations exist and carry the safety clauses", () => {
  it("the anchor migration adds tenant-safe, auto-clearing anchor columns on the thread row", () => {
    expect(existsSync(ANCHOR_MIG)).toBe(true);
    const m = readFileSync(ANCHOR_MIG, "utf8");
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS last_image_content_id uuid/);
    expect(m).toMatch(/REFERENCES public\.marketing_content\(id\) ON DELETE SET NULL/); // deleted image clears the anchor
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS last_image_anchor_at timestamptz/);
  });

  it("the version-preservation migration snapshots the prior image before the tenant-scoped reuse UPDATE", () => {
    expect(existsSync(VERSION_MIG)).toBe(true);
    const m = readFileSync(VERSION_MIG, "utf8");
    // server-owned history based on the row's own meta, not caller p_meta
    expect(m).toMatch(/_versions\s*:=\s*_cur\.meta\s*->\s*'versions'/);
    // only snapshot when the image actually changes
    expect(m).toMatch(/_new_image IS NOT NULL AND _cur\.image_url IS NOT NULL AND _new_image <> _cur\.image_url/);
    // append prior image + cap
    expect(m).toMatch(/jsonb_set\(_merged_meta, '\{versions\}'/);
    expect(m).toMatch(/jsonb_array_length\(_versions\) > 20/);
    // §9 tenant scope on the reuse UPDATE is preserved
    expect(m).toMatch(/WHERE id = p_id AND tenant_id = _tenant/);
  });
});

describe("Task #15 — the server-owned anchor is wired safely into paige-ai-chat", () => {
  it("declares the request-scoped anchor + recency window", () => {
    expect(chat).toMatch(/let refineImageAnchor:\s*\{\s*id:\s*string\s*\}\s*\|\s*null\s*=\s*null;/);
    expect(chat).toMatch(/const IMAGE_REFINE_ANCHOR_WINDOW_MS\s*=/);
  });

  it("reads the anchor from the caller's own thread row (RLS-scoped), not from client input", () => {
    // the anchor columns are selected on the same tenant/caller-scoped thread read
    expect(chat).toMatch(/select\("summary, studio_session_id, last_image_content_id, last_image_anchor_at"\)/);
    // resolved only OUTSIDE Studio, only within the recency window
    expect(chat).toMatch(/!th\?\.studio_session_id && canvasArtifact == null[\s\S]{0,160}IMAGE_REFINE_ANCHOR_WINDOW_MS/);
    expect(chat).toMatch(/refineImageAnchor = \{ id: String\(th\.last_image_content_id\) \}/);
  });

  it("reuses ONLY when the model echoes the EXACT server anchor id — never an arbitrary client id", () => {
    // the dedicated-chat clamp requires target_content_id === refineImageAnchor.id (server is authority)
    expect(chat).toMatch(/!canvasArtifact && refineImageAnchor && args\.target_content_id === refineImageAnchor\.id/);
    // and it reuses the SERVER anchor's id, not the model-supplied value
    expect(chat).toMatch(/\? refineImageAnchor\.id/);
  });

  it("advances the anchor only on a genuine success with a FILED content_id, dedicated chat only", () => {
    expect(chat).toMatch(/!canvasArtifact && payloadThreadId && \(result as any\)\?\.success === true[\s\S]{0,80}artifactProduced\("saved_id", \(result as any\)\?\.content_id\)/);
    expect(chat).toMatch(/\.update\(\{ last_image_content_id: \(result as any\)\.content_id, last_image_anchor_at:/);
    // best-effort but LOGGED, never swallowed silently (§13/§32)
    expect(chat).toMatch(/refine anchor advance failed/);
  });

  it("does NOT regress the Studio canvas clamp (still keyed on canvasArtifact)", () => {
    expect(chat).toMatch(/canvasArtifact\?\.kind === "content" && args\.target_content_id === canvasArtifact\.id/);
  });
});
