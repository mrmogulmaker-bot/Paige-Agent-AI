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

  it("carries the two completion directives — offer-but-never-promise for proof-owed, and no-invented-capability when nothing matches", () => {
    const out = renderCapabilityStatusBlock([cap("x", "live", "See things")]);
    // proof-owed framing: offer to try and report honestly, never promise the result
    expect(out).toMatch(/offer to try/i);
    expect(out).toMatch(/report honestly what came back/i);
    expect(out).toMatch(/never promise the outcome/i);
    // no-applicable-capability: when the ask matches nothing, say so plainly — never invent a tool
    expect(out).toMatch(/matches\s+NONE of the capabilities/i);
    expect(out).toMatch(/don't have a capability for that here/i);
    expect(out).toMatch(/do NOT\s+invent one/i);
  });

  // INT-117 S3 — the named-third-party rule. Observed 2026-09-21: Paige claimed she could
  // "read your GHL data" with no GoHighLevel integration anywhere in the registry. The render
  // directive must bind acknowledgement of ANY named outside product to presence in the
  // capability groups, and must name the trap classes so familiar brands cannot improvise
  // an integration the workspace does not have.
  it("INT-117 S3: carries the named-third-party rule — acknowledge an outside app ONLY if it appears in the groups", () => {
    const out = renderCapabilityStatusBlock([cap("x", "live", "See things")]);
    expect(out).toMatch(/names a specific outside app, tool, or data source/i);
    expect(out).toMatch(/acknowledge it ONLY if it appears in the groups below/i);
    expect(out).toMatch(/say plainly you don't have a connection to it here/i);
    expect(out).toMatch(/never imply one/i);
    expect(out).toMatch(/never say you can read, pull, or sync its data/i);
    // The trap classes are named in the directive (familiar brands are the risk).
    for (const brand of ["GHL/GoHighLevel", "HubSpot", "Salesforce", "Zapier", "n8n", "Meta/Facebook", "Instagram", "Google Calendar", "QuickBooks"]) {
      expect(out).toContain(brand);
    }
    // Sabotage-sensitivity: dropping the rule from the directive fails the pin.
    const without = out.replace(/If the person\s+names a specific outside app[^.]*\./i, "");
    expect(/names a specific outside app/i.test(without)).toBe(false);
  });

  it("INT-117 S3 brand-name traps — when NO matching capability is resolved, no brand appears in any group and the refusal rules are the only governing text", () => {
    // A manifest of unrelated live capabilities: nothing named Zapier/GHL/HubSpot/etc is resolved,
    // so the ONLY text governing a "can you read my GHL?" ask is the named-party + no-invention
    // rules — the model has nothing in the groups it could truthfully acknowledge.
    const out = renderCapabilityStatusBlock([
      cap("crm.search_contacts", "live", "See your contacts"),
      cap("calendar.read", "live", "See your calendar"),
    ]);
    for (const brand of ["Zapier", "GHL", "GoHighLevel", "HubSpot", "Salesforce", "n8n", "Facebook", "Instagram", "Google Calendar", "QuickBooks"]) {
      // The directive names the brand classes once (the rule itself); it must NOT appear as a
      // capability row the model could treat as connected.
      const rows = out.split("\n").filter((l: string) => l.trim().startsWith("- "));
      expect(rows.some((r: string) => r.includes(brand)), `brand ${brand} leaked into a capability row`).toBe(false);
    }
    expect(out).toMatch(/say plainly you don't have a connection to it here/i);
    expect(out).toMatch(/don't have a capability for that here/i);
    expect(out).toContain("See your contacts");
    expect(out).toContain("See your calendar");
  });

  it("INT-117 S3: acknowledgement is permitted ONLY via the groups — a connected Zapier item appears under its group alongside the rule", () => {
    // When Zapier IS genuinely resolved (here: an approval-gated zap run), the item appears under
    // its group heading — the named-party rule then PERMITS acknowledgement of exactly that item.
    const out = renderCapabilityStatusBlock([
      cap("zapier.run_zap", "needs_approval", "Run a Zapier zap for your approval", "Zapier is connected in this workspace."),
    ]);
    expect(out).toMatch(/CAN PREPARE FOR YOUR APPROVAL/i);
    expect(out).toContain("Run a Zapier zap for your approval");
    expect(out).toContain("Zapier is connected in this workspace.");
    expect(out).toMatch(/acknowledge it ONLY if it appears in the groups below/i);
    // The connected item rides a group heading, never a bare assertion outside the groups.
    const itemLine = out.split("\n").find((l: string) => l.includes("Run a Zapier zap"));
    expect(itemLine).toMatch(/^\s*-\s/);
  });

  it("INT-117 S3: 'send a text' and 'post to social' stay doubly fenced — the NEVER-say clause AND the named-party rule together", () => {
    const out = renderCapabilityStatusBlock([cap("sms.send", "planned", "Send texts", "Not available here yet.")]);
    expect(out).toMatch(/NEVER say you can post to social, send a text\/SMS/i);
    expect(out).toMatch(/names a specific outside app, tool, or data source/i);
  });

  it("puts proof_owed items under a CAN-ATTEMPT-NOT-PROVEN heading distinct from planned", () => {
    const out = renderCapabilityStatusBlock([
      cap("browser.secure_session", "proof_owed", "Browse a website for you", "Paige can try this, but it isn't proven to work here yet — she'll tell you honestly what came back."),
    ]);
    expect(out).toMatch(/CAN ATTEMPT, BUT NOT PROVEN HERE YET/i);
    expect(out).toMatch(/never promise the result/i);
    expect(out).toContain("Browse a website for you");
    // it is NOT folded into the planned "can't do here yet" bucket
    expect(out).not.toMatch(/NOT SOMETHING YOU CAN DO HERE YET/i);
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
