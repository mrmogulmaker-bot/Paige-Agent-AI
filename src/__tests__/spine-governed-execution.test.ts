/**
 * The shared governed execution seam, tested as a set of PROPERTIES rather than a set of cases.
 *
 * The property that carries the slice is door-blindness: a capability must not become more
 * permitted because an automation, an agent, a skill or an MCP client asked for it instead of Chat.
 * That is asserted exhaustively — every door, every fixture, byte-identical decisions — rather than
 * by spot-checking one alternative caller, because a spot check passes against an implementation
 * that special-cases the two doors nobody happened to test.
 *
 * REAL CODE, NOT A DOUBLE. `classifyAction` and `decideToolConfirmation` are the shipped modules,
 * and the tool names below are real entries in `action-risk.ts`, so what this file asserts is what
 * production policy says. `crm_delete_contact` is `high`, `crm_create_contact` is `ordinary`,
 * `automation_set_grant` is `owner_only` — asserted directly at the end, so a reclassification
 * breaks this file loudly instead of silently turning its cases into vacuous ones.
 */
import { describe, it, expect } from "vitest";
import {
  decideGovernedExecution,
  GOVERNED_REFUSAL_CODES,
  type GovernedCaller,
  type GovernedDoor,
  type GovernedDecision,
} from "../../supabase/functions/_shared/paige-spine/governedExecution.ts";
import { classifyAction } from "../../supabase/functions/_shared/action-risk.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOORS: GovernedDoor[] = ["chat", "automation", "agent", "skill", "mcp", "other"];
const NON_CHAT_DOORS = DOORS.filter((d) => d !== "chat");

const caller = (over: Partial<GovernedCaller> = {}): GovernedCaller => ({
  authenticated: true,
  userId: "user-1",
  tenantId: "tenant-1",
  tenantSource: "server",
  door: "chat",
  access: { allowed: true },
  ...over,
});

const HIGH = { id: "crm_delete_contact", effect: "mutate" as const, outcomeChannel: "rail" };
const ORDINARY = { id: "crm_create_contact", effect: "mutate" as const, outcomeChannel: "rail" };
const OWNER_ONLY = { id: "automation_set_grant", effect: "mutate" as const, outcomeChannel: "rail" };

const decide = (over: Parameters<typeof decideGovernedExecution>[0]) => decideGovernedExecution(over);

/** Strip the door from an audit so two decisions from different doors can be compared directly. */
function doorless(d: GovernedDecision) {
  const { audit, ...rest } = d as GovernedDecision & { audit: Record<string, unknown> };
  const { door: _door, ...auditRest } = audit as Record<string, unknown>;
  return { ...rest, audit: auditRest };
}

