// Slice 2 — throwaway-Postgres behavioral proof for the campaign-brief governed seam the chat reach
// consumes (§32: proves the RPC BEHAVES, not just that it applies). Spins an isolated PostgreSQL 16
// cluster under outputs/, creates the prerequisite tables + GUC-stubbed guard helpers, applies the
// REAL campaign-brief foundation migration (20261225000000), then asserts the behaviors the reach
// depends on and the user's directive names — tenant scope, optimistic version, and idempotency:
//   * create-brief (tenant admin) → outcome 'created', version 1, row scoped to the acting tenant;
//   * get_campaign_briefs returns the brief with can_manage true;
//   * §9 cross-tenant: a caller in tenant B asking for tenant A is refused CAMPAIGN_BRIEF_FORBIDDEN
//     (42501) — the arg never widens access, the caller must own the resolved tenant;
//   * §53 non-admin: an authenticated non-admin of the tenant is refused FORBIDDEN;
//   * optimistic concurrency: update-brief with a stale expectedVersion → VERSION_CONFLICT (40001);
//   * idempotency replay: same key + same command returns the STORED result and writes no 2nd row;
//   * idempotency conflict: same key + different command → IDEMPOTENCY_CONFLICT (22023);
//   * linked-record honesty: an offer owned by another tenant → OFFER_TENANT_MISMATCH (23514);
//   * provenance: _actor_kind 'paige' records created_through='paige' (the reach's own path).
//
// Never touches production, PGHOST, cloud creds, or a configured project connection. Persisted-apply
// on prod for the NEW migration (the autonomy catalogue) is §32.a via deploy-migrations.yml; the
// campaign-brief RPCs themselves are already LIVE (20261225000000). This proves the LOGIC the reach
// relies on so the chat wiring is not trusted on a hope.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, chownSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.env.CAMPAIGN_PROOF_PG_BIN || "/usr/lib/postgresql/16/bin";
const MIGRATION = "20261225000000_solo_campaign_briefs_foundation.sql";
if (!existsSync(join(root, "supabase/migrations", MIGRATION))) throw new Error(`Required migration absent: ${MIGRATION}`);

const outputRoot = join(root, "outputs", "campaign-brief-db-proof");
mkdirSync(outputRoot, { recursive: true });
const runDir = mkdtempSync(join(outputRoot, "run-"));
const cluster = join(runDir, "cluster");
const results = [];
let port, started = false;
const amRoot = typeof process.getuid === "function" && process.getuid() === 0;
function resolvePgUser() {
  try {
    const line = readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith("postgres:"));
    if (line) { const f = line.split(":"); return { uid: Number(f[2]), gid: Number(f[3]) }; }
  } catch { /* fall through */ }
  return { uid: 102, gid: 104 };
}
const pgUser = amRoot ? resolvePgUser() : null;
const spawnOpts = amRoot ? { uid: pgUser.uid, gid: pgUser.gid, cwd: runDir } : { cwd: root };
const read = (p) => readFileSync(join(root, p), "utf8");

// ── fixed identities ───────────────────────────────────────────────────────────────────────────
const TA = "20000000-0000-0000-0000-000000000001"; // tenant A
const TB = "20000000-0000-0000-0000-000000000002"; // tenant B
const UA = "10000000-0000-0000-0000-000000000001"; // tenant A owner/admin
const UB = "10000000-0000-0000-0000-000000000002"; // tenant B admin
const OFFER_B = "30000000-0000-0000-0000-000000000002"; // an offer owned by tenant B

