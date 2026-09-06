// Disposable-loopback proof: two real PostgreSQL sessions finalize the same digest concurrently.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const runFile = promisify(execFile);
const [psql, port, user, database = "business_vault_test"] = process.argv.slice(2);
if (!psql || !/^\d+$/.test(port ?? "") || !/^[A-Za-z0-9_.-]+$/.test(user ?? "")
  || database !== "business_vault_test") {
  throw new Error("Explicit disposable local psql, port, user, and business_vault_test database required");
}
const args = ["-h", "127.0.0.1", "-p", port, "-U", user, "-d", database, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"];
const query = async (sql) => (await runFile(psql, [...args, "-c", sql], { windowsHide: true })).stdout.trim();
const invoke = (sql) => new Promise((resolve, reject) => {
  const child = spawn(psql, args, { windowsHide: true });
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.resume();
  child.on("error", () => reject(new Error("concurrency process unavailable")));
  child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error("concurrency query failed")));
  child.stdin.end(sql);
});

const tenant = randomUUID();
const actor = randomUUID();
const recordA = randomUUID();
const recordB = randomUUID();
const versionA = randomUUID();
const versionB = randomUUID();
const digest = "d".repeat(64);
const pathA = `${tenant}/${recordA}/${versionA}/${randomUUID()}`;
const pathB = `${tenant}/${recordB}/${versionB}/${randomUUID()}`;
try {
  await query(`
    INSERT INTO auth.users(id,aud,role,email) VALUES('${actor}','authenticated','authenticated','vault-race-${actor}@tests.invalid');
    INSERT INTO public.tenants(id,slug,name,status,account_type,account_number_prefix,account_number,features)
      VALUES('${tenant}','vault-race-${tenant}','Vault race','active','standalone','VRC',9799001,'{}');
    INSERT INTO public.tenant_members(tenant_id,user_id,role,status,is_owner,joined_at)
      VALUES('${tenant}','${actor}','owner','active',true,now());
    INSERT INTO public.profiles(user_id,active_tenant_id) VALUES('${actor}','${tenant}')
      ON CONFLICT(user_id) DO UPDATE SET active_tenant_id=excluded.active_tenant_id;
    INSERT INTO public.business_vault_records(id,tenant_id,title,section,record_type,handling_mode,visibility,
      lifecycle_state,truth_state,source_kind,source_state,interpretation_state,created_by) VALUES
      ('${recordA}','${tenant}','Race A','library','Evidence','store_only','owner_admin','draft','owner_entered','manual_upload','current','not_requested','${actor}'),
      ('${recordB}','${tenant}','Race B','library','Evidence','store_only','owner_admin','draft','owner_entered','manual_upload','current','not_requested','${actor}');
    INSERT INTO public.business_vault_versions(id,tenant_id,record_id,storage_path,original_filename,declared_mime,
      declared_size,validation_state,created_by) VALUES
      ('${versionA}','${tenant}','${recordA}','${pathA}','a.pdf','application/pdf',100,'reserved','${actor}'),
      ('${versionB}','${tenant}','${recordB}','${pathB}','b.pdf','application/pdf',100,'reserved','${actor}');
    INSERT INTO storage.objects(bucket_id,name,owner_id,metadata) VALUES
      ('business-vault-files','${pathA}','${actor}','{"size":100}'),
      ('business-vault-files','${pathB}','${actor}','{"size":100}');
  `);
  const call = (version) => `
    BEGIN; SET LOCAL ROLE service_role;
    SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
    SELECT public.business_vault_finalize_upload('${actor}','${tenant}','${version}',
      'application/pdf',100,'${digest}','validation_unavailable','concurrency proof');
    COMMIT;`;
  const outputs = await Promise.all([invoke(call(versionA)), invoke(call(versionB))]);
  assert.equal(outputs.filter((value) => /"duplicate"\s*:\s*false/.test(value)).length, 1);
  assert.equal(outputs.filter((value) => /"duplicate"\s*:\s*true/.test(value)).length, 1);
  assert.equal(await query(`SELECT count(*) FROM public.business_vault_versions WHERE tenant_id='${tenant}' AND sha256='${digest}' AND validation_state='validation_unavailable';`), "1");
  assert.equal(await query(`SELECT count(*) FROM public.business_vault_versions WHERE tenant_id='${tenant}' AND validation_state='cleanup_pending';`), "1");
  console.log("PASS: two concurrent finalizers produced one current digest and one retryable cleanup duplicate.");
} finally {
  await query(`
    DELETE FROM public.business_vault_activity WHERE tenant_id='${tenant}';
    UPDATE public.business_vault_records SET current_version_id=NULL WHERE tenant_id='${tenant}';
    DELETE FROM public.business_vault_versions WHERE tenant_id='${tenant}';
    DELETE FROM public.business_vault_records WHERE tenant_id='${tenant}';
    DELETE FROM storage.objects WHERE bucket_id='business-vault-files' AND name IN('${pathA}','${pathB}');
    DELETE FROM public.tenant_members WHERE tenant_id='${tenant}';
    DELETE FROM public.profiles WHERE user_id='${actor}';
    DELETE FROM auth.users WHERE id='${actor}';
    DELETE FROM public.tenants WHERE id='${tenant}';
  `);
}
