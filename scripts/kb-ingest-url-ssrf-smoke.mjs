// §32 headless smoke for the kb-ingest-url SSRF migration (task #35).
//
// kb-ingest-url used to carry its OWN per-hostname regex blocklist (BLOCKED_HOST_PATTERNS)
// that matched only the URL's hostname STRING — it never resolved DNS, so a public hostname
// that resolves (or 3xx-rebinds) to a private address, and encoded-IP literals, sailed
// through and got fetched server-side. This slice replaces that regex with the canonical
// `_shared/ssrfGuard.ts assertPublicHttpUrl` (resolves the host + validates every IP
// numerically, https-only, no embedded credentials), applied on the initial URL AND every
// redirect hop inside kb-ingest-url's existing manual redirect loop.
//
// A green `deno check` proves types; this proves BEHAVIOUR under Node where no Deno is
// installed: the REAL imported guard refuses the attack classes, kb's redirect loop
// re-validates every hop (a 302 into a private target is refused, a 302 to another public
// URL is still followed), and the SsrfError→response mapper is honest.
//
// Anti-vacuity: the OLD regex blocklist (reproduced verbatim below) is shown to MISS a
// hostname that resolves to 127.0.0.1 — the exact DNS→private bypass this upgrade closes.
//
// Run:
//   npm run smoke:kb-ingest-url-ssrf
//   (or directly: node --experimental-transform-types scripts/kb-ingest-url-ssrf-smoke.mjs)

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.error("  ✗ FAIL:", name); } };

// ── Stub the Deno host surface the guard reaches for (resolveDns) + a controllable fetch ──
const DNS = new Map([
  ["public.example.test",  { A: ["93.184.216.34"] }],  // a public address
  ["public2.example.test", { A: ["93.184.216.35"] }],  // a second public address
  ["rebind.evil.test",     { A: ["127.0.0.1"] }],       // DNS → loopback (the attack)
  ["private.evil.test",    { A: ["10.1.2.3"] }],        // DNS → RFC1918
]);
globalThis.Deno = {
  resolveDns: async (host, kind) => {
    const rec = DNS.get(host);
    if (!rec || !rec[kind] || rec[kind].length === 0) {
      const e = new Error("no records"); e.name = "NotFound"; throw e;
    }
    return rec[kind];
  },
};

let fetchImpl = async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
globalThis.fetch = (...args) => fetchImpl(...args);

// The REAL canonical guard kb-ingest-url now depends on.
const { assertPublicHttpUrl, SsrfError } = await import(
  new URL("../supabase/functions/_shared/ssrfGuard.ts", import.meta.url).href
);

