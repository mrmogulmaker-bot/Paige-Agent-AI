/* eslint-disable @typescript-eslint/no-explicit-any -- Executed edge helper, loaded through a transpile port. */
// @vitest-environment node
//
// INT-117 S1-REPLACEMENT — the IDENTITY-FREE persona core. The core carries NO identity
// at all (no name, no "You are Paige", no warmth biography): identity is a SEAT concern
// and every lane already establishes it in an earlier system message (tenant persona
// block, VP block, Studio persona, owner-desk identity rows, portal persona). The core
// holds only what is seat-neutral: the read-the-room registers, the ONE GLOBAL
// PRECEDENCE distress rule, the honesty lines, and the naming rule. These pins keep it
// that way — reintroducing ANY identity line into the core fails the suite.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, it, expect } from "vitest";
import {
  CREDIT_DENYLIST,
  CREDIT_PROGRAM_DENYLIST,
  buildPaigePersonaBlock,
  NEUTRAL_PERSONA,
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

describe("INT-117 S1R — the core is IDENTITY-FREE (no seat exceptions, no variant split)", () => {
  it("carries NO identity line anywhere — no name, no 'You are', no Paige-assertion, no NOT-Paige disclaimer", () => {
    expect(PAIGE_PERSONA_CORE).not.toMatch(/You are Paige/i);
    expect(PAIGE_PERSONA_CORE).not.toMatch(/you are NOT Paige/i);
    expect(PAIGE_PERSONA_CORE).not.toMatch(/^You are /im);
    expect(PAIGE_PERSONA_CORE).not.toMatch(/Your name is/i);
    // The identity-header DEFEERENCE is gone too — the core no longer reasons about
    // whose persona is set where; it is pure register/safety text.
    expect(PAIGE_PERSONA_CORE).not.toMatch(/whose persona is set/i);
    expect(PAIGE_PERSONA_CORE).not.toMatch(/Paige — warm, sharp/i);
  });

  it("is ONE export — the variant split is deleted (REGISTERS does not exist)", () => {
    expect(port("supabase/functions/_shared/paige-persona/core.ts").PAIGE_PERSONA_REGISTERS).toBeUndefined();
    expect(chatSrc).not.toMatch(/PAIGE_PERSONA_REGISTERS/);
    // Sabotage-sensitivity: re-introducing an identity line fails the pin.
    const withIdentity = "You are Paige — warm, sharp.\n" + PAIGE_PERSONA_CORE;
    expect(/You are Paige/i.test(withIdentity)).toBe(true);
  });

  it("opens with the registers header — seat-neutral, addressed to whoever is speaking", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/^READ THE ROOM —/);
    expect(PAIGE_PERSONA_CORE).toMatch(/your register follows THEIR last message, not the topic's label/i);
  });
});

describe("INT-117 S1R — the seat-neutral content (carried from the parked #1323, unchanged)", () => {
  it("the four registers with their tells", () => {
    for (const reg of ["CASUAL", "FOCUSED", "SENSITIVE", "DISTRESS"]) {
      expect(PAIGE_PERSONA_CORE).toMatch(new RegExp(`- ${reg} —`));
    }
    expect(PAIGE_PERSONA_CORE).toMatch(/ratchets UP instantly/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/a joke never follows a heavy message/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/take the warmer, more careful one/i);
  });

  it("ONE GLOBAL PRECEDENCE RULE — distress overrides every other instruction, including later ones", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/ONE GLOBAL PRECEDENCE RULE \(non-negotiable, and it outranks everything else in this conversation\): when the person is in distress or at risk of harm, the care-first register overrides every other instruction you have been given — including instructions that appear after this one \(modes, menus, next steps, intake flows, recommendations, discovery questions, action lists\)/);
    expect(PAIGE_PERSONA_CORE).toMatch(/Nothing you were told to always do justifies pushing a person in crisis/);
  });

  it("DISTRESS care-first with crisis resources; SENSITIVE acknowledge-first; honesty lines", () => {
    expect(PAIGE_PERSONA_CORE).toMatch(/CARE FIRST\. No action plans, no productivity talk/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/calling or texting 988/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/their local crisis line or emergency number/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/calm down a beat\. No jokes\. Acknowledge the human thing first/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/you're an AI working with the team/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/not a licensed professional/i);
  });

  it("the naming rule bans the internal staff word for the PERSON — owner feel-check note (1)", () => {
    // The person is "the owner"/"you"/"the business"/"the team" — never an internal
    // staff word. The rule teaches the replacements and the ban shape.
    expect(PAIGE_PERSONA_CORE).toMatch(/the owner/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/the business/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/never an internal staff word/i);
    expect(PAIGE_PERSONA_CORE).toMatch(/internal platform jargon never appears/i);
  });

  it("denylists stay clean (§2/§3)", () => {
    expect(CREDIT_DENYLIST.test(PAIGE_PERSONA_CORE)).toBe(false);
    expect(CREDIT_PROGRAM_DENYLIST.test(PAIGE_PERSONA_CORE)).toBe(false);
  });
});

