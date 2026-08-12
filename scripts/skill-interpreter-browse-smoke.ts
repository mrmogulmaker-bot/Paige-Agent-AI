// §32 HEADLESS SMOKE — proves the S1b browser-dispatch seam actually RUNS (not just type-checks).
// Drives the REAL `interpretSkill` with a mock deps.browse + mock deps.forge + mock admin and asserts:
//   (a) deps.browse is called with the browser step's url;
//   (b) the honest observation text is folded into the forge intent (contextText → buildForgeIntent);
//   (c) the browser_use_sessions ledger is written insert(invoker_kind:"skill",status:"running")
//       then update(status:"succeeded");
//   (d) when deps.browse returns { needs_config:true } the run degrades honestly (needs_config, NO
//       fabricated observation, forge never reached);
//   (e) a write-class risk_level ("mutating") does NOT execute the browse under auto (§16 risk floor).
//
// Run:  ~/.deno/bin/deno run -A scripts/skill-interpreter-browse-smoke.ts
// The forge chain is only IMPORTED (deps.forge is mocked, so callModel/network never fires).
import { interpretSkill, type InterpretDeps, type InterpretCtx } from "../supabase/functions/_shared/skill-interpreter.ts";
import type { SkillRow } from "../supabase/functions/_shared/skill-interpreter-core.ts";

let failures = 0;
function assert(cond: unknown, msg: string) {
  if (cond) { console.log(`  PASS: ${msg}`); } else { console.error(`  FAIL: ${msg}`); failures++; }
}

// A chainable, thenable Supabase-client stub that records every insert/update. `then` makes `await
// chain` (and `.update().eq()`) resolve, while `.eq()/.select()/.order()` keep chaining.
function makeAdmin(rec: Array<{ op: string; table: string; payload?: unknown }>) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "ledger-1" }, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  };
  return {
    from(table: string) {
      return {
        insert(payload: unknown) { rec.push({ op: "insert", table, payload }); return chain; },
        update(payload: unknown) { rec.push({ op: "update", table, payload }); return chain; },
        select: () => chain,
      };
    },
  };
}

function baseCtx(overrides: Partial<InterpretCtx>): InterpretCtx {
  return {
    skill: {} as SkillRow,
    inputs: { prompt: "do the thing" },
    contactId: "contact-1",
    tenantId: "tenant-1",
    callerTier: null,
    actorUserId: "user-1",
    actorRole: "admin",
    runId: "run-1",
    ...overrides,
  };
}

function browserSkill(partial: Partial<SkillRow>): SkillRow {
  return {
    slug: "self_verify_page",
    name: "Self-verify a page",
    category: null,
    risk_level: "read_only",
    autonomy_lane: "auto",
    methodology_anchor: null,
    scoping: "platform",
    tier_availability: null,
    steps: [{ tool: "browser", desc: "observe the page", url: "https://example.com/probe" }],
    allowed_tools: ["browser"],
    ...partial,
  };
}

const OBS_MARKER = "MARKER_HeadlineFromTheBrowse_42";

// ── Test 1 (a,b,c): a real read-only browse dispatches, folds, and writes the ledger ──────────────
async function testHappyPath() {
  console.log("\n[1] read-only browse dispatches → folds into forge intent → ledger insert+update");
  const rec: Array<{ op: string; table: string; payload?: unknown }> = [];
  let browseArgs: any = null;
  let forgeIntent = "";
  const deps: InterpretDeps = {
    admin: makeAdmin(rec),
    browse: async (args) => {
      browseArgs = args;
      return {
        ok: true, url: args.url, final_url: args.url, http_status: 200,
        title: "Probe Page", text_excerpt: OBS_MARKER, steps: [{ kind: "assertText", ok: true, detail: "found" }],
        screenshot_b64: "AAAA", duration_ms: 123,
      };
    },
    // Mock forge — records the userIntent so we can prove the observation folded in. Never hits network.
    forge: (async (task: any) => {
      forgeIntent = String(task?.userIntent ?? "");
      return { result: { content: "forged output", provider: "mock", needs_config: false } };
    }) as unknown as InterpretDeps["forge"],
  };

  const res = await interpretSkill(deps, baseCtx({ skill: browserSkill({}) }));
  assert(browseArgs?.url === "https://example.com/probe", "(a) deps.browse called with the step's url");
  assert(forgeIntent.includes(OBS_MARKER), "(b) observation text folded into the forge intent");
  const ins = rec.find((r) => r.op === "insert" && r.table === "browser_use_sessions");
  assert(!!ins, "(c) ledger insert on browser_use_sessions happened");
  assert((ins?.payload as any)?.invoker_kind === "skill", "(c) ledger insert invoker_kind === 'skill' (§37, not 'mcp')");
  assert((ins?.payload as any)?.status === "running", "(c) ledger insert status === 'running'");
  assert((ins?.payload as any)?.start_url === "https://example.com/probe", "(c) ledger insert start_url is the browse url");
  const upd = rec.find((r) => r.op === "update" && r.table === "browser_use_sessions");
  assert((upd?.payload as any)?.status === "succeeded", "(c) ledger update status === 'succeeded' (mapped from ok:true)");
  assert(res.status === "succeeded", "run status succeeded (auto lane, read_only)");
}

