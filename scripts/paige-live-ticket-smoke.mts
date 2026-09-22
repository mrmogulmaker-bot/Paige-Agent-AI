import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consumeRelayTicket, issueRelayTicket, validateRelayTicket } from "../supabase/functions/_shared/paige-live-ticket.ts";

let network = 0;
globalThis.fetch = (async () => { network++; throw new Error("network forbidden"); }) as typeof fetch;
Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  value: class { constructor() { network++; throw new Error("provider socket forbidden"); } },
});

const sessionId = "11111111-1111-4111-8111-111111111111";
const issued = await issueRelayTicket(1_000_000_000_000);
let stored: string | null = issued.storedDigest;
const store = {
  async consume(_sessionId: string, digest: string): Promise<{ tenant: string } | null> {
    await Promise.resolve();
    if (_sessionId !== sessionId || stored !== digest) return null;
    stored = null;
    return { tenant: "server-resolved" };
  },
};
assert.equal((await validateRelayTicket(issued.value, 1_000_000_001_000))?.storedDigest, issued.storedDigest);
assert.equal(await validateRelayTicket(issued.value, issued.expiresAt), null);
assert.equal(await consumeRelayTicket(issued.value + "a", sessionId, store, 1_000_000_001_000), null);
assert.equal(await consumeRelayTicket(issued.value, "not-a-uuid", store, 1_000_000_001_000), null);
const [first, second] = await Promise.all([
  consumeRelayTicket(issued.value, sessionId, store, 1_000_000_001_000),
  consumeRelayTicket(issued.value, sessionId, store, 1_000_000_001_000),
]);
assert.equal(Number(first !== null) + Number(second !== null), 1, "one claim wins the concurrent race");
assert.equal(await consumeRelayTicket(issued.value, sessionId, store, 1_000_000_001_000), null, "replay loses");

const relay = readFileSync(new URL("../supabase/functions/paige-live-relay/index.ts", import.meta.url), "utf8");
const session = readFileSync(new URL("../supabase/functions/paige-live-session/index.ts", import.meta.url), "utf8");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");
assert.match(config, /\[functions\.paige-live-relay\]\s*verify_jwt = false/);
assert.ok(relay.indexOf("consumeRelayTicket(") < relay.indexOf("Deno.upgradeWebSocket(req)"), "claim precedes upgrade");
assert.match(relay, /\.eq\("provider_session_ref", storedDigest\)/);
assert.match(relay, /\.eq\("tenant_id", session.tenant_id\)/);
assert.match(relay, /state: "unavailable", availability: "UNAVAILABLE", failure_code: code/, "terminal provider-free state is durable");
assert.ok(relay.indexOf('markUnavailable("adapters_not_connected")') < relay.indexOf("Deno.upgradeWebSocket(req)"), "terminal state precedes unavailable socket");
assert.ok(session.indexOf('rpc("current_user_tenant_id")') < session.indexOf("issueRelayTicket()"));
assert.ok(session.indexOf('from("paige_chat_threads")') < session.indexOf("issueRelayTicket()"));
assert.doesNotMatch(relay + session, /daily_ceiling|concurrent_session_limit|reserve_paige_voice|allowance_gate/i);
assert.doesNotMatch(relay, /stt-router|tts-router|elevenlabs|DEEPGRAM_API_KEY|ELEVENLABS_API_KEY/);
assert.equal(network, 0);
console.log("✅ relay ticket smoke: expiry, tamper, concurrent one-use, replay, server-scope, pre-upgrade gate, zero network/provider calls");
