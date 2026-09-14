// Connected MCP Gateway — the approval-write vs endpoint-change RACE is closed (#1262 finding 3).
//
// set_mcp_connection_approval takes a `SELECT ... FOR UPDATE` row lock on the connection before it
// records the approval, so it and any UPDATE of server_url_ct (which fires the 20270322000000
// revoke trigger) contend on the SAME row lock and cannot interleave. This proof forces the two to
// overlap (each holds its transaction open with pg_sleep) and asserts the invariant that the race
// would otherwise break: no approval is ever left bound to an endpoint the connection no longer
// has. Without the FOR UPDATE lock, the writer could read the old endpoint, the endpoint could
// change (deleting nothing, since the write hasn't landed), and the write could then commit a
// stale approval — exactly the interleaving this serialization prevents.
//
// Two concurrent psql processes (no pg dependency), mirroring scripts/proof/business-mission-concurrency.mjs.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const url = new URL(process.env.MCP_GATEWAY_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
assert.equal(url.hostname, "127.0.0.1", "Disposable loopback database required");
const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-d", url.toString()];
const psqlBin = process.env.PSQL_BIN || "psql";
const run = (sql) => execFileSync(psqlBin, args, { input: sql, encoding: "utf8", windowsHide: true }).trim();

const tenant = randomUUID();
const conn = randomUUID();
const suffix = randomUUID().slice(0, 12);
const pin = "a".repeat(64);
const E1 = "https://mcp-race-a.example/rpc";
const E2 = "https://mcp-race-b.example/rpc";

const cleanup = () => run(`
  DELETE FROM public.mcp_connection_approvals WHERE connection_id='${conn}';
  DELETE FROM public.mcp_connections WHERE connection_id='${conn}';
  DELETE FROM public.tenants WHERE id='${tenant}';
`);

const invoke = (sql) => new Promise((resolve, reject) => {
  const child = spawn(psqlBin, args, { windowsHide: true });
  let stdout = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.resume();
  child.on("error", () => reject(new Error("concurrency process unavailable")));
  child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error("concurrency query failed")));
  child.stdin.end(sql);
});

try {
  cleanup();
  run(`
    INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,features)
      VALUES('${tenant}','mcpgw-race-${suffix}','MCPGW Race','active','standalone','MCR','{}'::jsonb);
    INSERT INTO public.mcp_connections(connection_id,tenant_id,provider_key,label,server_url_ct)
      VALUES('${conn}','${tenant}','generic-remote','race-target', public.platform_encrypt('${E1}'));
  `);

  // T1: approve (takes FOR UPDATE on the connection, then holds the txn open). T2: change the
  // endpoint (fires the revoke trigger). Forced to overlap; they serialize on the row lock.
  const approveSql = `BEGIN;
    SELECT public.set_mcp_connection_approval('${conn}','send_message','${pin}','${tenant}');
    SELECT pg_sleep(1); COMMIT;`;
  const repointSql = `BEGIN;
    UPDATE public.mcp_connections SET server_url_ct = public.platform_encrypt('${E2}') WHERE connection_id='${conn}';
    SELECT pg_sleep(1); COMMIT;`;
  await Promise.all([invoke(approveSql), invoke(repointSql)]);

  // The endpoint change committed.
  assert.equal(run(`SELECT public.platform_decrypt(server_url_ct) FROM public.mcp_connections WHERE connection_id='${conn}'`), E2,
    "endpoint change did not land");

  // THE RACE-CLOSED INVARIANT: no approval is left bound to an endpoint the connection no longer
  // has. Holds for BOTH serial orderings — writer-first (the endpoint change's trigger deletes the
  // approval) and endpoint-change-first (the writer binds to the new endpoint).
  const stale = run(`
    SELECT count(*) FROM public.mcp_connection_approvals a
      JOIN public.mcp_connections c ON c.connection_id = a.connection_id
     WHERE a.connection_id='${conn}'
       AND a.endpoint_hash IS DISTINCT FROM public._mcp_endpoint_hash(public.platform_decrypt(c.server_url_ct))`);
  assert.equal(stale, "0", "a stale approval survived the endpoint change — the race is NOT closed");

  // And any surviving approval verifies as authorized against the CURRENT endpoint (never a
  // ghost bound to the old one).
  const surviving = run(`SELECT count(*) FROM public.mcp_connection_approvals WHERE connection_id='${conn}'`);
  if (surviving !== "0") {
    const verdict = run(`SELECT (public.verify_mcp_connection_approval('${conn}','send_message','${pin}',NULL))->>'authorized'`);
    assert.equal(verdict, "true", "a surviving approval did not authorize against the current endpoint");
  }

  console.log(`PASS: approval-write vs endpoint-change serialized on the connection row lock; no stale approval survived (surviving rows: ${surviving}).`);
} finally {
  cleanup();
}