function runCmd(exe, args, input = "", allowFailure = false) {
  return new Promise((res, rej) => {
    const child = spawn(exe, args, { ...spawnOpts, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", rej);
    const timer = setTimeout(() => { child.kill(); rej(new Error("db command timed out")); }, 45000);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !allowFailure) rej(new Error(`${exe} failed (${code}): ${stderr}`));
      else res({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}
async function freePort() {
  const s = createServer();
  await new Promise((r, j) => { s.once("error", j); s.listen(0, "127.0.0.1", r); });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const psql = (sql, allowFailure = false) =>
  runCmd(join(bin, "psql"),
    ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "--no-password", "--set", "ON_ERROR_STOP=1"],
    `\\set VERBOSITY verbose\n${sql}`, allowFailure);
const json = async (sql) => JSON.parse((await psql(sql)).stdout.trim() || "null");
const scalar = async (sql) => (await psql(sql)).stdout.trim();
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function test(name, fn) {
  try { await fn(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (e) { results.push({ name, status: "FAIL", error: e.message }); console.error(`FAIL ${name}: ${e.message}`); throw e; }
}

// Set the caller identity the RPC's guards read (auth.uid + tenant + owner/admin flags), then run a
// statement — all in ONE session so the GUCs apply to the call.
// SET statements (not `select set_config`) so the caller setup emits NO result rows — the only
// stdout is the RPC's own JSON, which the parsers below read.
const setCaller = (uid, callerTenant, { owner = false, admin = true } = {}) =>
  `set request.jwt.claim.sub = '${uid}';\n` +
  `set test.tenant = '${callerTenant}';\n` +
  `set test.is_owner = '${owner}';\n` +
  `set test.is_admin = '${admin}';`;

// Call configure_campaign_brief with an EXPLICIT arg tenant (so the cross-tenant test can pass A
// while the caller sits in B). Returns { ok, result, stderr, code }.
async function configure(uid, callerTenant, argTenant, command, key, opts = {}, allowFailure = false) {
  const actor = opts.actor ?? "paige";
  const r = await psql(
    `${setCaller(uid, callerTenant, opts)}\n` +
    `select public.configure_campaign_brief('${argTenant}'::uuid, $j$${JSON.stringify(command)}$j$::jsonb, '${key}', '${actor}');`,
    allowFailure,
  );
  let result = null;
  try { result = JSON.parse((r.stdout || "").trim() || "null"); } catch { /* non-json (error path) */ }
  return { code: r.code, stderr: r.stderr, result };
}
async function listBriefs(uid, callerTenant, argTenant, opts = {}) {
  const r = await psql(
    `${setCaller(uid, callerTenant, opts)}\n` +
    `select public.get_campaign_briefs('${argTenant}'::uuid);`,
  );
  return JSON.parse((r.stdout || "").trim() || "null");
}
async function rejected(promiseFactory, code) {
  const r = await promiseFactory();
  assert(r.code !== 0, `Expected SQLSTATE ${code}, but call succeeded: ${JSON.stringify(r.result)}`);
  assert((r.stderr || "").includes(code), `Expected SQLSTATE ${code}; received: ${r.stderr}`);
}

const MINIMAL_SCHEMA = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users (id uuid primary key);
insert into auth.users(id) values ('${UA}'),('${UB}');
-- roles the migration's GRANT/REVOKE reference
do $$ begin
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
end $$;
grant usage on schema public to authenticated, service_role, anon;

-- GUC-stubbed guard helpers: the proof sets test.* per caller so we can exercise every tier.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function public.current_user_tenant_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.tenant', true), '')::uuid $$;
create or replace function public.is_platform_owner() returns boolean language sql stable as $$
  select coalesce(current_setting('test.is_owner', true) = 'true', false) $$;
create or replace function public.is_tenant_admin(uuid) returns boolean language sql stable as $$
  select coalesce(current_setting('test.is_admin', true) = 'true', false) $$;

-- prerequisite tables the migration references
create table public.tenants (id uuid primary key, owner_user_id uuid);
insert into public.tenants(id, owner_user_id) values ('${TA}','${UA}'),('${TB}','${UB}');
create table public.tenant_products (id uuid primary key, tenant_id uuid not null, name text);
insert into public.tenant_products(id, tenant_id, name) values ('${OFFER_B}','${TB}','Tenant B Offer');
create table public.pipelines (id uuid primary key, tenant_id uuid not null, name text);
create table public.deals (id uuid primary key, pipeline_id uuid, tenant_id uuid);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, entity text, action text, entity_id uuid, data jsonb, created_at timestamptz default now()
);
`;

async function cleanup() {
  if (started) { try { await runCmd(join(bin, "pg_ctl"), ["-D", cluster, "-w", "-t", "20", "stop"], "", true); } catch { /* ignore */ } }
  try { rmSync(runDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

try {
  port = await freePort();
  if (amRoot) { try { chownSync(runDir, pgUser.uid, pgUser.gid); } catch (e) { throw new Error(`cannot chown run dir to postgres user: ${e.message}`); } }
  await runCmd(join(bin, "initdb"), ["-D", cluster, "-U", "postgres", "--auth=trust", "--no-locale", "--encoding=UTF8"]);
  started = true;
  await runCmd(join(bin, "pg_ctl"), ["-D", cluster, "-l", join(runDir, "postgres.log"), "-w", "-t", "30", "-o", `-h 127.0.0.1 -p ${port} -c max_connections=20`, "start"]);
  await psql(MINIMAL_SCHEMA);

  await test("the campaign-brief foundation migration applies on isolated real PostgreSQL 16", async () => {
    await psql(read(`supabase/migrations/${MIGRATION}`));
    const fns = await scalar(`select string_agg(proname, ',' order by proname) from pg_proc where proname in ('configure_campaign_brief','get_campaign_briefs');`);
    assert(fns === "configure_campaign_brief,get_campaign_briefs", `RPCs missing: ${fns}`);
  });

  let briefId = null;
  await test("create-brief (tenant admin, actor=paige) → created, version 1, scoped to the acting tenant", async () => {
    const { result } = await configure(UA, TA, TA, { type: "create-brief", name: "Fall Launch", objective: "Book 10 discovery calls", channels: ["email", "linkedin"] }, "key-create-1");
    assert(result?.ok === true && result.outcome === "created", `unexpected result: ${JSON.stringify(result)}`);
    assert(result.version === 1, `expected version 1, got ${result.version}`);
    briefId = result.brief_id;
    const t = await scalar(`select tenant_id from public.campaign_briefs where id='${briefId}';`);
    assert(t === TA, `brief should be scoped to tenant A, got ${t}`);
    const through = await scalar(`select created_through from public.campaign_briefs where id='${briefId}';`);
    assert(through === "paige", `actor=paige must record created_through=paige, got ${through}`);
  });

  await test("get_campaign_briefs returns the brief with can_manage true for the tenant admin", async () => {
    const out = await listBriefs(UA, TA, TA);
    assert(out?.can_manage === true, `can_manage should be true, got ${JSON.stringify(out?.can_manage)}`);
    const names = (out.briefs || []).map((b) => b.name);
    assert(names.includes("Fall Launch"), `expected the created brief in the list, got ${JSON.stringify(names)}`);
  });

  await test("§9 cross-tenant read: a tenant-B caller asking for tenant A is refused FORBIDDEN (42501)", async () => {
    await rejected(() => psql(`${setCaller(UB, TB)}\nselect public.get_campaign_briefs('${TA}'::uuid);`, true).then((r) => ({ code: r.code, stderr: r.stderr })), "42501");
  });

  await test("§9 cross-tenant write: a tenant-B caller writing to tenant A is refused FORBIDDEN (42501)", async () => {
    await rejected(() => configure(UB, TB, TA, { type: "create-brief", name: "Sneaky" }, "key-cross-1", {}, true), "42501");
    const leaked = await scalar(`select count(*) from public.campaign_briefs where name='Sneaky';`);
    assert(leaked === "0", "cross-tenant write must not have created a row");
  });

  await test("§53 non-admin write: an authenticated non-admin of the tenant is refused FORBIDDEN (42501)", async () => {
    await rejected(() => configure(UA, TA, TA, { type: "create-brief", name: "NoAdmin" }, "key-noadmin-1", { admin: false }, true), "42501");
  });

  await test("optimistic concurrency: update-brief with a stale expectedVersion → VERSION_CONFLICT (40001)", async () => {
    await rejected(() => configure(UA, TA, TA, { type: "update-brief", briefId, expectedVersion: 99, objective: "changed" }, "key-stale-1", {}, true), "40001");
  });

  await test("update-brief with the correct version merges and the trigger bumps version to 2", async () => {
    const { result } = await configure(UA, TA, TA, { type: "update-brief", briefId, expectedVersion: 1, objective: "Book 20 discovery calls" }, "key-update-1");
    assert(result?.ok === true && result.outcome === "updated", `unexpected: ${JSON.stringify(result)}`);
    const v = await scalar(`select version from public.campaign_briefs where id='${briefId}';`);
    assert(v === "2", `version should be 2 after one update, got ${v}`);
    const obj = await scalar(`select objective from public.campaign_briefs where id='${briefId}';`);
    assert(obj === "Book 20 discovery calls", `objective not merged: ${obj}`);
    // key-presence merge: name (absent from the command) must be untouched
    const name = await scalar(`select name from public.campaign_briefs where id='${briefId}';`);
    assert(name === "Fall Launch", `absent field must be preserved, got ${name}`);
  });

  await test("idempotency replay: same key + same command returns the STORED result and writes no 2nd row", async () => {
    const before = await scalar(`select count(*) from public.campaign_briefs where tenant_id='${TA}';`);
    const cmd = { type: "create-brief", name: "Idempotent Campaign" };
    const first = await configure(UA, TA, TA, cmd, "key-idem-1");
    assert(first.result?.outcome === "created", `first call should create: ${JSON.stringify(first.result)}`);
    const second = await configure(UA, TA, TA, cmd, "key-idem-1"); // same key, same payload
    assert(second.result?.brief_id === first.result.brief_id, "replay must return the SAME stored brief id");
    const after = await scalar(`select count(*) from public.campaign_briefs where tenant_id='${TA}';`);
    assert(Number(after) === Number(before) + 1, `replay must NOT write a second row (before=${before}, after=${after})`);
  });

  await test("idempotency conflict: same key + a DIFFERENT command → IDEMPOTENCY_CONFLICT (22023)", async () => {
    await rejected(() => configure(UA, TA, TA, { type: "create-brief", name: "Different Payload Same Key" }, "key-idem-1", {}, true), "22023");
  });

  await test("linked-record honesty: an offer owned by ANOTHER tenant → OFFER_TENANT_MISMATCH (23514)", async () => {
    await rejected(() => configure(UA, TA, TA, { type: "create-brief", name: "Bad Link", offerId: OFFER_B }, "key-badlink-1", {}, true), "23514");
    const leaked = await scalar(`select count(*) from public.campaign_briefs where name='Bad Link';`);
    assert(leaked === "0", "a tenant-mismatched link must not create a row");
  });

  await test("platform owner may act across tenants (is_platform_owner bypass)", async () => {
    const { result } = await configure(UA, TA, TB, { type: "create-brief", name: "Operator Made" }, "key-owner-1", { owner: true });
    assert(result?.ok === true && result.outcome === "created", `owner cross-tenant create should succeed: ${JSON.stringify(result)}`);
    const t = await scalar(`select tenant_id from public.campaign_briefs where name='Operator Made';`);
    assert(t === TB, `operator wrote to the requested tenant B, got ${t}`);
  });

  console.log(`\n✓ campaign-brief-db-proof: ${results.filter((r) => r.status === "PASS").length}/${results.length} behavioral checks passed on real PostgreSQL.`);
  await cleanup();
  process.exit(0);
} catch (e) {
  console.error(`\n✗ campaign-brief-db-proof FAILED: ${e.message}`);
  try { console.error((await psql(`select 1;`, true)).stderr); } catch { /* ignore */ }
  await cleanup();
  process.exit(1);
}
