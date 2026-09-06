// Task #15 — throwaway-Postgres behavioral proof for the dedicated-chat in-place image refine
// migrations (§32: proves the SQL BEHAVES, not just that it applies). Spins an isolated PostgreSQL 16
// cluster under outputs/, applies BOTH migrations onto a minimal schema, and asserts:
//   * version preservation: a reuse UPDATE that changes the image snapshots the PRIOR image into
//     marketing_content.meta.versions[] before overwriting the live image (never silently lost);
//   * no spurious versions: an idempotent re-save of the same image, and a text reuse, add none;
//   * the 20-entry cap drops the oldest;
//   * scalar/array p_meta is normalized so a versions snapshot is never silently dropped (Codex P2);
//   * §9: a cross-tenant p_id is rejected CONTENT_NOT_FOUND (P0002), no cross-tenant write;
//   * the anchor migration applies (columns + FK) and ON DELETE SET NULL clears a deleted image;
//   * the anchor is SERVER-OWNED: the freeze trigger blocks an `authenticated` client from forging a
//     non-null anchor while allowing a clear-to-NULL and the service-role writer (Codex P2 / §59).
//
// Never touches production, PGHOST, cloud creds, or a configured project connection.
// Persisted-apply on prod is §32.a via deploy-migrations.yml; this proves the LOGIC.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, chownSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.env.REFINE_PROOF_PG_BIN || "/usr/lib/postgresql/16/bin";
const migrations = [
  "20261227000000_thread_image_refine_anchor.sql",
  "20261227000001_marketing_content_reuse_preserves_versions.sql",
];
for (const m of migrations) {
  if (!existsSync(join(root, "supabase/migrations", m))) throw new Error(`Required migration absent: ${m}`);
}
const outputRoot = join(root, "outputs", "marketing-content-refine-db-proof");
mkdirSync(outputRoot, { recursive: true });
const runDir = mkdtempSync(join(outputRoot, "run-"));
const cluster = join(runDir, "cluster");
const results = [];
let port, started = false;
// Postgres refuses to run as root. When we ARE root, drop the cluster processes to an unprivileged
// user (the `postgres` account) and give it ownership of the run dir; otherwise run in-process.
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
const TA = "20000000-0000-0000-0000-000000000001"; // tenant A
const TB = "20000000-0000-0000-0000-000000000002"; // tenant B

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
async function rejected(sql, code) {
  const r = await psql(sql, true);
  assert(r.code !== 0, `Expected SQLSTATE ${code}, but call succeeded`);
  assert(r.stderr.includes(code), `Expected SQLSTATE ${code}; received ${r.stderr}`);
}
// Save an IMAGE via the real fn, driven service-role (auth.uid() NULL, p_tenant_id explicit) exactly
// as generate-image drives it. Returns the content id.
const saveImage = (tenant, url, id = null) =>
  scalar(`select public.save_marketing_content('image', 'T', null, null, '${url}', '/p/${url}', 'square', 'b', '{}'::jsonb, ${id ? `'${id}'` : "null"}, '${tenant}');`);
const versions = (id) => json(`select coalesce(meta->'versions','[]'::jsonb) from public.marketing_content where id='${id}';`);
const liveImage = (id) => scalar(`select image_url from public.marketing_content where id='${id}';`);