// ── Mirrors of kb-ingest-url's thin, non-security-critical glue (the same mirroring the
//    web_fetch smoke uses for its handler transform). The security core (assertPublicHttpUrl)
//    is the REAL import above; these mirror the redirect loop + the response mapper verbatim
//    from supabase/functions/kb-ingest-url/index.ts so the smoke reflects the shipped logic. ──
async function kbSafeFetch(startUrl, maxHops = 5) {
  let current = startUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    await assertPublicHttpUrl(current); // throws SsrfError on a non-public / non-https target
    const res = await fetch(current, { headers: { "User-Agent": "Paige-AI-Bot/1.0" }, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
function ssrfResponse(err) {
  switch (err.reason) {
    case "invalid_url":                    return { message: "Invalid URL format", status: 400 };
    case "url_must_be_https":              return { message: "Only HTTPS URLs are allowed", status: 400 };
    case "url_has_embedded_credentials":   return { message: "URLs with embedded credentials aren't allowed", status: 400 };
    case "url_host_not_allowed":
    case "url_host_unresolvable":
    case "url_resolves_to_private_address":
    case "url_redirect_refused":           return { message: "That link points somewhere we can't fetch.", status: 403 };
    default:                               return { message: "That link can't be fetched.", status: 400 };
  }
}

async function guardRefuses(url, expectReason) {
  try { await assertPublicHttpUrl(url); return false; }
  catch (e) { return e instanceof SsrfError && (!expectReason || e.reason === expectReason); }
}

console.log("── the REAL guard kb-ingest-url now uses refuses the attack classes ──");
ok("DNS→loopback refused (the rebind class the old regex missed)", await guardRefuses("https://rebind.evil.test", "url_resolves_to_private_address"));
ok("DNS→RFC1918 refused",             await guardRefuses("https://private.evil.test", "url_resolves_to_private_address"));
ok("non-https refused",               await guardRefuses("http://public.example.test", "url_must_be_https"));
ok("embedded credentials refused",    await guardRefuses("https://user:pass@public.example.test", "url_has_embedded_credentials"));
ok("localhost refused",               await guardRefuses("https://localhost", "url_host_not_allowed"));
ok("169.254 link-local literal refused", await guardRefuses("https://169.254.169.254", "url_host_not_allowed"));
ok("IPv4-mapped-IPv6 loopback refused",  await guardRefuses("https://[::ffff:127.0.0.1]", "url_host_not_allowed"));
ok("public hostname admitted",        !(await guardRefuses("https://public.example.test/a")));

console.log("── ANTI-VACUITY: the OLD regex blocklist MISSED DNS→loopback ──");
// Reproduced verbatim from the pre-migration kb-ingest-url guard.
const oldBlocked = [/^localhost$/i,/^127\./,/^10\./,/^192\.168\./,/^172\.(1[6-9]|2[0-9]|3[01])\./,/^169\.254\./,/^::1$/,/^0\.0\.0\.0$/,/^fc00:/i,/^fd00:/i,/\.local$/i,/\.internal$/i];
const oldWouldBlock = (host) => oldBlocked.some((p) => p.test(host.toLowerCase()));
ok("old regex did NOT block rebind.evil.test (the gap)", oldWouldBlock("rebind.evil.test") === false);
ok("new guard DOES block it",         await guardRefuses("https://rebind.evil.test"));

console.log("── kb redirect loop re-validates EVERY hop ──");
// 302 from a public URL into a private target must be refused at the hop, not followed.
fetchImpl = async (u) => (new URL(String(u)).hostname === "public.example.test"
  ? new Response(null, { status: 302, headers: { location: "https://private.evil.test" } })
  : new Response("SHOULD NOT REACH", { status: 200, headers: { "content-type": "text/html" } }));
let rebindRefused = false, rebindReason = null;
try { await kbSafeFetch("https://public.example.test"); }
catch (e) { rebindRefused = e instanceof SsrfError; rebindReason = e?.reason; }
ok("302 → private target refused at the hop", rebindRefused && rebindReason === "url_resolves_to_private_address");

// 302 from a public URL to ANOTHER public URL is still followed (behavior preserved).
fetchImpl = async (u) => (new URL(String(u)).hostname === "public.example.test"
  ? new Response(null, { status: 302, headers: { location: "https://public2.example.test/final" } })
  : new Response("final page", { status: 200, headers: { "content-type": "text/plain" } }));
let followed = null;
try { const r = await kbSafeFetch("https://public.example.test"); followed = await r.text(); } catch { /* ignore */ }
ok("302 → another public URL is still followed", followed === "final page");

// A direct public 200 returns as-is.
fetchImpl = async () => new Response("direct", { status: 200, headers: { "content-type": "text/plain" } });
let direct = null;
try { const r = await kbSafeFetch("https://public.example.test"); direct = await r.text(); } catch { /* ignore */ }
ok("direct public 200 returned", direct === "direct");

console.log("── SsrfError → honest response mapping ──");
ok("private-address → 403",  ssrfResponse(new SsrfError("url_resolves_to_private_address")).status === 403);
ok("host-not-allowed → 403", ssrfResponse(new SsrfError("url_host_not_allowed")).status === 403);
ok("unresolvable → 403",     ssrfResponse(new SsrfError("url_host_unresolvable")).status === 403);
ok("non-https → 400",        ssrfResponse(new SsrfError("url_must_be_https")).status === 400);
ok("invalid-url → 400",      ssrfResponse(new SsrfError("invalid_url")).status === 400);
ok("embedded-creds → 400",   ssrfResponse(new SsrfError("url_has_embedded_credentials")).status === 400);
ok("mapper never leaks the URL/address", (() => {
  const m = ssrfResponse(new SsrfError("url_resolves_to_private_address", "10.1.2.3"));
  return !m.message.includes("10.1.2.3") && !m.message.includes("evil");
})());

console.log(`\n${fail === 0 ? "✅" : "❌"} kb-ingest-url SSRF smoke: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
