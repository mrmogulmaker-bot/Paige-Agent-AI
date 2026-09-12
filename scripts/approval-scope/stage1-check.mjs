/**
 * Approval Attribution — Stage 1 behavioural checks.
 *
 * Stage 1 is producer + executor hardening ONLY. No migration, no policy change. These
 * checks exercise the REAL shipped handlers (imported through scripts/approval-scope/
 * stub-hook.mjs, which replaces only the module boundary) and assert two things per case:
 * the response the caller gets, AND that a refused request wrote nothing.
 *
 *   node --import ./scripts/approval-scope/register.mjs scripts/approval-scope/stage1-check.mjs
 *
 * Standalone by design: vitest's include is `src/**`, so this adds no CI surface and
 * package.json is untouched.
 */
import { makeFakeSupabase, writesTo } from "./fake-supabase.mjs";

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

// ── Deno shim: capture the handler each function registers at import ──────────
let handler = null;
const ENV = {
  SUPABASE_URL: "https://stub.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
  SUPABASE_ANON_KEY: "stub-anon",
  PAIGE_BRIDGE_API_KEY: "stub-bridge-token",
};
globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => ENV[k] } };

// console.error is part of the contract here: a refusal must be LOUD (§32).
const errors = [];
const realError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); };

async function load(path) {
  handler = null;
  await import(`${path}?t=${Math.random()}`);
  if (!handler) throw new Error(`no Deno.serve handler captured from ${path}`);
  return handler;
}
const post = (body, headers = {}) =>
  new Request("https://stub.invalid/fn", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const bodyOf = async (res) => { try { return await res.json(); } catch { return null; } };

// ═══ paige-bridge ════════════════════════════════════════════════════════════
console.log("\npaige-bridge — create_pending_approval is refused, and writes nothing");
{
  const fake = makeFakeSupabase({});
  globalThis.__FAKE_SUPABASE__ = fake;
  const h = await load("../../supabase/functions/paige-bridge/index.ts");
  const AUTH = { Authorization: "Bearer stub-bridge-token" };
  errors.length = 0;

  const res = await h(post({
    verb: "create_pending_approval",
    payload: {
      type: "cs_draft",
      draft_content: { subject: "s", body: "b" },
      contact_email: "someone@example.com",
      created_by_n8n_workflow_key: "wf_demo",
    },
  }, AUTH));
  const b = await bodyOf(res);

  check("1.1 refuses with 422", res.status === 422, `got ${res.status}`);
  check("1.2 names tenant_attribution_unavailable", b?.error === "tenant_attribution_unavailable", JSON.stringify(b));
  check("1.3 inserts NOTHING into paige_pending_approvals",
    writesTo(fake, "paige_pending_approvals").length === 0,
    `${writesTo(fake, "paige_pending_approvals").length} write(s)`);
  check("1.4 no unscoped contact lookup runs",
    !fake.__calls.some((c) => c.table === "clients"),
    "the refusal must precede the cross-tenant contact_email lookup");
  check("1.5 refusal is logged loudly with the workflow key",
    errors.some((e) => e.includes("REFUSED") && e.includes("wf_demo")),
    JSON.stringify(errors));

  // Collateral-damage guards: nothing else about the bridge changed.
  const health = await h(post({ verb: "health_check" }, AUTH));
  check("1.6 health_check still succeeds", health.status === 200, `got ${health.status}`);
  const bad = await h(post({ verb: "health_check" }, { Authorization: "Bearer wrong" }));
  check("1.7 bad bearer still rejected", bad.status === 401, `got ${bad.status}`);
}

// ═══ subagent-forge ══════════════════════════════════════════════════════════
console.log("\nsubagent-forge — a proposal with no tenant cannot become an approval");
{
  // The REQUEST uses `slug`/`name`; the stored ROW uses `proposed_slug`/`proposed_name`.
  const VALID = {
    slug: "ops-analyst",
    name: "Ops Analyst",
    description: "Reviews operational throughput and flags bottlenecks for the team.",
    rationale: "No existing specialist covers operational throughput review.",
    system_prompt:
      "You are an operations analyst. Review throughput data, identify bottlenecks, and " +
      "report them plainly with the evidence you used.",
    domain: "ops",
    runtime: "langgraph",
  };
  const proposalNullTenant = {
    id: "prop-1",
    proposed_slug: VALID.slug, proposed_name: VALID.name,
    description: VALID.description, rationale: VALID.rationale,
    system_prompt: VALID.system_prompt, domain: VALID.domain, runtime: VALID.runtime,
    tenant_id: null, status: "draft",
    input_schema: {}, output_schema: {}, triggers: [], config: {},
  };
  const routes = (proposal) => ({
    user_roles: () => ({ data: [{ role: "admin" }], error: null }),
    paige_subagent_factory_quota: () => ({ data: null, error: null }),
    paige_subagent_proposals: (op) =>
      op === "insert" ? { data: proposal, error: null } : { data: proposal, error: null },
    paige_pending_approvals: () => ({ data: { id: "appr-1" }, error: null }),
  });

  const fake = makeFakeSupabase({
    routes: routes(proposalNullTenant),
    user: { id: "user-1", email: "a@b.c" },
  });
  globalThis.__FAKE_SUPABASE__ = fake;
  const h = await load("../../supabase/functions/subagent-forge/index.ts");
  errors.length = 0;

  // NOTE: no tenant_id — this is exactly the platform/operator lane (tenant_id NULL).
  const res = await h(post({ action: "propose", ...VALID }, { Authorization: "Bearer x" }));
  const rb = await bodyOf(res);

  check("2.1 refuses a NULL-tenant proposal (4xx)", res.status >= 400 && res.status < 500, `got ${res.status}`);
  check("2.1b refuses for ATTRIBUTION, not validation",
    typeof rb?.error === "string" && /no business attached/i.test(rb.error),
    JSON.stringify(rb));
  check("2.2 creates NO approval row",
    writesTo(fake, "paige_pending_approvals").length === 0,
    `${writesTo(fake, "paige_pending_approvals").length} write(s)`);
  check("2.3 refusal is logged", errors.some((e) => e.includes("REFUSED")), JSON.stringify(errors));

  // Positive control — an ATTRIBUTED proposal must still route (§37: no half-hardening).
  const attributed = { ...proposalNullTenant, tenant_id: "tenant-A" };
  const fake2 = makeFakeSupabase({ routes: routes(attributed), user: { id: "user-1" } });
  globalThis.__FAKE_SUPABASE__ = fake2;
  const h2 = await load("../../supabase/functions/subagent-forge/index.ts");
  await h2(post({ action: "propose", ...VALID, tenant_id: "tenant-A" }, { Authorization: "Bearer x" }));
  const w = writesTo(fake2, "paige_pending_approvals");
  check("2.4 an attributed proposal STILL creates its approval", w.length === 1, `${w.length} write(s)`);
  check("2.5 and stamps the proposal's tenant, not null",
    w[0]?.payload?.tenant_id === "tenant-A", JSON.stringify(w[0]?.payload?.tenant_id));
}

// ═══ execute-approval ════════════════════════════════════════════════════════
console.log("\nexecute-approval — a NULL-tenant approval is refused before anything is sent");
{
  const approvalRow = (tenant_id) => ({
    id: "appr-1", status: "pending", tenant_id, contact_id: null,
    conversation_id: null, category: "email-draft", type: "cs_draft",
    draft_content: { subject: "s", body: "b" }, metadata: {},
  });
  const build = (tenant_id, membership) => {
    const fetches = [];
    globalThis.fetch = async (u) => { fetches.push(String(u)); return new Response("{}", { status: 200 }); };
    const fake = makeFakeSupabase({
      routes: {
        paige_pending_approvals: (op) => (op === "insert" || op === "update"
          ? { data: approvalRow(tenant_id), error: null }
          : { data: approvalRow(tenant_id), error: null }),
        tenant_members: () => ({ data: membership, error: null }),
        "rpc:has_role": () => ({ data: true, error: null }),
        "rpc:is_platform_owner": () => ({ data: false, error: null }),
      },
      user: { id: "user-1" },
    });
    return { fake, fetches };
  };

  // NULL tenant → refused, nothing claimed, nothing sent.
  {
    const { fake, fetches } = build(null, null);
    globalThis.__FAKE_SUPABASE__ = fake;
    const h = await load("../../supabase/functions/execute-approval/index.ts");
    errors.length = 0;
    const res = await h(post({ approval_id: "appr-1" }, { Authorization: "Bearer jwt" }));
    const b = await bodyOf(res);
    check("3.1 refuses with 422", res.status === 422, `got ${res.status}`);
    check("3.2 names tenant_attribution_missing", b?.error === "tenant_attribution_missing", JSON.stringify(b));
    check("3.3 does NOT claim or mutate the row",
      writesTo(fake, "paige_pending_approvals").length === 0,
      `${writesTo(fake, "paige_pending_approvals").length} write(s)`);
    check("3.4 does NOT reach send-message",
      !fetches.some((u) => u.includes("send-message")), fetches.join(","));
    check("3.5 refusal is logged", errors.some((e) => e.includes("REFUSED")), JSON.stringify(errors));
  }

  // Cross-tenant (attributed, no membership) → still 403, unchanged behaviour.
  {
    const { fake, fetches } = build("tenant-B", null);
    globalThis.__FAKE_SUPABASE__ = fake;
    const h = await load("../../supabase/functions/execute-approval/index.ts");
    const res = await h(post({ approval_id: "appr-1" }, { Authorization: "Bearer jwt" }));
    const b = await bodyOf(res);
    check("3.6 cross-tenant still 403", res.status === 403, `got ${res.status}`);
    check("3.7 cross-tenant names cross_tenant_forbidden", b?.error === "cross_tenant_forbidden", JSON.stringify(b));
    check("3.8 cross-tenant sends nothing", !fetches.some((u) => u.includes("send-message")), fetches.join(","));
  }

  // Own-tenant member → passes the attribution + membership gates (§37 positive control).
  {
    const { fake } = build("tenant-A", { tenant_id: "tenant-A" });
    globalThis.__FAKE_SUPABASE__ = fake;
    const h = await load("../../supabase/functions/execute-approval/index.ts");
    const res = await h(post({ approval_id: "appr-1" }, { Authorization: "Bearer jwt" }));
    const b = await bodyOf(res);
    // Assert on the ERROR CODE, not the status: this fixture carries no recipient
    // address, so the handler legitimately ends at `no_recipient` — also a 422. What
    // must be true is that it got PAST attribution and membership and reached the
    // send stage (the claim UPDATE is the proof it did).
    check("3.9 own-tenant passes the attribution gate",
      b?.error !== "tenant_attribution_missing", JSON.stringify(b));
    check("3.10 own-tenant passes the membership gate",
      b?.error !== "cross_tenant_forbidden", JSON.stringify(b));
    check("3.11 own-tenant reaches the claim/send stage",
      writesTo(fake, "paige_pending_approvals").length > 0,
      "no UPDATE recorded — it never got past the gates");
  }
}

console.error = realError;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("failures:"); failures.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
