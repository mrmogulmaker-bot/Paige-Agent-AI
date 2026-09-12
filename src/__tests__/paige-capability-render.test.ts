/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// The capability-status RENDER block — the authoritative system text Paige answers "what can you do
// here?" from (P0 Defect-1, §13/§36/§70). It must (a) carry the directive that it OVERRIDES the
// general tool/persona impression, (b) forbid claiming post/text/run/manage unless the item is
// available, and (c) group the resolved statuses so "planned" items read as NOT-doable-here-yet
// (honest whether the seam is unbuilt OR a raw tool exists without a governed path — §13/§70). Tested
// on the real pure module through the transpile port (it imports ONLY the type).
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";

function port(path: string) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { renderCapabilityStatusBlock } = port("supabase/functions/_shared/paige-capability-status/render.ts");

const cap = (key: string, availability: string, label: string, reason: string | null = null) =>
  ({ key, label, actionKind: "read", availability, reason });

describe("renderCapabilityStatusBlock — the authoritative 'what can you do' block", () => {
  it("returns empty string for an empty manifest (nothing to inject)", () => {
    expect(renderCapabilityStatusBlock([])).toBe("");
  });

  it("states it is authoritative and OVERRIDES the general tool/persona impression", () => {
    const out = renderCapabilityStatusBlock([cap("crm.search_contacts", "live", "See your contacts")]);
    expect(out).toMatch(/authoritative/i);
    expect(out).toMatch(/OVERRIDES/);
    expect(out).toMatch(/answer ONLY from this list/i);
  });

  it("forbids claiming post/text/run/manage unless the item is available", () => {
    const out = renderCapabilityStatusBlock([cap("x", "live", "See things")]);
    expect(out).toMatch(/NEVER say you can post to social, send a text\/SMS, run an automation, or manage the team/i);
  });

  it("puts planned items under a CAN'T-DO-HERE-YET heading that never asserts non-existence", () => {
    const out = renderCapabilityStatusBlock([
      cap("social.publish", "planned", "Post to your social accounts", "Not something Paige can do here yet — there's no governed path for it."),
    ]);
    expect(out).toMatch(/NOT SOMETHING YOU CAN DO HERE YET/i);
    expect(out).toMatch(/do NOT offer or claim/i);
    // honest framing: it must NOT tell the model the capability flatly "doesn't exist" / "isn't built"
    expect(out).not.toMatch(/NOT BUILT/i);
    expect(out).toContain("Post to your social accounts");
  });

  it("groups live / needs_approval / needs_setup / planned under distinct headings", () => {
    const out = renderCapabilityStatusBlock([
      cap("r", "live", "See your contacts"),
      cap("w", "needs_approval", "Add a contact", "Paige drafts it and you approve before it runs."),
      cap("c", "needs_setup", "Run your automations", "Needs a connection before Paige can use it."),
      cap("p", "planned", "Post to social", "Not something Paige can do here yet — there's no governed path for it."),
    ]);
    expect(out).toMatch(/CAN DO NOW/i);
    expect(out).toMatch(/CAN PREPARE FOR YOUR APPROVAL/i);
    expect(out).toMatch(/NEEDS A CONNECTION OR SETUP FIRST/i);
    expect(out).toMatch(/NOT SOMETHING YOU CAN DO HERE YET/i);
  });

  it("shows the reason for non-live items but never appends a reason to a live item", () => {
    const out = renderCapabilityStatusBlock([
      cap("r", "live", "See your contacts"),
      cap("w", "needs_approval", "Add a contact", "Paige drafts it and you approve before it runs."),
    ]);
    expect(out).toContain("- See your contacts\n"); // live → bare label, no " — reason"
    expect(out).toContain("- Add a contact — Paige drafts it and you approve before it runs.");
  });
});
