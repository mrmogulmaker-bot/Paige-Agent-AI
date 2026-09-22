/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// INT-117 S1 — the shared PAIGE PERSONA CORE contract. The core is the ONE
// personality definition both channels read (chat today; Live Conversation rides
// the same assembly). These pins keep it: the four read-the-room registers with
// the follow-their-last-message rule and the asymmetric ratchet; the two
// non-negotiable honesty lines (AI-when-asked; not-a-licensed-professional); the
// DISTRESS care-first + crisis-resource behaviour; the no-internal-jargon naming
// rule; §2/§3 denylist cleanliness (zero credit/funding words outside the
// lane-guard's own marked block); and the import-graph — paige-ai-chat injects
// exactly this module's export, so there is one persona source, not two.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import {
  CREDIT_DENYLIST,
  CREDIT_PROGRAM_DENYLIST,
} from "../../supabase/functions/_shared/client-context.ts";

function port(path: string) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out: any = {};
  new Function("require", "exports", js)((k: string) => { throw new Error(`unexpected runtime import: ${k}`); }, out);
  return out;
}

const { PAIGE_PERSONA_CORE } = port("supabase/functions/_shared/paige-persona/core.ts");
const chatSrc = readFileSync("supabase/functions/paige-ai-chat/index.ts", "utf8");

describe("PAIGE_PERSONA_CORE — the read-the-room registers", () => {
  it("defines exactly the four registers, each with its own tell", () => {
    for (const reg of ["CASUAL", "FOCUSED", "SENSITIVE", "DISTRESS"]) {
      expect(PAIGE_PERSONA_CORE).toMatch(new RegExp(`- ${reg} —`));
    }
    expect(PAIGE_PERSONA_CORE).toMatch(/your register follows THEIR last message, not the topic's label/i);
  });

  it("register moves are immediate and asymmetric — a joke never follows a heavy message", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/ratchets UP instantly/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/a joke never follows a heavy message/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/ease back down only when THEY do/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/take the warmer, more careful one/i);
  });

  it("CASUAL keeps the warmth and humour; SENSITIVE drops the jokes and acknowledges first", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/Humour is welcome\. React first/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/calm down a beat\. No jokes\. Acknowledge the human thing first/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/never to lecture or grade them/i);
  });

  it("SENSITIVE disclosures are used only to help, with plain retention language", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/Use what they share to help THEM/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/plain about what you keep and why/i);
  });
});

describe("PAIGE_PERSONA_CORE — the minimal non-negotiable safety", () => {
  it("DISTRESS is care-first: no plans, no productivity talk, no clinical claims", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/CARE FIRST\. No action plans, no productivity talk/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/no diagnosing or clinical claims of any kind/i);
  });

  it("DISTRESS offers crisis resources on risk of harm (988 in the US; locale-appropriate otherwise)", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/risk of harm to themselves or others/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/calling or texting 988/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/their local crisis line or emergency number/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/encourage reaching a real person/i);
  });

  it("AI honesty: plainly stated when sincerely asked — never volunteered, never hidden", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/you're Paige, an AI working with the team/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/Don't volunteer it unprompted, don't hide it/i);
  });

  it("not a licensed professional — legal/tax/medical/financial questions get a plain referral", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/not a licensed professional/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/say so and point them to the right professional or to the team/i);
  });
});

describe("PAIGE_PERSONA_CORE — naming and denylist cleanliness (§2/§3)", () => {
  it("never teaches an internal staff word: the humans are 'the team' to the person", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/"the team" \(or the practice's own name\)/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/internal platform jargon never appears/i);
    // The core itself must not SAY the banned staff word anywhere.
    expect(PAIGE_PERSONA_CORE).not.toMatch(/\bOperator\b/);
  });

  it("carries zero credit/funding vocabulary (§2 — the platform-default core is coaching-generic)", () => {
    expect(CREDIT_DENYLIST.test(PAIGE_PERSONA_CORE)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(PAIGE_PERSONA_CORE)).toBe(false);
  });
});

describe("PAIGE_PERSONA_CORE — one persona source (import graph, §18)", () => {
  it("paige-ai-chat imports the core from the one shared module and injects it ONCE, right after the voice", () => {
    expect(chatSrc).toContain('import { PAIGE_PERSONA_CORE } from "../_shared/paige-persona/core.ts"');
    expect(chatSrc.match(/\{ role: "system", content: PAIGE_PERSONA_CORE \}/g)).toHaveLength(1);
    const voiceAt = chatSrc.indexOf('content: PAIGE_VOICE_BLOCK }');
    const coreAt = chatSrc.indexOf('content: PAIGE_PERSONA_CORE }');
    expect(voiceAt).toBeGreaterThan(-1);
    expect(coreAt).toBeGreaterThan(voiceAt);
    // The injection stays INSIDE the assembly array (before the tenant context blocks).
    const ctxAt = chatSrc.indexOf("...(tenantDomainContext ?");
    expect(ctxAt).toBeGreaterThan(coreAt);
  });

  it("tenant-persona precedence is restated in the core itself (§7/§9)", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/persona message above sets whose team you're on/i);
    // Sabotage-sensitivity: stripping the precedence header fails the pin.
    const stripped = PAIGE_PERSONA_CORE.replace(/the persona message above sets whose team you're on/i, "");
    expect(/persona message above/i.test(stripped)).toBe(false);
  });
});
