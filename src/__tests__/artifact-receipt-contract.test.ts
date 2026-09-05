/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// PAIGE CAPABILITY SYSTEM · SLICE 1 — truthful artifact-creation receipts (§13/§70/§32).
//
// Two halves, exactly like the S1 pipeline contract test, because two different things can be wrong:
//   1. The BEHAVIOUR — does `artifactProduced` correctly separate a real artifact from a
//      200-with-empty-payload (null url, empty drafts, null saved id)? This half runs the real
//      module, so it is execution proof, not a source grep.
//   2. The WIRING — is that honest decision actually applied at each of the five creation handlers
//      in the 11k-line `serve()` handler, which cannot be imported? This half asserts on its source.
//      Weaker than execution and stated as such: it catches the regression that reverts a handler
//      to an unguarded `{ success: true }` — the exact §13/§70 defect this slice closes.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function load() {
  const src = readFileSync("supabase/functions/_shared/artifact-receipt.ts", "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  // The module has NO imports at all; a runtime import here would be a regression, so throw on one.
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { artifactProduced, ARTIFACT_ABSENT_ERROR } = load();

describe("artifactProduced — a real artifact vs a 200-with-empty-payload (§13/§70)", () => {
  describe("file_url (images — the artifact is a stored file)", () => {
    it("accepts a real public URL", () => {
      expect(artifactProduced("file_url", "https://x.supabase.co/storage/v1/object/public/paige-generated/a.png")).toBe(true);
    });
    it("rejects a null URL — the generate-image 200-with-null-publicUrl path", () => {
      expect(artifactProduced("file_url", null)).toBe(false);
    });
    it("rejects undefined and empty and whitespace-only URLs", () => {
      expect(artifactProduced("file_url", undefined)).toBe(false);
      expect(artifactProduced("file_url", "")).toBe(false);
      expect(artifactProduced("file_url", "   ")).toBe(false);
    });
    it("does not accept a non-string as a file url", () => {
      expect(artifactProduced("file_url", 123 as any)).toBe(false);
      expect(artifactProduced("file_url", { url: "x" } as any)).toBe(false);
    });
  });

  describe("draft_list (copy drafting — the artifact is a non-empty list)", () => {
    it("accepts a non-empty drafts array", () => {
      expect(artifactProduced("draft_list", [{ text: "a" }])).toBe(true);
    });
    it("rejects an empty drafts array — the content-draft 200-with-[] path", () => {
      expect(artifactProduced("draft_list", [])).toBe(false);
    });
    it("rejects null/undefined/non-array", () => {
      expect(artifactProduced("draft_list", null)).toBe(false);
      expect(artifactProduced("draft_list", undefined)).toBe(false);
      expect(artifactProduced("draft_list", "not an array" as any)).toBe(false);
    });
  });

  describe("saved_id (persisted rows — the artifact is identified by a saved id)", () => {
    it("accepts a real id (uuid or scalar)", () => {
      expect(artifactProduced("saved_id", "3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(true);
      expect(artifactProduced("saved_id", "row_123")).toBe(true);
    });
    it("rejects null/undefined — the RPC-returned-no-id path", () => {
      expect(artifactProduced("saved_id", null)).toBe(false);
      expect(artifactProduced("saved_id", undefined)).toBe(false);
    });
    it("rejects empty and whitespace-only ids", () => {
      expect(artifactProduced("saved_id", "")).toBe(false);
      expect(artifactProduced("saved_id", "   ")).toBe(false);
    });
  });
});

describe("ARTIFACT_ABSENT_ERROR — honest, non-leaky failure copy (§11/§13)", () => {
  const shapes = ["file_url", "draft_list", "saved_id"] as const;
  it("has a non-empty message for every shape", () => {
    for (const s of shapes) {
      expect(typeof ARTIFACT_ABSENT_ERROR[s]).toBe("string");
      expect(ARTIFACT_ABSENT_ERROR[s].trim().length).toBeGreaterThan(0);
    }
  });
  it("never leaks a table/function name, SQLSTATE, or the word 'success'", () => {
    for (const s of shapes) {
      const msg = ARTIFACT_ABSENT_ERROR[s];
      expect(msg).not.toMatch(/marketing_content|growth_pages|save_marketing_content|growth_page_upsert|generate-image|content-draft|paige_/i);
      expect(msg).not.toMatch(/\b\d{5}\b/); // no bare SQLSTATE
      expect(msg.toLowerCase()).not.toContain("success");
    }
  });
});

describe("WIRING — each creation handler wraps its success in the honesty guard (§13/§70)", () => {
  const src = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

  it("imports the honesty module", () => {
    expect(src).toMatch(/import\s*\{[^}]*artifactProduced[^}]*\}\s*from\s*["']\.\.\/_shared\/artifact-receipt\.ts["']/);
    expect(src).toContain("ARTIFACT_ABSENT_ERROR");
  });

  // Each handler must reference the guard for the artifact shape it produces. These assert the
  // guard is PRESENT at the call site; the behaviour above proves the guard is CORRECT.
  it("generate_image guards the file url", () => {
    expect(src).toMatch(/artifactProduced\(\s*["']file_url["']/);
  });
  it("draft_marketing_content guards the drafts list", () => {
    expect(src).toMatch(/artifactProduced\(\s*["']draft_list["']/);
  });
  it("content_save, document_generate and growth_page_save guard the saved id", () => {
    const savedIdGuards = src.match(/artifactProduced\(\s*["']saved_id["']/g) ?? [];
    // three creation handlers persist a row and must each guard its returned id
    expect(savedIdGuards.length).toBeGreaterThanOrEqual(3);
  });
  it("references the honest absent-artifact error at the guarded sites", () => {
    const uses = src.match(/ARTIFACT_ABSENT_ERROR\.(file_url|draft_list|saved_id)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(5);
  });
});
