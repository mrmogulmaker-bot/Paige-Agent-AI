#!/usr/bin/env node
// Regression proof for the ONE shared change this slice makes to `live-drive.mjs`: the agent-proxy
// bypass added to `buildLaunchOptions()`.
//
// WHY THIS EXISTS. `live-drive.mjs` is shared dev tooling — six other drives import it, several of
// them aimed at REMOTE hosts. The bypass exists because the agent relay accepts only HTTPS CONNECT
// tunnels, so a plain-HTTP localhost harness comes back as a 405 page and the app never mounts. The
// owner's exception for this change is conditional: it must stay strictly local-development
// behaviour, with no remote-host bypass and no production or runtime effect, and non-loopback
// drives must be PROVEN unaffected rather than asserted to be.
//
// So this asserts the property, not the string: every entry in the bypass list must be a loopback
// address. A future edit that adds a real host, a wildcard, or a suffix pattern turns this red.
//
// Run: node scripts/live-drive/proxy-bypass.selftest.mjs
import assert from "node:assert/strict";

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name });
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};

// Loopback only. Anything not in this set is a remote host and must never be bypassed.
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
// A wildcard is a LEADING `*` or a leading `.` (the suffix form, ".example.com"), plus Chromium's
// own pattern tokens. A dot INSIDE an address is just an IPv4 address — the first version of this
// check flagged 127.0.0.1 as a wildcard, which is exactly the false-positive class this file is
// meant to avoid producing.
const isWildcard = (e) => e.startsWith("*") || e.startsWith(".") || e.includes("<");

// `buildLaunchOptions` reads HTTPS_PROXY **or** https_proxy, so clearing only the upper-case one
// left the proxy configured and made the first assertion fail against correct code. Save and clear
// every name the function actually consults.
const PROXY_VARS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"];
const saved = Object.fromEntries(PROXY_VARS.map((k) => [k, process.env[k]]));

try {
  const { buildLaunchOptions } = await import("./live-drive.mjs");

  // 1. With NO proxy configured, nothing about the launch changes at all.
  for (const k of PROXY_VARS) delete process.env[k];
  const bare = buildLaunchOptions();
  check(bare.proxy === undefined, "no HTTPS_PROXY -> no proxy option at all, bypass included");
  check(bare.headless === true, "no HTTPS_PROXY -> still headless");

  // 2. With a proxy configured, the proxy is still wired — the bypass must not disable it.
  process.env.HTTPS_PROXY = "http://proxy.invalid:8080";
  const proxied = buildLaunchOptions();
  check(proxied.proxy?.server === "http://proxy.invalid:8080",
    "HTTPS_PROXY set -> the proxy server is still passed through", String(proxied.proxy?.server));

  // 3. THE CONDITION: every bypass entry is a loopback address. No remote host, no wildcard.
  const entries = String(proxied.proxy?.bypass ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  check(entries.length > 0, "a bypass list is present", entries.join(" | "));
  const remote = entries.filter((e) => !LOOPBACK.has(e));
  check(remote.length === 0, "every bypass entry is a loopback address — no remote host is bypassed",
    remote.length ? `REMOTE: ${remote.join(", ")}` : entries.join(" | "));
  const wild = entries.filter(isWildcard);
  check(wild.length === 0, "no wildcard or suffix pattern in the bypass list",
    wild.length ? `WILDCARD: ${wild.join(", ")}` : "none");

  // 4. A non-loopback drive is unaffected: the option object it receives is identical to what it
  //    received before this change, apart from the bypass key, which cannot match its hosts.
  const { bypass, ...withoutBypass } = proxied.proxy;
  assert.deepEqual(withoutBypass, { server: "http://proxy.invalid:8080" });
  check(true, "a remote drive's proxy config is unchanged except for a loopback-only bypass");

  // 5. The bypass is scoped to the proxy, never to the browser at large — no args were added that
  //    could change routing for every host.
  check(!proxied.args.some((a) => /proxy|bypass|host-resolver/i.test(a)),
    "no proxy-related launch ARG was introduced (routing stays a proxy-option concern)",
    proxied.args.join(" "));
} finally {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) { console.error(`\n${failed.length} FAILED`); process.exit(1); }