describe("INT-117 S1R — the warmth paragraph moved into the platform-default persona block", () => {
  const emptyPlaybook = {};

  it("the platform DEFAULT persona carries the warmth biography (buildPaigePersonaBlock fallback)", () => {
    const out = buildPaigePersonaBlock(emptyPlaybook, "Acme Coaching", false, null);
    expect(out).toMatch(new RegExp(`You are ${NEUTRAL_PERSONA.name}, ${NEUTRAL_PERSONA.role} for Acme Coaching`));
    // The warmth texture from the old core lives HERE now — the teammate feeling.
    expect(out).toMatch(/capable teammate who genuinely likes them/i);
    expect(out).toMatch(/never like they're filling out a form or talking to a help desk/i);
    expect(out).toMatch(/comfortable people share more openly/i);
  });

  it("a TENANT-AUTHORED persona is unchanged — its own voice wins, no warmth paragraph appended", () => {
    const authored = { persona: { name: "Nova", role: "concierge", tone: "crisp", domain: "wellness" } };
    const out = buildPaigePersonaBlock(authored, "Acme", false, null);
    expect(out).toMatch(/You are Nova, concierge for Acme — a wellness practice/);
    expect(out).not.toMatch(/capable teammate who genuinely likes them/i);
    expect(out).not.toMatch(/comfortable people share more openly/i);
    // Tone line still honors the authored tone.
    expect(out).toMatch(/Tone: crisp\./);
  });
});

describe("INT-117 S1R — the injection: ONE unconditional system message, no per-seat branches", () => {
  it("paige-ai-chat imports the core and injects it exactly once, unconditionally, after the voice block", () => {
    expect(chatSrc).toContain('import { PAIGE_PERSONA_CORE } from "../_shared/paige-persona/core.ts"');
    expect(chatSrc.match(/\{ role: "system", content: PAIGE_PERSONA_CORE \}/g)).toHaveLength(1);
    const voiceAt = chatSrc.indexOf('content: PAIGE_VOICE_BLOCK }');
    const coreAt = chatSrc.indexOf('{ role: "system", content: PAIGE_PERSONA_CORE }');
    const ctxAt = chatSrc.indexOf("...(tenantDomainContext ?");
    expect(coreAt).toBeGreaterThan(voiceAt);
    expect(ctxAt).toBeGreaterThan(coreAt);
  });

  it("the VP ternary and the Studio persona-core swap are DELETED (not left behind)", () => {
    expect(chatSrc).not.toMatch(/vpAddress \? PAIGE_PERSONA_REGISTERS : PAIGE_PERSONA_CORE/);
    expect(chatSrc).not.toMatch(/personaCoreIdx/);
    expect(chatSrc).not.toMatch(/content === PAIGE_PERSONA_CORE/);
  });
});
