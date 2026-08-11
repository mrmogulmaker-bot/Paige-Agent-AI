// §32 headless guard for §49 (#197) — one thread per contact per tenant.
//
// The RISK in this change is the CONSOLIDATION MIGRATION (proven separately by a BEGIN..ROLLBACK
// dry-run against prod: Tashia's contact 53970758-… collapses to ONE thread, zero orphaned messages).
// This smoke covers the OTHER half: the per-contact thread_key DERIVATION that every producer must now
// emit. A green tsc/build proves the code compiles; it proves NOTHING about whether all six producers
// actually key by contact. So this:
//   (1) asserts the canonical derivation's invariants (the dedup property + no cross-tenant/contact
//       collision + the null-contact fallback), and
//   (2) greps the SIX real producer sites to prove each emits `contact:{tenant}:{contact}` — the §37
//       producer-completeness / drift guard (a producer left on the old channel-prefixed key would
//       silently re-fragment post-migration, which a type-check can't catch).
//
// Run:  node scripts/thread-key-smoke.mjs   Exit 0 = derivation + all producers key per-contact.
//
// §13 HONEST — what this CANNOT verify (owed to the migration dry-run + a live inbox look): that the
// backfill actually merges existing rows without message loss, and that the deployed inbox renders one
// unified thread. The migration's own BEGIN..ROLLBACK proof + the post-merge persisted-apply check
// cover that; this file only guards the derivation contract.

import { readFileSync } from "node:fs";

let failures = 0;
const ok = (name, cond) => { if (!cond) { failures++; console.error(`  ✗ ${name}`); } else { console.log(`  ✓ ${name}`); } };

// The canonical per-contact derivation every producer must emit (mirror of canonicalThreadKey /
// the edge inline forms). contactId present → per-contact; else old channel:tenant:counterparty.
const key = (channel, tenantId, counterparty, contactId) => {
  if (contactId) return `contact:${tenantId}:${contactId}`;
  const cp = channel === "email" ? counterparty.trim().toLowerCase() : counterparty.replace(/[^\d+]/g, "");
  return `${channel}:${tenantId}:${cp}`;
};

const T = "tenant-A", T2 = "tenant-B", C = "contact-X", C2 = "contact-Y";

console.log("derivation invariants");
ok("SAME contact, DIFFERENT channels → SAME key (the dedup win)",
  key("email", T, "a@x.com", C) === key("voice", T, "+15551234567", C) &&
  key("email", T, "a@x.com", C) === key("sms", T, "+15551234567", C));
ok("different contacts → different keys", key("email", T, "a@x.com", C) !== key("email", T, "a@x.com", C2));
ok("cross-tenant same contact-shape → different keys (tenant embedded)", key("email", T, "a@x.com", C) !== key("email", T2, "a@x.com", C));
ok("per-contact key has the contact: prefix", key("email", T, "a@x.com", C) === `contact:${T}:${C}`);
ok("NULL contact → old channel:tenant:counterparty fallback (email lowercased)",
  key("email", T, "A@X.com", null) === `email:${T}:a@x.com`);
ok("NULL contact → old voice fallback (digits+plus only)",
  key("voice", T, "+1 (555) 123-4567", null) === `voice:${T}:+15551234567`);
ok("NULL contact keys still cross-tenant distinct", key("email", T, "a@x.com", null) !== key("email", T2, "a@x.com", null));

console.log("§37 producer completeness — every write site emits the per-contact key");
const has = (file, re, name) => {
  let src = "";
  try { src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8"); }
  catch (e) { ok(`${name} — file readable`, false); return; }
  ok(name, re.test(src));
};
// Frontend compose producer (the ONE canonicalThreadKey home) + its caller passing the contact id.
has("src/pages/admin/conversations/inbox-shared.ts", /if \(contactId\) return `contact:\$\{tenantId\}:\$\{contactId\}`/, "canonicalThreadKey keys by contactId");
has("src/pages/admin/conversations/ComposeThreadDialog.tsx", /canonicalThreadKey\(channel, tenantId, toAddress, client\.id\)/, "ComposeThreadDialog passes client.id");
// Edge producers.
has("supabase/functions/handle-inbound-email/index.ts", /contactId\s*\?\s*`contact:\$\{tenantId\}:\$\{contactId\}`/, "handle-inbound-email keys by contact");
has("supabase/functions/voice-twiml/twiml.ts", /contactId\s*\?\s*`contact:\$\{tenantId\}:\$\{contactId\}`/, "voiceThreadKey keys by contact");
has("supabase/functions/voice-twiml/index.ts", /voiceThreadKey\(tenantId, counterpartyPhone, contactId\)/, "voice-twiml call site passes contactId");
has("supabase/functions/send-message/index.ts", /const perContactKey = effectiveContactId && tenantId \? `contact:\$\{tenantId\}:\$\{effectiveContactId\}` : null;/, "send-message computes perContactKey");
has("supabase/functions/send-message/index.ts", /perContactKey \|\| `\$\{body\.channel\}:\$\{body\.to\}`/, "send-message fallbacks prefer perContactKey");
// The RPC + trigger (SQL producers) in the migration.
has("supabase/migrations/20260801120000_comms_49_one_thread_per_contact.sql", /_tkey := 'contact:' \|\| _tenant::text \|\| ':' \|\| _cid::text;/, "create_and_attach_conversation keys by contact");
has("supabase/migrations/20260801120000_comms_49_one_thread_per_contact.sql", /m\.thread_key = ANY\(g\.member_keys\)/, "backfill re-points by thread membership (no orphan)");

if (failures) { console.error(`\n${failures} check(s) FAILED`); process.exit(1); }
console.log("\nAll thread-key §49 derivation + producer-completeness checks passed.");
