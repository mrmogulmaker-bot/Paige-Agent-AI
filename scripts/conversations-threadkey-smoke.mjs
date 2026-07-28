#!/usr/bin/env node
// §32 headless smoke — the ONE load-bearing correctness point of the Conversations
// compose-new feature (Slice 1, Cowork 2026-07-28): the canonical thread key a
// compose-new OUTBOUND writes must byte-match the key an INBOUND reply produces, or
// the two fragment into separate threads.
//
// The Conversations surface is auth-gated and cannot be driven in a headless build
// session (§32), so we lock the pure-logic invariant here instead: this test IS the
// executable spec of the thread-key convention. If canonicalThreadKey() in
// src/pages/admin/conversations/inbox-shared.ts or the normalization in
// supabase/functions/handle-inbound-email/index.ts changes, this test must change in
// lockstep — that lockstep is the whole point (a silent drift re-introduces the bug).
//
// Run: node scripts/conversations-threadkey-smoke.mjs

// --- The two implementations under test, transcribed from the real source ---------

// canonicalThreadKey() — src/pages/admin/conversations/inbox-shared.ts
function canonicalThreadKey(channel, tenantId, counterparty) {
  const cp = channel === "email"
    ? counterparty.trim().toLowerCase()
    : counterparty.replace(/[^\d+]/g, "");
  return `${channel}:${tenantId}:${cp}`;
}

// The inbound-email convention — handle-inbound-email/index.ts:
//   adapter normEmail(v) = (v ?? "").toString().trim().toLowerCase()  (L53/L61/L66)
//   fromEmail = normalized sender.address                              (L206 via adapter)
//   threadKey = `email:${tenantId}:${fromEmail}`                       (L325)
function inboundEmailThreadKey(tenantId, rawSenderAddress) {
  const fromEmail = (rawSenderAddress ?? "").toString().trim().toLowerCase();
  return `email:${tenantId}:${fromEmail}`;
}

// --- Assertions -------------------------------------------------------------------

let failures = 0;
function eq(actual, expected, label) {
  if (actual !== expected) {
    failures++;
    console.error(`✗ ${label}\n    actual:   ${JSON.stringify(actual)}\n    expected: ${JSON.stringify(expected)}`);
  } else {
    console.log(`✓ ${label}`);
  }
}

const T = "11111111-2222-3333-4444-555555555555";

// EMAIL — compose-new key must equal the inbound key for the SAME person, across the
// casing/whitespace variations a real provider payload throws at us.
for (const addr of ["Foo@Bar.com", "foo@bar.com", "  FOO@BAR.COM  ", "Client.Name@Example.io"]) {
  eq(
    canonicalThreadKey("email", T, addr),
    inboundEmailThreadKey(T, addr),
    `email parity — outbound(${JSON.stringify(addr)}) === inbound(${JSON.stringify(addr)})`,
  );
}

// EMAIL — a compose-new to "Foo@Bar.com" and the client's reply from "foo@bar.com"
// MUST collapse to one thread (the fragmentation bug this feature exists to prevent).
eq(
  canonicalThreadKey("email", T, "Foo@Bar.com"),
  inboundEmailThreadKey(T, "foo@bar.com"),
  "email — mixed-case compose merges with lowercased inbound reply (no fragmentation)",
);

// EMAIL — shape is exactly channel:tenant:counterparty, tenant embedded (NOT the
// non-canonical `email:${to}` fallback that send-message would otherwise use).
eq(
  canonicalThreadKey("email", T, "a@b.com"),
  `email:${T}:a@b.com`,
  "email — canonical shape email:<tenant>:<lowercased-addr>",
);

// SMS — forward-consistency: strip formatting to an E.164-ish digits(+leading +) key.
eq(
  canonicalThreadKey("sms", T, "+1 (470) 200-3444"),
  `sms:${T}:+14702003444`,
  "sms — formatting stripped to +digits",
);
eq(
  canonicalThreadKey("sms", T, "470-200-3444"),
  `sms:${T}:4702003444`,
  "sms — dashes stripped",
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED — thread-key parity is broken; compose-new and inbound replies would fragment.`);
  process.exit(1);
}
console.log("\nAll thread-key parity assertions passed.");
