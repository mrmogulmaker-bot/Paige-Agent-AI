#!/usr/bin/env node
/**
 * paige-n8n — the REAL handler's outbound protections, driven end to end.
 *
 * WHY THIS EXISTS
 *
 * `paige-n8n` carried its own copy of the SSRF validator. Four copies of that
 * validator shipped across this codebase and every one of them was missing the same
 * three protections — credentials in the URL, a bounded wall clock, a bounded response
 * body. A guard asserted in a header comment is what let that happen four times, so
 * this asserts on what the handler actually does with a real Request in and a real
 * socket out.
 *
 * THE DEFECT CLASS, STATED ONCE
 *
 * This function sends the workspace's own n8n API key as `X-N8N-API-KEY` to an address
 * the workspace stored. `set_tenant_n8n_connection` validates only `^https://`, so
 * `https://real.n8n.cloud@evil.example/` is storable — and it READS as real.n8n.cloud
 * to anyone skimming Settings while `URL.hostname` is `evil.example`. A validator that
 * checks the hostname alone vets `evil.example`, finds it public, and passes; the key
 * then goes to the attacker. Nothing about the hostname check is wrong. It is simply
 * not the whole URL.
 *
 * WHAT IS SUBSTITUTED, AND WHAT IS NOT
 *
 *   - The Supabase client (canned auth, role, tenant and secret rows) and the `Deno`
 *     global (env, `serve` capture, and `resolveDns`, because this runs under Node).
 *   - Address translation: the guard sees the real hostname and runs in full; only
 *     afterwards is the connection pointed at a local server, so redirect status, byte
 *     counting and the abort all happen over a genuine socket.
 *
 * The handler, its routing, its guard and both of its outbound call sites are the
 * shipped code.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const TENANT = "7f3d2c11-1111-4111-8111-111111111111";
const API_KEY = "n8n_live_KEY_THAT_MUST_NOT_LEAK_9f8a7b6c5d4e";

// ── DNS. Only what each case is about; anything else is genuinely unresolvable. ──
const DNS = {
  "n8n.example": { A: ["93.184.216.34"] },
  "evil.example": { A: ["93.184.216.34"] },
  "rebind.example": { A: ["10.0.0.7"] },
};

// ── A real server, and a record of every request that reached it ─────────────
const received = [];
const routes = new Map();
let PORT;
await new Promise((resolve) => {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      received.push({ url: req.url, headers: req.headers, body: raw });
      const key = [...routes.keys()].find((k) => req.url.startsWith(k));
      if (!key) { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"data":[]}'); return; }
      routes.get(key)(req, res);
    });
  });
  server.listen(0, "127.0.0.1", () => { PORT = server.address().port; globalThis.__SERVER__ = server; resolve(); });
});

const realFetch = globalThis.fetch;
const contacted = [];
globalThis.fetch = (url, init) => {
  const u = new URL(url);
  // Recorded BEFORE translation, so a case can assert on the host that would really
  // have been contacted — which is the whole question for the credentials case.
  contacted.push({ host: u.host, href: u.href, headers: init?.headers ?? {} });
  return realFetch(`http://127.0.0.1:${PORT}${u.pathname}${u.search}`, init);
};

// ── Bundle the real function and capture its handler ─────────────────────────
const stubSrc = `export function createClient(){ return globalThis.__CLIENT__; }`;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "paige-n8n-ssrf-"));
const outFile = path.join(outDir, "index.mjs");
await build({
  entryPoints: ["supabase/functions/paige-n8n/index.ts"],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  plugins: [{
    name: "remote-stub",
    setup(b) {
      b.onResolve({ filter: /^https:\/\// }, (a) => ({ path: a.path, namespace: "remote-stub" }));
      b.onLoad({ filter: /.*/, namespace: "remote-stub" }, () => ({ contents: stubSrc, loader: "js" }));
    },
  }],
});