describe("the seam wraps the LIVE mechanism, not the superseded one", () => {
  it("does not import the unwired #711 decideToolConfirmation", () => {
    // `_shared/toolConfirmation.ts` is the obvious thing to delegate to and is the WRONG thing:
    // the Chat handler's own merge note (paige-ai-chat/index.ts:7922) records it as "in the tree
    // unwired", superseded by the inline sequence over `paige_pending_confirmations`. Importing it
    // would make a superseded design the platform's shared contract. Asserted structurally,
    // because the mistake is invisible in behaviour — the two decisions agree on these fixtures.
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/paige-spine/governedExecution.ts"), "utf8");
    expect(src).not.toMatch(/^import[^;]*decideToolConfirmation/m);
  });

  it("performs no claim of its own — it receives one", () => {
    // Claiming has exactly one home. A seam that also claimed would be a second implementation of
    // one-approval-one-execution, and two claim protocols in series is the deadlock #711's history
    // is made of.
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/paige-spine/governedExecution.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/paige_pending_confirmations|claimConfirmation|confirmFingerprint/);
    expect(code).not.toMatch(/\.from\(|\.rpc\(/);
  });
});

describe("the policy this file asserts against is the real one", () => {
  it("classifies the fixture tools as the cases below assume", () => {
    expect(classifyAction("crm_delete_contact")).toBe("high");
    expect(classifyAction("crm_create_contact")).toBe("ordinary");
    expect(classifyAction("automation_set_grant")).toBe("owner_only");
    // If this ever becomes classified, the "unclassified mutation" cases below go vacuous.
    expect(classifyAction("crm_delete_everything")).toBe("unclassified");
  });
});

describe("a non-Chat caller cannot bypass high-risk approval", () => {
  it.each(NON_CHAT_DOORS)("%s cannot execute a high action with no claim", (door) => {
    const d = decide({
      caller: caller({ door }),
      capability: HIGH,
      approval: { autonomyLane: "confirm" },
      requestArgs: { contact_id: "c1" },
    });
    expect(d.kind).toBe("propose");
  });

  it.each(NON_CHAT_DOORS)("%s cannot execute a high action on a FAILED claim", (door) => {
    const d = decide({
      caller: caller({ door }),
      capability: HIGH,
      approval: { autonomyLane: "confirm", claimedArgs: null },
      requestArgs: { contact_id: "c1" },
    });
    expect(d.kind).toBe("propose");
    expect(d.kind === "propose" && d.revalidate).toBe(true);
  });

  it.each(NON_CHAT_DOORS)("%s cannot reach a high action by asking for the auto lane", (door) => {
    // REGRESSION. The bypass is: request `auto`, skip approval entirely. The clamp is one-directional
    // and must fire before the gate, so this lands in `propose`, never `execute`.
    const d = decide({
      caller: caller({ door }),
      capability: HIGH,
      approval: { autonomyLane: "auto" },
      requestArgs: { contact_id: "c1" },
    });
    expect(d.kind).toBe("propose");
    expect(d.audit.clamped).toBe(true);
    expect(d.audit.laneEffective).toBe("confirm");
  });

  it("has no boolean input a caller could set — an approval is a CLAIM or it is nothing", () => {
    // The #784 shape, expressed against this seam: there is no `confirm` field to pass. The nearest
    // a caller can get is an empty claim, and an empty claim is not an ok claim.
    const d = decide({
      caller: caller({ door: "mcp" }),
      capability: HIGH,
      approval: { autonomyLane: "confirm", claimedArgs: null },
      requestArgs: { contact_id: "c1", confirm: true },
    });
    expect(d.kind).toBe("propose");
  });

  it("executes the STORED arguments on a good claim, never the caller's re-emitted ones", () => {
    const d = decide({
      caller: caller({ door: "automation" }),
      capability: HIGH,
      approval: { autonomyLane: "confirm", claimedArgs: { contact_id: "APPROVED" } },
      requestArgs: { contact_id: "SWAPPED" },
    });
    expect(d.kind).toBe("execute");
    expect(d.kind === "execute" && d.args).toEqual({ contact_id: "APPROVED" });
  });

  it("cannot execute an approved action with arguments the approval did not carry", () => {
    // There is no "the claim succeeded" flag separate from the claimed arguments, so the state
    // "approved, but run something else" is unrepresentable rather than merely rejected. The
    // nearest expressible thing — a claim that came back empty — is a refusal to execute.
    const d = decide({
      caller: caller({ door: "automation" }),
      capability: HIGH,
      approval: { autonomyLane: "confirm", claimedArgs: null },
      requestArgs: { contact_id: "SWAPPED" },
    });
    expect(d.kind).toBe("propose");
    expect(d.kind === "propose" && d.revalidate).toBe(true);
  });
});

describe("an unclassified mutation fails closed", () => {
  it.each(DOORS)("%s is refused, with no approval path out", (door) => {
    const d = decide({
      caller: caller({ door }),
      capability: { id: "crm_delete_everything", effect: "mutate", outcomeChannel: "rail" },
      approval: { autonomyLane: "confirm", claimedArgs: {} },
      requestArgs: {},
    });
    expect(d.kind).toBe("refuse");
    expect(d.kind === "refuse" && d.code).toBe("unclassified_mutation");
  });

  it("is refused even on the auto lane with a good claim", () => {
    const d = decide({
      caller: caller({ door: "mcp" }),
      capability: { id: "crm_delete_everything", effect: "mutate", outcomeChannel: "rail" },
      approval: { autonomyLane: "auto", claimedArgs: {} },
      requestArgs: {},
    });
    expect(d.kind).toBe("refuse");
  });

  it("catches a write mis-declared as a read, using the runtime backstop", () => {
    const d = decide({
      caller: caller({ door: "mcp" }),
      capability: { id: "crm_delete_everything", effect: "read" },
      approval: { autonomyLane: "auto" },
      requestArgs: {},
    });
    expect(d.kind).toBe("refuse");
    expect(d.kind === "refuse" && d.code).toBe("unclassified_mutation");
  });

  it("catches a CLASSIFIED mutation mis-declared as a read", () => {
    const d = decide({
      caller: caller({ door: "mcp" }),
      capability: { id: "crm_delete_contact", effect: "read" },
      approval: { autonomyLane: "auto" },
      requestArgs: {},
    });
    expect(d.kind).toBe("refuse");
    expect(d.kind === "refuse" && d.code).toBe("effect_mismatch");
  });
});

describe("owner_only fails closed", () => {
  it.each(DOORS)("%s is refused at every approval strength", (door) => {
    for (const approval of [
      { autonomyLane: "auto" },
      { autonomyLane: "confirm" },
      { autonomyLane: "confirm", claimedArgs: { x: 1 } },
    ]) {
      const d = decide({ caller: caller({ door }), capability: OWNER_ONLY, approval, requestArgs: {} });
      expect(d.kind).toBe("refuse");
      expect(d.kind === "refuse" && d.code).toBe("owner_only");
    }
  });
});

describe("the door changes nothing", () => {
  const fixtures = [
    { label: "high, no claim", capability: HIGH, approval: { autonomyLane: "confirm" } },
    { label: "high, good claim", capability: HIGH,
      approval: { autonomyLane: "confirm", claimedArgs: { a: 1 } } },
    { label: "high, auto requested", capability: HIGH, approval: { autonomyLane: "auto" } },
    { label: "ordinary, auto", capability: ORDINARY, approval: { autonomyLane: "auto" } },
    { label: "ordinary, confirm no claim", capability: ORDINARY, approval: { autonomyLane: "confirm" } },
    { label: "owner_only", capability: OWNER_ONLY, approval: { autonomyLane: "auto" } },
    { label: "lane off", capability: ORDINARY, approval: { autonomyLane: "off" } },
    { label: "unclassified", capability: { id: "crm_delete_everything", effect: "mutate" as const, outcomeChannel: "rail" },
      approval: { autonomyLane: "auto" } },
    { label: "read", capability: { id: "crm_search_contacts", effect: "read" as const },
      approval: { autonomyLane: "confirm" } },
  ];

  it.each(fixtures)("$label decides identically through every door", ({ capability, approval }) => {
    const results = DOORS.map((door) =>
      doorless(decide({ caller: caller({ door }), capability, approval, requestArgs: { a: 1 } })));
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("records the door in the audit and nowhere else", () => {
    const d = decide({
      caller: caller({ door: "mcp" }), capability: ORDINARY,
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.audit.door).toBe("mcp");
  });
});

describe("the layers that were previously inline, and therefore unreachable", () => {
  it("refuses a tenant the caller supplied rather than the server deriving", () => {
    const d = decide({
      caller: caller({ tenantSource: "request" }), capability: ORDINARY,
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.kind === "refuse" && d.code).toBe("tenant_not_server_derived");
  });

  it("refuses an unauthenticated caller", () => {
    const d = decide({
      caller: caller({ authenticated: false, userId: null }), capability: ORDINARY,
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.kind === "refuse" && d.code).toBe("unauthenticated");
  });

  it("refuses when no tenant resolved", () => {
    const d = decide({
      caller: caller({ tenantId: null }), capability: ORDINARY,
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.kind === "refuse" && d.code).toBe("tenant_unresolved");
  });

  it("treats a MISSING access verdict as a refusal, not as permission", () => {
    const d = decide({
      caller: caller({ access: undefined }), capability: ORDINARY,
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.kind === "refuse" && d.code).toBe("access_denied");
  });

  it("refuses an unnamed capability", () => {
    const d = decide({
      caller: caller(), capability: { id: "   ", effect: "mutate", outcomeChannel: "rail" },
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.kind === "refuse" && d.code).toBe("capability_unidentified");
  });

  it("refuses a mutation that declares no durable outcome", () => {
    // The Rail workstream owns what travels on that channel. This seam only requires that one
    // was named, so a change nobody could ever see does not run.
    const d = decide({
      caller: caller(), capability: { id: "crm_create_contact", effect: "mutate" },
      approval: { autonomyLane: "auto" }, requestArgs: {},
    });
    expect(d.kind === "refuse" && d.code).toBe("outcome_channel_undeclared");
  });

  it("REGRESSION: an unrecognised autonomy lane fails CLOSED, it does not execute", () => {
    // This was a real fail-open. `""`, `"AUTO"`, `"nonsense"` and `undefined` all reached the tail
    // `execute` and ran a `high` action with no claim at all, because the clamp only rewrote
    // `auto` and only `off`/`confirm` had branches. Found by the exhaustive sweep, not by a
    // hand-written case — which is the whole argument for keeping that sweep.
    for (const lane of ["", "AUTO", "Confirm", "nonsense", undefined as unknown as string]) {
      for (const capability of [HIGH, ORDINARY]) {
        const d = decide({ caller: caller(), capability,
                           approval: { autonomyLane: lane }, requestArgs: { x: 1 } });
        expect(d.kind).toBe("refuse");
        expect(d.kind === "refuse" && d.code).toBe("autonomy_lane_unrecognized");
      }
    }
  });

  it("honours `off` as a brake at every class", () => {
    for (const capability of [ORDINARY, HIGH]) {
      const d = decide({ caller: caller(), capability, approval: { autonomyLane: "off" }, requestArgs: {} });
      expect(d.kind === "refuse" && d.code).toBe("autonomy_off");
    }
  });

  it("lets an ordinary action run on auto with the request's own arguments", () => {
    const d = decide({
      caller: caller(), capability: ORDINARY,
      approval: { autonomyLane: "auto" }, requestArgs: { first_name: "A" },
    });
    expect(d.kind).toBe("execute");
    expect(d.kind === "execute" && d.args).toEqual({ first_name: "A" });
  });

  it("never emits a refusal code outside the declared set", () => {
    const seen = new Set<string>();
    for (const door of DOORS) {
      for (const cap of [HIGH, ORDINARY, OWNER_ONLY,
                         { id: "crm_delete_everything", effect: "mutate" as const },
                         { id: "crm_search_contacts", effect: "read" as const }]) {
        for (const lane of ["auto", "confirm", "off", "nonsense"]) {
          for (const c of [caller({ door }), caller({ door, access: undefined }),
                           caller({ door, tenantSource: "unknown" }), caller({ door, tenantId: null })]) {
            const d = decide({ caller: c, capability: cap, approval: { autonomyLane: lane }, requestArgs: {} });
            if (d.kind === "refuse") seen.add(d.code);
          }
        }
      }
    }
    for (const code of seen) expect(GOVERNED_REFUSAL_CODES).toContain(code);
    expect(seen.size).toBeGreaterThan(0);
  });
});

/** The sweep's own fixture axes — deliberately wider than the readable cases above. */
const SWEEP_LANES = ["auto", "confirm", "off", "", "AUTO", "Confirm", "nonsense",
                     undefined as unknown as string];
const SWEEP_CAPS = [
  { id: "crm_delete_contact", effect: "mutate" as const },      // high
  { id: "crm_create_contact", effect: "mutate" as const },      // ordinary
  { id: "automation_set_grant", effect: "mutate" as const },    // owner_only
  { id: "crm_delete_everything", effect: "mutate" as const },   // unclassified write
  { id: "crm_search_contacts", effect: "read" as const },       // genuine read
  { id: "crm_delete_contact", effect: "read" as const },        // mis-declared
];
const SWEEP_OUTCOMES = [undefined, "", "   ", "rail"];
const SWEEP_CLAIMS = [undefined, null, {}, { contact_id: "APPROVED" }];
const SWEEP_CALLER_ARGS = { contact_id: "CALLER_SUPPLIED" };

/**
 * EXHAUSTIVE SWEEP — kept because it earned its place.
 *
 * The hand-written cases above are readable and they are not sufficient. This sweep enumerates the
 * whole decision space and checks an ORACLE rather than a list of expectations, and on its first
 * run it found a real fail-OPEN that all 55 of them missed: an autonomy lane this seam does not
 * recognise (`""`, `"AUTO"`, `undefined`, a typo) fell through to the tail `execute` and ran a
 * `high` action with NO claim and NO approval. The lane is typed `... | string` precisely because
 * the caller resolves it, so those values are reachable, not theoretical.
 *
 * The lesson is the reason it stays: hand-written cases test the branches the author was thinking
 * about, and a fail-open lives in the branch nobody wrote a case for.
 */
describe("exhaustive sweep of the whole decision space", () => {
  it("every execute is justified, and no approved mutation ever runs caller args", () => {
    let checked = 0, execs = 0; const bad: string[] = [];
    for (const door of DOORS) for (const authed of [true,false]) for (const lane of SWEEP_LANES)
    for (const cap of SWEEP_CAPS) for (const oc of SWEEP_OUTCOMES) for (const claimedArgs of SWEEP_CLAIMS)
    for (const access of [undefined,{allowed:false},{allowed:true}])
    for (const tenantSource of ["server","request","unknown"] as const)
    for (const tenantId of ["t", null]) {
      const d = decideGovernedExecution({
        caller:{ authenticated: authed, userId: authed?"u":null, tenantId, tenantSource, door, access },
        capability:{ ...cap, outcomeChannel: oc },
        approval:{ autonomyLane: lane, claimedArgs: claimedArgs as never },
        requestArgs: SWEEP_CALLER_ARGS,
      });
      checked++;
      if (d.kind !== "execute") continue;
      execs++;
      const ctx = JSON.stringify({door,authed,lane,cap,oc,claimedArgs,access,tenantSource,tenantId});

      // Gate preconditions that must hold for ANY execute.
      if (tenantSource !== "server" || !authed || !tenantId || access?.allowed !== true)
        { bad.push("EXECUTED WITHOUT GATE: "+ctx); continue; }

      const risk = classifyAction(cap.id);
      if (cap.effect === "read") {
        // A read may only execute when it is genuinely unclassified and not write-shaped.
        if (risk !== "unclassified" || cap.id !== "crm_search_contacts")
          bad.push("BAD READ EXECUTED: "+ctx);
        continue;
      }
      // Mutations.
      if (risk === "unclassified" || risk === "owner_only") { bad.push("UNGOVERNED MUTATION: "+ctx); continue; }
      if (typeof oc !== "string" || oc.trim() === "") { bad.push("NO OUTCOME CHANNEL: "+ctx); continue; }
      const laneEff = (lane === "auto" && risk === "high") ? "confirm" : lane;
      if (laneEff === "off") { bad.push("EXECUTED ON OFF: "+ctx); continue; }
      if (laneEff === "confirm") {
        if (!(claimedArgs && typeof claimedArgs === "object")) { bad.push("CONFIRM WITHOUT CLAIM: "+ctx); continue; }
        // THE property: the approved path runs the STORED args, never the caller's.
        if (JSON.stringify(d.args) !== JSON.stringify(claimedArgs))
          bad.push("APPROVED PATH DID NOT RUN STORED ARGS: "+ctx);
        if (JSON.stringify(d.args) === JSON.stringify(SWEEP_CALLER_ARGS) && JSON.stringify(claimedArgs) !== JSON.stringify(SWEEP_CALLER_ARGS))
          bad.push("APPROVED PATH RAN CALLER ARGS: "+ctx);
      } else if (laneEff === "auto") {
        if (risk !== "ordinary") bad.push("AUTO EXECUTED A NON-ORDINARY: "+ctx);
      } else {
        bad.push("EXECUTED ON AN UNKNOWN LANE: "+ctx);
      }
    }
    console.log(`  swept ${checked} combinations, ${execs} executes, ${bad.length} violations`);
    for (const b of bad.slice(0,8)) console.log("   ", b);
    expect(bad.length).toBe(0);
    expect(execs).toBeGreaterThan(0);
  });

  it("is byte-identical across all six doors for every combination", () => {
    const mism: string[] = [];
    for (const authed of [true,false]) for (const lane of SWEEP_LANES) for (const cap of SWEEP_CAPS)
    for (const oc of SWEEP_OUTCOMES) for (const claimedArgs of SWEEP_CLAIMS)
    for (const access of [undefined,{allowed:false},{allowed:true}])
    for (const tenantSource of ["server","request","unknown"] as const) {
      const seen = new Set(DOORS.map((door) => {
        const d = decideGovernedExecution({
          caller:{ authenticated: authed, userId: authed?"u":null, tenantId:"t", tenantSource, door, access },
          capability:{ ...cap, outcomeChannel: oc },
          approval:{ autonomyLane: lane, claimedArgs: claimedArgs as never },
          requestArgs:{ a:1 },
        });
        const { audit, ...rest } = d as never as { audit: Record<string,unknown> };
        const { door: _d, ...auditRest } = audit;
        return JSON.stringify({ rest, auditRest });
      }));
      if (seen.size !== 1) mism.push(JSON.stringify({lane,cap,oc,claimedArgs,access,tenantSource}));
    }
    console.log(`  door-blindness: ${mism.length} mismatches`);
    expect(mism.length).toBe(0);
  });

  it("owner_only and unclassified never execute under ANY input", () => {
    const bad: string[] = [];
    for (const door of DOORS) for (const lane of SWEEP_LANES) for (const claimedArgs of SWEEP_CLAIMS)
    for (const oc of SWEEP_OUTCOMES) for (const eff of ["mutate","read"] as const)
    for (const id of ["automation_set_grant","automation_set_state","crm_delete_everything"]) {
      const d = decideGovernedExecution({
        caller:{ authenticated:true, userId:"u", tenantId:"t", tenantSource:"server", door, access:{allowed:true} },
        capability:{ id, effect: eff, outcomeChannel: oc },
        approval:{ autonomyLane: lane, claimedArgs: claimedArgs as never },
        requestArgs:{},
      });
      if (d.kind === "execute") bad.push(JSON.stringify({id,eff,lane,claimedArgs,oc,door}));
    }
    console.log(`  owner_only/unclassified executes: ${bad.length}`);
    expect(bad.length).toBe(0);
  });
});
