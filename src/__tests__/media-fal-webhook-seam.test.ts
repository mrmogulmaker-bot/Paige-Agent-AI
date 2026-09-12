// @vitest-environment node
// fal webhook verification — REAL ED25519 signature path against a generated
// test keypair (node:crypto), injected as the JWKS. No live fal endpoint, no
// secret values; this pins the owner's callback contract: all four headers
// required, ±300s replay window, signature over rid\nuid\nts\nsha256(body),
// fail-closed on every tamper, and completion-matching stays OUT of this
// module's authority (verified by construction — verifyFalCallback never
// receives a store client at all).
import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import {
  FAL_WEBHOOK_TOLERANCE_SECONDS,
  __clearFalJwksCacheForTests,
  falWebhookSignedMessage,
  sha256Hex,
  verifyFalCallback,
} from "../../supabase/functions/_shared/media-provider/fal-webhook.ts";

// Node's webcrypto satisfies the module's crypto.subtle usage under vitest.
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = (await import("node:crypto")).webcrypto;
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

interface TestKey {
  publicB64Url: string;
  sign(message: string): Uint8Array;
}

function makeEd25519Key(): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // Ed25519 SPKI DER is a fixed 44 bytes: 12-byte header + 32-byte raw key.
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const raw = new Uint8Array(spki.subarray(spki.length - 32));
  return {
    publicB64Url: b64url(raw),
    sign(message: string): Uint8Array {
      return new Uint8Array(nodeSign(null, Buffer.from(message, "utf8"), privateKey));
    },
  };
}

const NOW = 1_800_000_000_000; // fixed clock for replay math
const nowSeconds = Math.floor(NOW / 1000);

async function signedHeaders(key: TestKey, body: string, rid: string, uid: string, ts = String(nowSeconds)) {
  const message = falWebhookSignedMessage(rid, uid, ts, await sha256Hex(body));
  return { requestId: rid, userId: uid, timestamp: ts, signatureHex: hex(key.sign(message)) };
}

afterEach(() => __clearFalJwksCacheForTests());

describe("fal callback verification (ED25519 via injected JWKS)", () => {
  it("accepts a correctly signed callback", async () => {
    const key = makeEd25519Key();
    const body = JSON.stringify({ request_id: "req-1", status: "OK", payload: { images: [] } });
    const headers = await signedHeaders(key, body, "req-1", "user-1");
    const v = await verifyFalCallback({ ...headers, body, nowMs: NOW, jwksFetcher: async () => [{ x: key.publicB64Url }] });
    expect(v).toEqual({ ok: true });
  });

  it("tries every key in the set (rotation-compatible)", async () => {
    const key = makeEd25519Key();
    const decoy = makeEd25519Key();
    const body = "{}";
    const headers = await signedHeaders(key, body, "r", "u");
    const v = await verifyFalCallback({
      ...headers, body, nowMs: NOW,
      jwksFetcher: async () => [{ x: decoy.publicB64Url }, { x: key.publicB64Url }],
    });
    expect(v).toEqual({ ok: true });
  });

  it("rejects a tampered body (signature no longer matches the sha256 in the signed message)", async () => {
    const key = makeEd25519Key();
    const headers = await signedHeaders(key, '{"status":"OK"}', "r", "u");
    const v = await verifyFalCallback({
      ...headers, body: '{"status":"OK","injected":true}', nowMs: NOW,
      jwksFetcher: async () => [{ x: key.publicB64Url }],
    });
    expect(v).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects timestamps outside the ±300s replay window", async () => {
    const key = makeEd25519Key();
    const body = "{}";
    const stale = String(nowSeconds - FAL_WEBHOOK_TOLERANCE_SECONDS - 1);
    const headers = await signedHeaders(key, body, "r", "u", stale);
    const v = await verifyFalCallback({ ...headers, body, nowMs: NOW, jwksFetcher: async () => [{ x: key.publicB64Url }] });
    expect(v).toEqual({ ok: false, reason: "timestamp_outside_window" });
  });

  it("rejects when any of the four headers is missing (fail closed)", async () => {
    const key = makeEd25519Key();
    const body = "{}";
    const headers = await signedHeaders(key, body, "r", "u");
    const fetcher = async () => [{ x: key.publicB64Url }];
    expect(await verifyFalCallback({ ...headers, requestId: null, body, nowMs: NOW, jwksFetcher: fetcher })).toEqual({ ok: false, reason: "missing_headers" });
    expect(await verifyFalCallback({ ...headers, signatureHex: null, body, nowMs: NOW, jwksFetcher: fetcher })).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("rejects a signature made for a different request id (cross-callback replay)", async () => {
    const key = makeEd25519Key();
    const body = "{}";
    const headers = await signedHeaders(key, body, "request-A", "user-1");
    const v = await verifyFalCallback({
      ...headers, requestId: "request-B", body, nowMs: NOW,
      jwksFetcher: async () => [{ x: key.publicB64Url }],
    });
    expect(v).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("the signed message is exactly rid\\nuid\\nts\\nsha256hex(body) — the fal-documented format", async () => {
    const body = '{"x":1}';
    expect(falWebhookSignedMessage("r", "u", "123", await sha256Hex(body))).toBe(`r\nu\n123\n${await sha256Hex(body)}`);
  });
});
