// §32 behavioural + scope checks for the three silent runtime defects in paige-ai-chat.
//
// Run from the repo root:
//   node --experimental-strip-types \
//     --import ./supabase/functions/paige-ai-chat/__checks__/register-edge-stub.mjs \
//     supabase/functions/paige-ai-chat/__checks__/runtime-correctness-check.mjs
//
// Anti-vacuity: pass PROVE_AGAINST=<path to a pre-fix copy of index.ts> to run the scope
// section against that source instead. The three defects MUST appear there; if they do not,
// the scope section is not proving anything and says so.
//
// Deliberately NOT a vitest suite: vitest's include is `src/**`, so this file is invisible to
// `npm run test` and adds nothing to CI's surface. It is a standalone check, run by hand,
// exactly like the other edge-function smokes in `scripts/`.
import fs from "node:fs";
import path from "node:path";
import { findCannotFindName } from "./scope-probe.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const INDEX = path.join(ROOT, "supabase/functions/paige-ai-chat/index.ts");
const WRITE_BACK = path.join(ROOT, "supabase/functions/paige-write-back/index.ts");

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) throw new Error("use checkAsync for async checks");
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL  ${name}\n      ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Section 1 · scope (all three defects) ───────────────────────────────────
// Every one of the three defects is the same class: an identifier used where no
// declaration is in scope. index.ts is an ES module, so it is implicitly strict and
// such a use is a runtime ReferenceError — which is precisely why all three failed
// silently inside a surrounding catch instead of surfacing.
const proveAgainst = process.env.PROVE_AGAINST;
const scopeSource = fs.readFileSync(proveAgainst || INDEX, "utf8");
const scopeHits = findCannotFindName(scopeSource, "index.ts");
const named = (name) => scopeHits.filter((h) => h.message.includes(`'${name}'`));

console.log(`\n--- scope (${proveAgainst ? `PRE-FIX source: ${proveAgainst}` : "working tree"}) ---`);
for (const hit of scopeHits) console.log(`      TS2304 line ${hit.line}: ${hit.message}`);

if (proveAgainst) {
  // Anti-vacuity mode: the defects MUST be present, or the section proves nothing.
  check("anti-vacuity · pre-fix source is missing runGeneralDocumentExtraction", () =>
    assert(named("runGeneralDocumentExtraction").length > 0, "no TS2304 for runGeneralDocumentExtraction — this source is not the pre-fix one"));
  check("anti-vacuity · pre-fix source has no `admin` in scope at the domain-identity read", () =>
    assert(named("admin").length > 0, "no TS2304 for admin"));
  check("anti-vacuity · pre-fix source assigns an undeclared `result` in the KB save path", () =>
    assert(named("result").length > 0, "no TS2304 for result"));
} else {
  check("defect 1 · runGeneralDocumentExtraction is defined where it is called", () =>
    assertEqual(named("runGeneralDocumentExtraction").length, 0, "still unresolved"));
  check("defect 2 · the tenant-identity read uses an identifier that is in scope", () =>
    assertEqual(named("admin").length, 0, "`admin` still unresolved"));
  check("defect 3 · the knowledge-base save path declares its result binding", () =>
    assertEqual(named("result").length, 0, "`result` still unresolved"));
  check("no OTHER out-of-scope identifier remains (Deno is the environment global, absent from Node's libs)", () => {
    const others = scopeHits.filter((h) => !h.message.includes("'Deno'"));
    assert(others.length === 0, `unexpected: ${others.map((o) => `${o.line}:${o.message}`).join(" | ")}`);
  });
}