const MINIMAL_SCHEMA = `
create extension if not exists pgcrypto;
create schema if not exists auth;
-- service-role by default: auth.uid() NULL unless a claim is set (matches how generate-image calls it)
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- minimal stubs for the guards (only exercised on the JWT path; the proof drives service-role)
create or replace function public.current_user_tenant_id() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function public.is_tenant_member(uuid) returns boolean language sql stable as $$ select true $$;
create or replace function public.is_platform_owner(uuid) returns boolean language sql stable as $$ select true $$;
create or replace function public.has_any_role(uuid, text[]) returns boolean language sql stable as $$ select true $$;

create table public.marketing_content (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  created_by uuid,
  kind text not null default 'text',
  channel text, title text, body text,
  image_url text, image_path text, size text, brief text,
  status text not null default 'draft',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, entity text, action text, entity_id uuid, data jsonb, created_at timestamptz default now()
);
-- minimal thread table so the anchor migration's ALTER + FK apply
create table public.paige_chat_threads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid, caller_user_id uuid
);
-- Reproduce the REAL Supabase condition the freeze trigger defends against: a table-level
-- GRANT UPDATE TO authenticated (which is exactly why a column-level REVOKE could not express
-- "server-owned"). service_role stands in for paige-ai-chat's writer.
do $$ begin
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.paige_chat_threads to authenticated, service_role;
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

  await test("both migrations apply on isolated real PostgreSQL 16", async () => {
    for (const m of migrations) await psql(read(`supabase/migrations/${m}`));
  });

  await test("anchor columns + FK exist on paige_chat_threads", async () => {
    const cols = await scalar(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name='paige_chat_threads' and column_name in ('last_image_content_id','last_image_anchor_at');`);
    assert(cols === "last_image_anchor_at,last_image_content_id", `anchor columns missing: ${cols}`);
  });

  await test("a reuse that CHANGES the image snapshots the prior image into meta.versions (never lost)", async () => {
    const id = await saveImage(TA, "v1.png");
    assert((await versions(id)).length === 0, "fresh image should have no versions");
    await saveImage(TA, "v2.png", id); // reuse -> overwrite
    const v = await versions(id);
    assert(v.length === 1, `expected 1 preserved version, got ${v.length}`);
    assert(v[0].image_url === "v1.png", `prior image not preserved: ${JSON.stringify(v[0])}`);
    assert((await liveImage(id)) === "v2.png", "live image should be the new one");
  });

  await test("a second change stacks a second version, oldest-first, and keeps the live image newest", async () => {
    const id = await saveImage(TA, "a.png");
    await saveImage(TA, "b.png", id);
    await saveImage(TA, "c.png", id);
    const v = await versions(id);
    assert(v.length === 2 && v[0].image_url === "a.png" && v[1].image_url === "b.png", `bad lineage: ${JSON.stringify(v.map(x=>x.image_url))}`);
    assert((await liveImage(id)) === "c.png", "live image should be c.png");
  });

  await test("an idempotent re-save of the SAME image adds no version", async () => {
    const id = await saveImage(TA, "same.png");
    await saveImage(TA, "same.png", id);
    assert((await versions(id)).length === 0, "re-saving the same image must not create a version");
  });

  await test("a TEXT reuse (no image) adds no version", async () => {
    const id = await scalar(`select public.save_marketing_content('text','Title','body one', null, null, null, null, 'b', '{}'::jsonb, null, '${TA}');`);
    await psql(`select public.save_marketing_content('text','Title','body two', null, null, null, null, 'b', '{}'::jsonb, '${id}', '${TA}');`);
    assert((await versions(id)).length === 0, "text reuse must not create image versions");
    assert((await scalar(`select body from public.marketing_content where id='${id}';`)) === "body two", "text body should update");
  });

  await test("meta.versions is capped at 20 (oldest dropped)", async () => {
    const id = await saveImage(TA, "cap0.png");
    for (let i = 1; i <= 22; i++) await saveImage(TA, `cap${i}.png`, id);
    const v = await versions(id);
    assert(v.length === 20, `expected cap of 20, got ${v.length}`);
    // oldest kept is cap2 (cap0 + cap1 dropped: 22 priors snapshotted, keep newest 20)
    assert(v[0].image_url === "cap2.png", `oldest kept should be cap2, got ${v[0].image_url}`);
    assert(v[19].image_url === "cap21.png", `newest version should be cap21, got ${v[19].image_url}`);
    assert((await liveImage(id)) === "cap22.png", "live image should be cap22");
  });

  await test("version history is SERVER-OWNED: a non-image reuse cannot WIPE or FORGE meta.versions", async () => {
    const id = await saveImage(TA, "w1.png");
    await saveImage(TA, "w2.png", id); // versions=[w1]
    await saveImage(TA, "w3.png", id); // versions=[w1,w2]
    let v = await versions(id);
    assert(v.length === 2, `precondition: expected 2 versions, got ${v.length}`);
    // non-image reuse (title only), p_meta defaults to '{}': must NOT wipe the accumulated history
    await psql(`select public.save_marketing_content('image','New Title', null, null, null, null, null, 'b', '{}'::jsonb, '${id}', '${TA}');`);
    v = await versions(id);
    assert(v.length === 2 && v[0].image_url === "w1.png" && v[1].image_url === "w2.png", `history wiped by non-image reuse: ${JSON.stringify(v.map((x) => x.image_url))}`);
    // forge attempt: a caller-supplied meta.versions must be IGNORED (server history wins)
    await psql(`select public.save_marketing_content('image','New Title', null, null, null, null, null, 'b', '{"versions":[{"image_url":"forged.png"}]}'::jsonb, '${id}', '${TA}');`);
    v = await versions(id);
    assert(v.length === 2 && v[0].image_url === "w1.png" && v[1].image_url === "w2.png", `history forged by caller p_meta: ${JSON.stringify(v.map((x) => x.image_url))}`);
    assert((await liveImage(id)) === "w3.png", "live image unchanged by non-image reuse");
  });

  await test("§9: a reuse targeting ANOTHER tenant's content_id is rejected CONTENT_NOT_FOUND (no cross-tenant write)", async () => {
    const idA = await saveImage(TA, "tenantA.png");
    await rejected(`select public.save_marketing_content('image','T',null,null,'evil.png','/p/evil.png','square','b','{}'::jsonb,'${idA}','${TB}');`, "P0002");
    assert((await liveImage(idA)) === "tenantA.png", "tenant A's image must be untouched by a tenant B reuse attempt");
    assert((await versions(idA)).length === 0, "tenant A's row must gain no version from a rejected cross-tenant reuse");
  });

  await test("anchor FK ON DELETE SET NULL clears a deleted image", async () => {
    const id = await saveImage(TA, "anchored.png");
    const th = await scalar(`insert into public.paige_chat_threads(tenant_id, caller_user_id, last_image_content_id, last_image_anchor_at) values ('${TA}', gen_random_uuid(), '${id}', now()) returning id;`);
    assert((await scalar(`select last_image_content_id from public.paige_chat_threads where id='${th}';`)) === id, "anchor should be set");
    await psql(`delete from public.marketing_content where id='${id}';`);
    assert((await scalar(`select coalesce(last_image_content_id::text,'NULL') from public.paige_chat_threads where id='${th}';`)) === "NULL", "anchor should clear when the image is deleted");
  });

  await test("anchor is SERVER-OWNED: an `authenticated` client cannot FORGE a non-null anchor; service_role can", async () => {
    const imgA = await saveImage(TA, "srv-a.png");
    const imgB = await saveImage(TA, "srv-b.png");
    const th = await scalar(`insert into public.paige_chat_threads(tenant_id, caller_user_id) values ('${TA}', gen_random_uuid()) returning id;`);
    // (1) authenticated tries to SET a non-null anchor from NULL → frozen (reverted to prior NULL)
    await psql(`set role authenticated; update public.paige_chat_threads set last_image_content_id='${imgA}', last_image_anchor_at=now() where id='${th}'; reset role;`);
    assert((await scalar(`select coalesce(last_image_content_id::text,'NULL') from public.paige_chat_threads where id='${th}';`)) === "NULL", "authenticated forge from NULL must be frozen");
    // (2) service_role (paige-ai-chat's writer) sets it → allowed
    await psql(`set role service_role; update public.paige_chat_threads set last_image_content_id='${imgA}', last_image_anchor_at=now() where id='${th}'; reset role;`);
    assert((await scalar(`select last_image_content_id from public.paige_chat_threads where id='${th}';`)) === imgA, "service_role must be able to set the anchor");
    // (3) authenticated tries to REDIRECT it to a different non-null id → frozen (stays imgA)
    await psql(`set role authenticated; update public.paige_chat_threads set last_image_content_id='${imgB}' where id='${th}'; reset role;`);
    assert((await scalar(`select last_image_content_id from public.paige_chat_threads where id='${th}';`)) === imgA, "authenticated redirect to another id must be frozen");
    // (3b) authenticated tries a TIMESTAMP-ONLY bump (id unchanged, future anchor_at to extend the
    // recency window) → frozen (anchor_at unchanged). This is the Codex P2 the "id changed" predicate missed.
    const beforeTs = await scalar(`select last_image_anchor_at from public.paige_chat_threads where id='${th}';`);
    await psql(`set role authenticated; update public.paige_chat_threads set last_image_anchor_at = now() + interval '1 day' where id='${th}'; reset role;`);
    assert((await scalar(`select last_image_anchor_at from public.paige_chat_threads where id='${th}';`)) === beforeTs, "authenticated timestamp-only bump must be frozen");
    // (4) authenticated CLEAR to NULL → allowed (owner: clear on failed generation; also lets the FK cascade work)
    await psql(`set role authenticated; update public.paige_chat_threads set last_image_content_id=null, last_image_anchor_at=null where id='${th}'; reset role;`);
    assert((await scalar(`select coalesce(last_image_content_id::text,'NULL') from public.paige_chat_threads where id='${th}';`)) === "NULL", "clearing the anchor to NULL must be allowed");
    // (5) authenticated INSERT of a NEW thread carrying a forged non-null anchor → forced NULL (the
    // write vector a BEFORE UPDATE trigger alone missed — Codex P2). Service_role INSERT keeps it.
    const thForge = await scalar(`set role authenticated; insert into public.paige_chat_threads(tenant_id, caller_user_id, last_image_content_id, last_image_anchor_at) values ('${TA}', '00000000-0000-0000-0000-0000000000aa', '${imgA}', now()) returning id;`);
    assert((await scalar(`select coalesce(last_image_content_id::text,'NULL') from public.paige_chat_threads where id='${thForge}';`)) === "NULL", "authenticated INSERT with a forged anchor must be forced NULL");
  });

  await test("scalar/array p_meta does not silently DROP the versions snapshot (jsonb_set object-key contract)", async () => {
    // scalar (JSON string) meta
    const s = await saveImage(TA, "sm1.png");
    await saveImage(TA, "sm2.png", s); // versions=[sm1]
    await psql(`select public.save_marketing_content('image','T',null,null,'sm3.png','/p/sm3.png','square','b','"scalar-meta"'::jsonb,'${s}','${TA}');`);
    let v = await versions(s);
    assert(v.length === 2 && v[0].image_url === "sm1.png" && v[1].image_url === "sm2.png", `scalar meta dropped versions: ${JSON.stringify(v.map((x)=>x.image_url))}`);
    assert((await scalar(`select jsonb_typeof(meta) from public.marketing_content where id='${s}';`)) === "object", "meta must be normalized to an object");
    assert((await liveImage(s)) === "sm3.png", "live image should be sm3");
    // array meta (the "incompatible array path" case the reviewer flagged)
    const a = await saveImage(TA, "am1.png");
    await saveImage(TA, "am2.png", a); // versions=[am1]
    await psql(`select public.save_marketing_content('image','T',null,null,'am3.png','/p/am3.png','square','b','[1,2,3]'::jsonb,'${a}','${TA}');`);
    v = await versions(a);
    assert(v.length === 2 && v[0].image_url === "am1.png" && v[1].image_url === "am2.png", `array meta dropped versions: ${JSON.stringify(v.map((x)=>x.image_url))}`);
    assert((await scalar(`select jsonb_typeof(meta) from public.marketing_content where id='${a}';`)) === "object", "array meta must be normalized to an object");
  });

  await test("INSERT strips caller-supplied meta.versions so fabricated history cannot be planted (Codex P2)", async () => {
    // create (p_id NULL) with a forged versions array in p_meta → stored meta must carry NO versions
    const id = await scalar(`select public.save_marketing_content('image','T',null,null,'ins1.png','/p/ins1.png','square','b','{"versions":[{"image_url":"forged-on-insert.png"}],"keep":"me"}'::jsonb, null, '${TA}');`);
    assert((await versions(id)).length === 0, "forged versions on INSERT must be stripped");
    // a non-versions key the caller passed is preserved (we strip only `versions`, not all meta)
    assert((await scalar(`select meta->>'keep' from public.marketing_content where id='${id}';`)) === "me", "non-versions caller meta must be preserved on INSERT");
    // and a real reuse then builds server-owned history from an empty base
    await saveImage(TA, "ins2.png", id);
    const v = await versions(id);
    assert(v.length === 1 && v[0].image_url === "ins1.png", `reuse after insert should start clean: ${JSON.stringify(v.map((x)=>x.image_url))}`);
  });

  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\n${results.length - failed.length}/${results.length} assertions passed.`);
  await cleanup();
  process.exit(failed.length ? 1 : 0);
} catch (e) {
  console.error("PROOF ABORTED:", e.message);
  await cleanup();
  process.exit(1);
}