// ── Test 2 (d): needs_config degrades honestly, no fabricated observation, forge never reached ────
async function testNeedsConfigDegrade() {
  console.log("\n[2] deps.browse → { needs_config:true } degrades honestly (no fabricated observation)");
  const rec: Array<{ op: string; table: string; payload?: unknown }> = [];
  let forgeCalled = false;
  const deps: InterpretDeps = {
    admin: makeAdmin(rec),
    browse: async () => ({ needs_config: true }),
    forge: (async () => { forgeCalled = true; return { result: { content: "x", needs_config: false } }; }) as unknown as InterpretDeps["forge"],
  };
  const res = await interpretSkill(deps, baseCtx({ skill: browserSkill({}) }));
  assert(res.status === "needs_config", "(d) run status === 'needs_config'");
  assert((res.outputs as any)?.reason === "browser_unavailable", "(d) honest reason 'browser_unavailable', not a fake observation");
  assert(forgeCalled === false, "(d) forge NEVER reached — no content generated on a browser degrade");
}

// ── Test 2b: absent deps.browse also degrades honestly ────────────────────────────────────────────
async function testAbsentBrowse() {
  console.log("\n[2b] absent deps.browse degrades honestly (needs_config)");
  const deps: InterpretDeps = {
    admin: makeAdmin([]),
    forge: (async () => ({ result: { content: "x", needs_config: false } })) as unknown as InterpretDeps["forge"],
    // browse omitted
  };
  const res = await interpretSkill(deps, baseCtx({ skill: browserSkill({}) }));
  assert(res.status === "needs_config", "absent browse seam → needs_config");
}

// ── Test 3 (e): a write-class risk does NOT execute the browse under auto (§16 floor) ─────────────
async function testWriteClassGated() {
  console.log("\n[3] write-class risk_level ('mutating') + auto → browse NOT executed (§16 risk floor)");
  const rec: Array<{ op: string; table: string; payload?: unknown }> = [];
  let browseCalled = false;
  const deps: InterpretDeps = {
    admin: makeAdmin(rec),
    browse: async (args) => { browseCalled = true; return { ok: true, url: args.url }; },
    forge: (async () => ({ result: { content: "forged", needs_config: false } })) as unknown as InterpretDeps["forge"],
  };
  const res = await interpretSkill(deps, baseCtx({ skill: browserSkill({ risk_level: "mutating", autonomy_lane: "auto" }) }));
  assert(browseCalled === false, "(e) deps.browse NOT called for a mutating/write-class skill under auto");
  const ledgerInsert = rec.find((r) => r.op === "insert" && r.table === "browser_use_sessions");
  assert(!ledgerInsert, "(e) no browser_use_sessions ledger row written when the browse is gated");
  // The run still lands per the §16 clamp (mutating+auto → approval).
  assert(res.status === "awaiting_approval", "(e) run still lands as approval per the §16 clamp");
}

// ── Test 4: a browser step WITHOUT the allowed_tools grant is NOT dispatched (allowed_tools executed) ─
async function testAllowedToolsGate() {
  console.log("\n[4] browser step present but 'browser' NOT in allowed_tools → not dispatched");
  let browseCalled = false;
  const deps: InterpretDeps = {
    admin: makeAdmin([]),
    browse: async (args) => { browseCalled = true; return { ok: true, url: args.url }; },
    forge: (async () => ({ result: { content: "forged", needs_config: false } })) as unknown as InterpretDeps["forge"],
  };
  const res = await interpretSkill(deps, baseCtx({ skill: browserSkill({ allowed_tools: [] }) }));
  assert(browseCalled === false, "(gate) deps.browse NOT called when 'browser' absent from allowed_tools");
  assert(res.status === "succeeded", "(gate) run still forges + succeeds without the browse");
}

async function main() {
  await testHappyPath();
  await testNeedsConfigDegrade();
  await testAbsentBrowse();
  await testWriteClassGated();
  await testAllowedToolsGate();
  console.log(`\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} SMOKE CHECK(S) FAILED`}`);
  if (failures > 0) Deno.exit(1);
}
main();
