// deno test --allow-import=deno.land supabase/functions/_shared/agreements/signing-guard.test.ts
//
// The access decision for an unauthenticated endpoint, driven exhaustively. Everything here is pure,
// so there is no excuse for leaving a branch untested.
import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import {
  decideSigningAccess,
  explainCannotSign,
  MAX_BODY_BYTES,
  signerFacingView,
  TOKEN_SHAPE,
} from "./signing-guard.ts";

const NOW = new Date("2026-06-01T12:00:00Z");
const FUTURE = "2026-07-01T00:00:00Z";
const PAST = "2026-05-01T00:00:00Z";

const signer = (over: Record<string, unknown> = {}) => ({
  id: "s1", agreement_id: "a1", tenant_id: "t1", status: "pending", signing_order: 1,
  token_hash: "a".repeat(64), token_expires_at: FUTURE, token_revoked_at: null, ...over,
});
const agreement = (over: Record<string, unknown> = {}) => ({
  id: "a1", status: "sent", expires_at: null, ...over,
});

Deno.test("token shape is checked before anything is hashed or looked up", () => {
  assert(TOKEN_SHAPE.test("a".repeat(64)));
  assert(!TOKEN_SHAPE.test("A".repeat(64)), "uppercase is not what we mint");
  assert(!TOKEN_SHAPE.test("a".repeat(63)), "short");
  assert(!TOKEN_SHAPE.test("a".repeat(65)), "long");
  assert(!TOKEN_SHAPE.test("../../etc/passwd"), "path traversal");
  assert(!TOKEN_SHAPE.test("' OR 1=1--"), "injection shapes never reach the database");
  assert(MAX_BODY_BYTES > 0 && MAX_BODY_BYTES <= 1024 * 1024, "a signing POST is small");
});

Deno.test("the happy path allows viewing and signing", () => {
  assertEquals(
    decideSigningAccess({ signer: signer(), agreement: agreement(), earlierUnsignedCount: 0, now: NOW }),
    { allow: true, canSign: true },
  );
});

Deno.test("an unknown token and a REVOKED token are indistinguishable to the caller", () => {
  const unknown = decideSigningAccess({ signer: null, agreement: null, earlierUnsignedCount: 0, now: NOW });
  const revoked = decideSigningAccess({
    signer: signer({ token_revoked_at: PAST }), agreement: agreement(), earlierUnsignedCount: 0, now: NOW,
  });
  assertEquals(unknown, { allow: false, reason: "not_found" });
  assertEquals(revoked, { allow: false, reason: "not_found" },
    "telling them it was revoked confirms a link once existed — useful only to someone probing");
});

Deno.test("an expired TOKEN is refused at use, not by a sweeper", () => {
  assertEquals(
    decideSigningAccess({ signer: signer({ token_expires_at: PAST }), agreement: agreement(), earlierUnsignedCount: 0, now: NOW }),
    { allow: false, reason: "expired" },
  );
});

Deno.test("a token with NO expiry is refused — an immortal link is the worst default", () => {
  assertEquals(
    decideSigningAccess({ signer: signer({ token_expires_at: null }), agreement: agreement(), earlierUnsignedCount: 0, now: NOW }),
    { allow: false, reason: "expired" },
  );
});

Deno.test("an expired AGREEMENT is refused even when the token itself is still live", () => {
  assertEquals(
    decideSigningAccess({ signer: signer(), agreement: agreement({ expires_at: PAST }), earlierUnsignedCount: 0, now: NOW }),
    { allow: false, reason: "expired" },
  );
});

Deno.test("a voided agreement stops answering immediately", () => {
  for (const status of ["voided", "declined", "completed", "expired", "draft"]) {
    assertEquals(
      decideSigningAccess({ signer: signer(), agreement: agreement({ status }), earlierUnsignedCount: 0, now: NOW }),
      { allow: false, reason: "agreement_not_signable" },
      `status ${status} must not be signable`,
    );
  }
});

Deno.test("a signer who already signed may still READ, but cannot sign again", () => {
  assertEquals(
    decideSigningAccess({ signer: signer({ status: "signed" }), agreement: agreement({ status: "partially_signed" }), earlierUnsignedCount: 0, now: NOW }),
    { allow: true, canSign: false },
  );
});

Deno.test("a signer out of turn may read but not sign", () => {
  assertEquals(
    decideSigningAccess({ signer: signer({ signing_order: 2 }), agreement: agreement(), earlierUnsignedCount: 1, now: NOW }),
    { allow: true, canSign: false },
  );
});

Deno.test("revocation outranks every other state, so voiding kills a link instantly", () => {
  assertEquals(
    decideSigningAccess({
      signer: signer({ token_revoked_at: PAST, status: "pending" }),
      agreement: agreement({ status: "voided" }), earlierUnsignedCount: 0, now: NOW,
    }),
    { allow: false, reason: "not_found" },
  );
});

Deno.test("the reason a signer cannot sign is said in words they can act on", () => {
  assertEquals(explainCannotSign("signed", 0), "You have already signed this agreement.");
  assertEquals(explainCannotSign("declined", 0), "You declined this agreement.");
  assert(explainCannotSign("pending", 1).includes("one other person"));
  assert(explainCannotSign("pending", 3).includes("3 other people"));
});

Deno.test("THE ALLOW-LIST LEAKS NOTHING — no tenant id, storage key, token, or other party's email", () => {
  const view = signerFacingView({
    agreement: { title: "Services", status: "sent", expires_at: FUTURE, content_sha256: "f".repeat(64) },
    signer: { full_name: "Jordan", email: "jordan@example.com", signer_role: "counterparty", status: "pending", signing_order: 1 },
    tenantDisplayName: "Acme Consulting",
    otherParties: [{ full_name: "Sam Okafor", status: "pending", signing_order: 2 }],
    canSign: true,
    disclosure: { slug: "esign-consent", version: 1, body: "notice", checkboxLabel: "I agree" },
  });

  const serialized = JSON.stringify(view);
  for (const forbidden of ["tenant_id", "tenantId", "token", "storage", "_key", "sealed", "contact_id", "signer_id"]) {
    assert(!serialized.includes(forbidden), `the signer view leaked "${forbidden}": ${serialized}`);
  }
  // A co-signer's progress is legitimate; their address is not.
  assert(serialized.includes("Sam Okafor"));
  assert(!serialized.includes("sam@"), "another party's email address must never reach this signer");
  // Their own address is theirs to see.
  assert(serialized.includes("jordan@example.com"));
});