let handler = null;
globalThis.Deno = {
  env: { get: (k) => ({ SUPABASE_URL: "https://ref.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "svc" }[k]) },
  serve: (h) => { handler = h; },
  resolveDns: async (host, kind) => {
    const rec = DNS[host]?.[kind];
    if (!rec) throw new Error("no records");
    return rec;
  },
};
await import(pathToFileURL(outFile).href);
if (typeof handler !== "function") { console.error("FAILED: did not capture the Deno.serve handler"); process.exit(1); }

/** A client that answers every read the handler makes before it goes outbound. */
function makeClient(baseUrl) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u-1" } } }) },
    rpc: async (fn) => {
      if (fn === "has_role") return { data: true, error: null };
      if (fn === "current_user_tenant_id") return { data: TENANT, error: null };
      if (fn === "get_tenant_n8n_secret") return { data: { configured: true, base_url: baseUrl, api_key: API_KEY }, error: null };
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      upsert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  };
}

/**
 * The handler under a bounded wait.
 *
 * The wait exists because one of the defects under test IS an unbounded wait: without
 * it the run hangs on the hung-instance case and reports nothing, and a proof that
 * hangs instead of failing is not a proof. `timedOut` is therefore a first-class
 * result, not an error — it is what "the function has no deadline of its own" looks
 * like from the outside.
 */
const SMOKE_DEADLINE_MS = 20_000;
async function call(baseUrl, body) {
  contacted.length = 0;
  received.length = 0;
  globalThis.__CLIENT__ = makeClient(baseUrl);
  const run = handler(new Request("https://ref.functions.supabase.co/functions/v1/paige-n8n", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer jwt" },
    body: JSON.stringify(body),
  }));
  let timer;
  const bail = new Promise((r) => { timer = setTimeout(() => r("__SMOKE_TIMEOUT__"), SMOKE_DEADLINE_MS); });
  const res = await Promise.race([run.catch((e) => ({ __threw: e })), bail]);
  clearTimeout(timer);
  if (res === "__SMOKE_TIMEOUT__") {
    return { timedOut: true, status: 0, body: null, contacted: [...contacted], received: [...received] };
  }
  if (res && res.__threw) {
    return { threw: String(res.__threw), status: 0, body: null, contacted: [...contacted], received: [...received] };
  }
  let parsed = null;
  try { parsed = JSON.parse(await res.text()); } catch { /* non-JSON */ }
  return { status: res.status, body: parsed, contacted: [...contacted], received: [...received] };
}

let passed = 0;
const failures = [];
const check = (label, cond, detail = "") => {
  if (cond) { passed += 1; console.log(`  ok  ${label}`); }
  else { failures.push(`${label}${detail ? " — " + detail : ""}`); console.log(`  FAIL ${label} ${detail}`); }
};
/** Did the workspace's API key leave the process, to anyone? */
const keyWentTo = (r) => r.contacted.filter((c) => JSON.stringify(c.headers).includes(API_KEY)).map((c) => c.host);

console.log("\npaige-n8n outbound protections (real handler)\n");
console.log("— credentials in the stored URL —");

{
  // The parser-confusion form. It reads as real.n8n.cloud; it resolves to evil.example.
  const r = await call("https://real.n8n.cloud@evil.example/", { action: "list" });
  check("a URL with an embedded userinfo is refused", r.body?.error === "unsafe_instance_url", JSON.stringify(r.body).slice(0, 120));
  check("...and the workspace's API key never leaves the process",
    keyWentTo(r).length === 0, `sent to: ${keyWentTo(r).join(", ")}`);
  check("...and nothing at all is contacted", r.contacted.length === 0, r.contacted.map((c) => c.host).join(", "));
}
{
  const r = await call("https://admin:hunter2@n8n.example/", { action: "list" });
  check("a URL carrying a password is refused", r.body?.error === "unsafe_instance_url");
  check("...and the password is never put on the wire",
    !JSON.stringify(r.contacted).includes("hunter2"));
}

console.log("\n— protocol, host and address —");
for (const [label, url, ] of [
  ["http:// is refused", "http://n8n.example/"],
  ["localhost is refused", "https://localhost/"],
  ["a loopback literal is refused", "https://127.0.0.1/"],
  ["the cloud metadata address is refused", "https://169.254.169.254/"],
  ["an RFC1918 literal is refused", "https://10.1.2.3/"],
  ["a .internal host is refused", "https://n8n.internal/"],
  ["a host that resolves inside is refused", "https://rebind.example/"],
  ["an unresolvable host fails closed", "https://nowhere.example/"],
]) {
  const r = await call(url, { action: "list" });
  check(label, r.body?.error === "unsafe_instance_url", JSON.stringify(r.body ?? {}).slice(0, 90));
  check(`...and no key is sent for ${new URL(url).host}`, keyWentTo(r).length === 0);
}

console.log("\n— the REST call —");
{
  routes.set("/api/v1/workflows", (_q, res) => {
    res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data/" });
    res.end();
  });
  const r = await call("https://n8n.example/", { action: "list" });
  // Asserted on the REASON, not merely on "an error happened". With the refusal
  // removed the 3xx arrives as a non-ok result and the handler still errors — as
  // `n8n_302` — so a check for "some error" stays green while the protection is gone.
  // And a redirect followed inside the HTTP client is invisible from out here, so
  // "the target was never contacted" cannot see the case it names either.
  // Named as a redirect and NOT as an unsafe address. The refusal is the same; what an
  // admin is told is not. A healthy instance that has moved redirects, and telling its
  // owner their address points somewhere private is both false and unactionable.
  check("a redirect from the instance is REFUSED, by name",
    r.body?.error === "instance_url_redirects" && r.body?.detail === "url_redirect_refused",
    JSON.stringify(r.body ?? {}).slice(0, 110));
  check("...and no request to the redirect target is made from here",
    !r.contacted.some((c) => c.host.includes("169.254")), r.contacted.map((c) => c.host).join(", "));
  routes.delete("/api/v1/workflows");
}
{
  routes.set("/api/v1/workflows", (_q, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    // Far larger than any sane API answer, streamed, so the cap has to hold during
    // the read rather than after the memory is already spent.
    res.write('{"data":[');
    for (let i = 0; i < 400; i++) res.write(JSON.stringify({ id: String(i), name: "x".repeat(10_000), active: false }) + ",");
    res.write('{"id":"z","name":"z","active":false}]}');
    res.end();
  });
  const started = Date.now();
  const r = await call("https://n8n.example/", { action: "list" });
  check("an enormous instance response does not flood the function",
    !r.timedOut && JSON.stringify(r.body ?? {}).length < 200_000,
    r.timedOut ? "never returned" : `${JSON.stringify(r.body ?? {}).length} bytes`);
  check("...and it still returns rather than hanging", !r.timedOut, `${Date.now() - started}ms`);
  routes.delete("/api/v1/workflows");
}
{
  routes.set("/api/v1/workflows", (_q, res) => { res.writeHead(200, { "Content-Type": "application/json" }); /* never ends */ });
  const started = Date.now();
  const r = await call("https://n8n.example/", { action: "list" });
  const elapsed = Date.now() - started;
  check("a hung instance does not pin the function forever",
    !r.timedOut, r.timedOut ? `still running after ${elapsed}ms — the handler has no deadline` : `${elapsed}ms`);
  check("...and the failure is reported rather than silently succeeding", !r.timedOut && r.body?.ok !== true);
  routes.delete("/api/v1/workflows");
}

console.log("\n— the webhook fire —");
{
  routes.set("/webhook/", (_q, res) => {
    res.writeHead(302, { Location: "http://10.0.0.9/internal" });
    res.end();
  });
  const r = await call("https://n8n.example/", { action: "run", webhook_path: "abc" });
  check("a redirecting webhook is REFUSED, by name",
    r.body?.detail === "url_redirect_refused", JSON.stringify(r.body ?? {}).slice(0, 110));
  check("...and no request to its redirect target is made from here",
    !r.contacted.some((c) => c.host.includes("10.0.0.9")), r.contacted.map((c) => c.host).join(", "));
  routes.delete("/webhook/");
}
{
  routes.set("/webhook/", (_q, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    for (let i = 0; i < 400; i++) res.write("x".repeat(10_000));
    res.end();
  });
  const started = Date.now();
  const r = await call("https://n8n.example/", { action: "run", webhook_path: "abc" });
  check("an enormous webhook response does not flood the function",
    !r.timedOut && JSON.stringify(r.body ?? {}).length < 200_000,
    r.timedOut ? "never returned" : `${JSON.stringify(r.body ?? {}).length} bytes`);
  check("...and it still returns", !r.timedOut, `${Date.now() - started}ms`);
  routes.delete("/webhook/");
}

console.log("\n— the working case still works —");
{
  routes.set("/api/v1/workflows", (_q, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data: [{ id: "w1", name: "Nurture", active: true, tags: [], updatedAt: "2026-01-01" }] }));
  });
  const r = await call("https://n8n.example/", { action: "list" });
  check("a normal instance still lists its workflows",
    Array.isArray(r.body?.workflows) && r.body.workflows.length === 1, JSON.stringify(r.body ?? {}).slice(0, 140));
  check("...and the API key IS sent, to the right host only",
    keyWentTo(r).length > 0 && keyWentTo(r).every((h) => h === "n8n.example"), keyWentTo(r).join(", "));
  routes.delete("/api/v1/workflows");
}

globalThis.__SERVER__.close();
console.log(`\n${passed} assertions passed.`);
if (failures.length) { console.error(`\n${failures.length} FAILURE(S):\n- ${failures.join("\n- ")}`); process.exit(1); }
