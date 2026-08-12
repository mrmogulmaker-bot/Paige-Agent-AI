// §32 headless runtime proof for #135 — the Skills S1b interpreter must COMPLETE a platform-scoped
// skill run for a NON-OPERATOR tenant caller, instead of throwing §9 and returning `failed`.
//
// WHY this exists: the S2 seed migrations proved each skill ROW inserts (a §32.a rollback proof).
// That proof structurally could NOT reach runtime — and at runtime EVERY seeded skill (scoping
// 'platform') was un-runnable: skill-interpreter.ts mapped scoping='platform' → is_platform_default
// =true, and model-router-gates.assertTenantScope THROWS §9 unless the actorRole is an operator
// (operator/god/super_admin). skill-runner passes actorRole 'admin'/'mcp'/'coach'/'paige'/'system'
// — never operator — so forge threw and interpretSkill returned `failed`. This is the exact §39
// peer-gate class: a green proof that could not test the thing that was broken.
//
// HOW it's faithful (§13): it imports and drives the REAL interpretSkill orchestration (not a
// re-embed). prompt-forge.ts is stubbed by the loader hook ONLY to avoid its esm.sh URL import; the
// forge the interpreter actually uses is the INJECTED deps.forge below, which reproduces the §9 gate
// (throws iff is_platform_default is truthy) — so a regression to the old mapping fails Test 1 loudly.
//
// Run: node --experimental-strip-types \
//        --import ./scripts/_register-forge-stub.mjs \
//        scripts/skills-interpreter-provenance-smoke.mjs

const { interpretSkill } = await import("../supabase/functions/_shared/skill-interpreter.ts");

let fails = 0;
const check = (name, cond, extra = "") => {
  const ok = !!cond;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// A fake forge that ENFORCES the real §9 gate: platform-default content requires an operator role.
// It records the is_platform_default it received so we can assert the interpreter's decision directly.
const makeForge = () => {
  const seen = { is_platform_default: undefined, calls: 0 };
  const forge = async (params) => {
    seen.calls++;
    seen.is_platform_default = params.is_platform_default;
    const role = String(params.actorRole ?? "").trim().toLowerCase();
    const OPERATOR = new Set(["operator", "god", "super_admin", "superadmin", "platform_admin"]);
    // Mirror assertTenantScope (model-router-gates.ts): platform-default requires an operator role.
    if (params.is_platform_default && !OPERATOR.has(role)) {
      throw new Error("[§9] platform-default content requires an operator role (operator/god/super_admin)");
    }
    return { result: { content: "Forged draft body.", provider: "test", needs_config: false } };
  };
  return { forge, seen };
};

// Minimal chainable fake admin — supports the approval insert path (contactId=null skips context reads).
const fakeAdmin = {
  from() {
    const chain = {
      insert() { return chain; },
      select() { return chain; },
      single: async () => ({ data: { id: "appr-test-1" }, error: null }),
      eq() { return chain; },
      order() { return chain; },
      limit: async () => ({ data: [], error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return chain;
  },
};

const baseSkill = {
  slug: "compliance_requirement_scan",
  name: "Compliance Requirement Scan",
  category: "compliance_legal",
  risk_level: "draft",
  autonomy_lane: "confirm",
  methodology_anchor: "A structured control-mapping pass over the declared obligations.",
  scoping: "platform",
  tier_availability: null,
  steps: [{ id: "s1", tool: "generate", desc: "Draft the requirement scan." }],
  allowed_tools: ["generate"],
};

const baseCtx = (over = {}) => ({
  skill: baseSkill,
  inputs: { prompt: "Scan our onboarding process." },
  contactId: null,
  tenantId: "tenant-abc",
  callerTier: null,
  actorUserId: "user-1",
  actorRole: "admin", // a NON-operator caller — the exact prod shape
  runId: "run-1",
  ...over,
});

// ── Test 1 — THE FIX: a platform-scoped skill, non-operator caller, tenant resolved → NOT failed ──
{
  const { forge, seen } = makeForge();
  const res = await interpretSkill({ forge, admin: fakeAdmin }, baseCtx());
  check("1a: platform-scoped skill + non-operator 'admin' caller does NOT fail (pre-#135 = 'failed')",
    res.status !== "failed", `status=${res.status} err=${res.error ?? ""}`);
  check("1b: draft(confirm) skill lands in awaiting_approval (real completion)",
    res.status === "awaiting_approval", `status=${res.status}`);
  check("1c: interpreter passed is_platform_default=false to forge (the fix, direct)",
    seen.is_platform_default === false, `is_platform_default=${String(seen.is_platform_default)}`);
  check("1d: forge was actually invoked (the run reached generation)", seen.calls === 1, `calls=${seen.calls}`);
}

// ── Test 2 — every non-operator invoker_kind now runs (mcp/coach/paige/system) ──
for (const role of ["mcp", "coach", "paige", "system", null]) {
  const { forge } = makeForge();
  const res = await interpretSkill({ forge, admin: fakeAdmin }, baseCtx({ actorRole: role }));
  check(`2: caller role ${role === null ? "null" : `'${role}'`} completes (not §9-failed)`,
    res.status === "awaiting_approval", `status=${res.status} err=${res.error ?? ""}`);
}

// ── Test 3 — an OPERATOR caller still works (no regression for god/super_admin) ──
{
  const { forge, seen } = makeForge();
  const res = await interpretSkill({ forge, admin: fakeAdmin }, baseCtx({ actorRole: "super_admin" }));
  check("3: operator 'super_admin' caller still completes", res.status === "awaiting_approval", `status=${res.status}`);
  check("3b: is_platform_default false even for operator (tenant run is tenant content)",
    seen.is_platform_default === false);
}

// ── Test 4 — read_only + auto lane → succeeded (execute), still is_platform_default=false ──
{
  const { forge, seen } = makeForge();
  const roSkill = { ...baseSkill, slug: "capacity_review", risk_level: "read_only", autonomy_lane: "auto",
    steps: [{ id: "s1", tool: "generate", desc: "Review capacity." }] };
  const res = await interpretSkill({ forge, admin: fakeAdmin }, baseCtx({ skill: roSkill }));
  check("4: read_only+auto skill runs to succeeded (execute lane)", res.status === "succeeded", `status=${res.status}`);
  check("4b: is_platform_default still false on the execute path", seen.is_platform_default === false);
}

// ── Test 5 — the §16 risk FLOOR still holds: external_send + auto → approval, never execute ──
{
  const { forge } = makeForge();
  const esSkill = { ...baseSkill, slug: "overdue_invoice_followup", risk_level: "external_send", autonomy_lane: "auto",
    steps: [{ id: "s1", tool: "generate", desc: "Draft the follow-up." }] };
  const res = await interpretSkill({ forge, admin: fakeAdmin }, baseCtx({ skill: esSkill }));
  check("5: external_send+auto is clamped to awaiting_approval (never auto-executed)",
    res.status === "awaiting_approval", `status=${res.status}`);
}

// ── Test 6 — tenant still REQUIRED: no tenant → honest needs_config, never a silent forge ──
{
  const { forge, seen } = makeForge();
  const res = await interpretSkill({ forge, admin: fakeAdmin }, baseCtx({ tenantId: null }));
  check("6: no tenant resolves to needs_config (honest degrade, §9/§13)", res.status === "needs_config", `status=${res.status}`);
  check("6b: forge NOT called when tenant unresolved", seen.calls === 0, `calls=${seen.calls}`);
}

console.log(`\n${fails === 0 ? "ALL GREEN" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