// ── Section 2 · defect 2, read as source ────────────────────────────────────
// The scope probe proves the identifier resolves; it cannot prove WHICH client was
// chosen. §9 requires the caller's JWT-scoped client, because
// resolve_tenant_domain_identity self-scopes off auth.uid() for an authenticated
// caller and only honours p_tenant_id for service_role. Reading it through the
// service-role client would make the body-supplied tenant authoritative.
const indexSource = fs.readFileSync(INDEX, "utf8");
console.log("\n--- tenant identity is read server-side, through the caller's own client ---");
check("defect 2 · resolve_tenant_domain_identity is read via the JWT-scoped client", () => {
  const at = indexSource.indexOf('"resolve_tenant_domain_identity"');
  assert(at > 0, "call site not found");
  const before = indexSource.slice(Math.max(0, at - 200), at);
  assert(/await supabaseClient\.rpc\($/.test(before.trim()), `call site does not use supabaseClient.rpc — got: ...${before.slice(-80)}`);
});
check("defect 2 · no service-role client reads tenant domain identity", () => {
  assert(!/await (admin|supabase)\.rpc\(\s*\n?\s*"resolve_tenant_domain_identity"/.test(indexSource),
    "a service-role client still reads the domain identity");
});

// ── Section 3 · defect 1, behaviour ─────────────────────────────────────────
const mod = await import("../index.ts");
const { runGeneralDocumentExtraction } = mod;

function modelReturning(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fake = async (_provider, init) => {
    calls.push(JSON.parse(init.body));
    if (!ok) return new Response("upstream said no", { status });
    return new Response(JSON.stringify({ choices: [{ message: { content: typeof payload === "string" ? payload : JSON.stringify(payload) } }] }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
  fake.calls = calls;
  return fake;
}

console.log("\n--- extraction behaviour ---");

await checkAsync("no readable content · returns an honest absence and never calls the model", async () => {
  const fake = modelReturning({ fields: {} });
  const out = await runGeneralDocumentExtraction({ kind: "docx", fileName: "empty.docx" }, fake);
  assertEqual(out, null, "should be null");
  assertEqual(fake.calls.length, 0, "model must not be called with nothing to read");
});

await checkAsync("null document · returns null", async () => {
  assertEqual(await runGeneralDocumentExtraction(null, modelReturning({ fields: {} })), null, "should be null");
});

await checkAsync("PDF · sends the document bytes and returns a proposal in the shipped shape", async () => {
  const fake = modelReturning({
    document_type: "IRS EIN Letter",
    fields: { "foundation.ein": "12-3456789", "foundation.legal_name": "  Northwind   Consulting  " },
  });
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK", fileName: "ein.pdf" }, fake);
  assert(out, "expected a proposal");
  assertEqual(fake.calls.length, 1, "one model call");
  const sent = fake.calls[0].messages.at(-1).content;
  assert(sent.some((b) => b.type === "image_url" && b.image_url.url.startsWith("data:application/pdf;base64,JVBERi0xLjQK")),
    "the PDF bytes were not sent to the model");
  assertEqual(out.source, "document", "source");
  assertEqual(out.documentType, "IRS EIN Letter", "documentType");
  assert(typeof out.id === "string" && out.id.length > 10, "id");
  assertEqual(out.fields.length, 2, "field count");
  const ein = out.fields.find((f) => f.key === "foundation.ein");
  assertEqual(ein.value, "12-3456789", "ein value");
  assertEqual(ein.label, "Business EIN", "ein label");
  assertEqual(out.fields.find((f) => f.key === "foundation.legal_name").value, "Northwind Consulting", "whitespace is normalised");
});

await checkAsync("DOCX · reads the client-extracted text", async () => {
  const fake = modelReturning({ document_type: "Operating Agreement", fields: { "foundation.state_of_formation": "Delaware" } });
  const out = await runGeneralDocumentExtraction(
    { kind: "docx", fileName: "oa.docx", textContent: "ARTICLES OF ORGANIZATION — State of Delaware" }, fake);
  assert(out, "expected a proposal");
  const sent = fake.calls[0].messages.at(-1).content;
  assert(sent.some((b) => b.type === "text" && b.text.includes("State of Delaware")), "document text was not sent");
  assertEqual(out.fields.length, 1, "field count");
});

await checkAsync("nothing found · emits no proposal rather than an empty card", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" }, modelReturning({ document_type: "Photo", fields: {} }));
  assertEqual(out, null, "should be null");
});

await checkAsync("§13 · non-answers, placeholders and unreadable dates are dropped, never proposed", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" },
    modelReturning({
      document_type: "Formation Certificate",
      fields: {
        "foundation.city": "N/A",
        "foundation.state": "unknown",
        "foundation.legal_name": "[BUSINESS NAME]",
        "foundation.business_phone": "",
        "foundation.formation_date": "March 2019",
        "foundation.entity_type": "LLC",
      },
    }));
  assert(out, "expected a proposal");
  assertEqual(out.fields.length, 1, "only the one real value survives");
  assertEqual(out.fields[0].key, "foundation.entity_type", "surviving key");
});

await checkAsync("a real ISO date IS kept", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" },
    modelReturning({ fields: { "foundation.formation_date": "2019-03-14" } }));
  assertEqual(out.fields[0].value, "2019-03-14", "date value");
  assertEqual(out.documentType, undefined, "no document_type returned means none is claimed");
});

await checkAsync("a key outside the catalog is dropped, not forwarded downstream", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" },
    modelReturning({ fields: { "profile.ssn": "123-45-6789", "credit.fico_score": "720", "foundation.dba": "Northwind" } }));
  assertEqual(out.fields.length, 1, "only the catalog key survives");
  assertEqual(out.fields[0].key, "foundation.dba", "surviving key");
});

await checkAsync("upstream failure · returns null and does not throw", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" }, modelReturning(null, { ok: false, status: 502 }));
  assertEqual(out, null, "should be null");
});

await checkAsync("unparseable model output · returns null and does not throw", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" }, modelReturning("not json at all"));
  assertEqual(out, null, "should be null");
});

await checkAsync("a thrown transport error · returns null and does not throw", async () => {
  const out = await runGeneralDocumentExtraction(
    { kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0xLjQK" },
    async () => { throw new Error("socket hang up"); });
  assertEqual(out, null, "should be null");
});

// ── Section 4 · the emitted keys are a real contract, not a guess ────────────
console.log("\n--- field catalog contract ---");
const catalogKeys = [...indexSource.matchAll(/^  "([a-z_]+\.[a-z_0-9]+)": \{ label:/gm)].map((m) => m[1]);
const writeBackSource = fs.readFileSync(WRITE_BACK, "utf8");
const allowedPaths = new Set([...writeBackSource.matchAll(/^  "([a-z_]+\.[a-z_0-9]+)": \{ table:/gm)].map((m) => m[1]));

check("the catalog was actually read out of index.ts", () => assert(catalogKeys.length >= 20, `found only ${catalogKeys.length} keys`));
check("the whitelist was actually read out of paige-write-back", () => assert(allowedPaths.size >= 30, `found only ${allowedPaths.size} paths`));
check("every proposable key is a real paige-write-back field_path", () => {
  const orphans = catalogKeys.filter((k) => !allowedPaths.has(k));
  assert(orphans.length === 0, `these would be rejected as "Field not in whitelist": ${orphans.join(", ")}`);
});
check("§2 · the catalog carries no credit/funding/lender field", () => {
  const finance = catalogKeys.filter((k) => /credit|funding|fico|lender|loan|score/.test(k));
  assert(finance.length === 0, `finance keys in a platform default: ${finance.join(", ")}`);
});
check("§9/§13 · the catalog carries no sensitive PII a document should never auto-propose", () => {
  const sensitive = catalogKeys.filter((k) => /ssn|date_of_birth|dob/.test(k));
  assert(sensitive.length === 0, `sensitive keys: ${sensitive.join(", ")}`);
});

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
