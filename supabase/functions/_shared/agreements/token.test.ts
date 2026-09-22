// deno test --allow-import=esm.sh,deno.land supabase/functions/_shared/agreements/token.test.ts
//
// The signer token is the ONLY control on an unauthenticated endpoint, so these assert the
// properties that make it one — not that the functions return something.
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  expiryFromNow,
  mintSignerToken,
  RETRIEVAL_TOKEN_TTL_DAYS,
  sha256Hex,
  SIGNING_TOKEN_TTL_DAYS,
  tokenState,
} from "./token.ts";

Deno.test("a minted token carries 256 bits as 64 lowercase hex characters", () => {
  const t = mintSignerToken();
  assertEquals(t.length, 64, "64 hex chars == 32 bytes == 256 bits");
  assert(/^[0-9a-f]{64}$/.test(t), `not lowercase hex: ${t}`);
});

Deno.test("two minted tokens differ (the CSPRNG is actually being read)", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 64; i++) seen.add(mintSignerToken());
  assertEquals(seen.size, 64, "a repeat in 64 draws means the source is not random");
});

Deno.test("sha256Hex matches the published vector for the empty string", async () => {
  assertEquals(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("sha256Hex agrees between the string and byte overloads", async () => {
  const s = "the exact bytes presented to the signer";
  assertEquals(await sha256Hex(s), await sha256Hex(new TextEncoder().encode(s)));
});

Deno.test("the token row is the scope: a missing row and a hashless row are both unknown", () => {
  assertEquals(tokenState(null, new Date()), { usable: false, reason: "unknown" });
  assertEquals(
    tokenState({ token_hash: null, token_expires_at: null, token_revoked_at: null }, new Date()),
    { usable: false, reason: "unknown" },
  );
});

Deno.test("a revoked token is refused even while unexpired — voiding kills a live link at once", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assertEquals(
    tokenState({
      token_hash: "a".repeat(64),
      token_expires_at: "2099-01-01T00:00:00Z",
      token_revoked_at: "2026-05-31T23:59:59Z",
    }, now),
    { usable: false, reason: "revoked" },
  );
});

Deno.test("expiry is evaluated at USE, and the boundary is closed", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  // Exactly at the expiry instant the token is already dead — <= , not <.
  assertEquals(
    tokenState({ token_hash: "b".repeat(64), token_expires_at: "2026-06-01T00:00:00Z", token_revoked_at: null }, now),
    { usable: false, reason: "expired" },
  );
  // One millisecond before, it still works.
  assertEquals(
    tokenState({ token_hash: "b".repeat(64), token_expires_at: "2026-06-01T00:00:00.001Z", token_revoked_at: null }, now),
    { usable: true },
  );
});

Deno.test("a live token with no expiry set is usable", () => {
  assertEquals(
    tokenState({ token_hash: "c".repeat(64), token_expires_at: null, token_revoked_at: null }, new Date()),
    { usable: true },
  );
});

Deno.test("revocation outranks expiry, so the reason never leaks that a link once existed", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const st = tokenState({
    token_hash: "d".repeat(64),
    token_expires_at: "2020-01-01T00:00:00Z",
    token_revoked_at: "2020-01-01T00:00:00Z",
  }, now);
  assertEquals(st, { usable: false, reason: "revoked" });
});

Deno.test("expiryFromNow is server-clock arithmetic in UTC", () => {
  const now = new Date("2026-06-01T12:00:00.000Z");
  assertEquals(expiryFromNow(now, 30), "2026-07-01T12:00:00.000Z");
  assertEquals(expiryFromNow(now, SIGNING_TOKEN_TTL_DAYS), "2026-07-01T12:00:00.000Z");
});

Deno.test("the retrieval window outlives the signing window, because the record must stay available", () => {
  assert(
    RETRIEVAL_TOKEN_TTL_DAYS > SIGNING_TOKEN_TTL_DAYS,
    "a signer who cannot re-fetch their copy after signing has no retained record",
  );
  assertNotEquals(RETRIEVAL_TOKEN_TTL_DAYS, Infinity, "and it is still finite");
});
