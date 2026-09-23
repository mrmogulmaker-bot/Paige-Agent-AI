// deno test --allow-import --node-modules-dir=none supabase/functions/_shared/agreements/storage-path.test.ts
//
// These are the traversal cases that DEFEATED the first version of this guard, which compared only
// `path.split("/", 1)[0]` against the tenant. Each one passed that check and still reached another
// tenant's folder — or another bucket — because `@supabase/storage-js` interpolates the object key
// into the request URL without encoding it, and dot segments are normalised before the request
// leaves. They are assertions the build runs so that stays fixed.

import { assertEquals, assertThrows } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { assertDocumentPathIsInTenant, UnsafeDocumentPathError } from "./storage-path.ts";

const OWN = "11111111-1111-4111-8111-111111111111";
const VICTIM = "22222222-2222-4222-8222-222222222222";

Deno.test("the shape the uploader actually writes is accepted", () => {
  // src/solo/useSoloAgreementSignings.ts writes `${tenantId}/source/${Date.now()}-${safeName}`.
  for (const p of [
    `${OWN}/source/1759000000000-services-agreement.pdf`,
    `${OWN}/source/1759000000000-Master_Services.Agreement-v2.pdf`,
    `${OWN}/source/doc.pdf`,
  ]) {
    assertDocumentPathIsInTenant(p, OWN);
  }
});

Deno.test("traversal out of the tenant folder is refused, however it is spelled", () => {
  const escapes: Array<[string, string]> = [
    ["parent traversal to another tenant", `${OWN}/../${VICTIM}/source/theirs.pdf`],
    ["traversal out of the bucket entirely", `${OWN}/../../paige-agreements/${VICTIM}/sealed.pdf`],
    ["traversal to the bucket listing", `${OWN}/../../../bucket`],
    ["percent-encoded traversal", `${OWN}/%2e%2e/${VICTIM}/x.pdf`],
    ["single-dot segment", `${OWN}/./../${VICTIM}/x.pdf`],
    ["backslash separator", `${OWN}\\..\\${VICTIM}\\x.pdf`],
    ["empty segment", `${OWN}//..//${VICTIM}/x.pdf`],
    ["absolute path", `/${VICTIM}/source/x.pdf`],
  ];
  for (const [label, path] of escapes) {
    // Every one of these passes a first-segment-only comparison...
    if (!path.startsWith("/") && !path.includes("\\")) {
      assertEquals(path.split("/", 1)[0], OWN, `${label}: should defeat the old guard`);
    }
    // ...and every one must now be refused.
    assertThrows(() => assertDocumentPathIsInTenant(path, OWN), UnsafeDocumentPathError, undefined, label);
  }
});

Deno.test("another tenant's folder is refused even when it is spelled plainly", () => {
  assertThrows(() => assertDocumentPathIsInTenant(`${VICTIM}/source/x.pdf`, OWN), UnsafeDocumentPathError);
});

Deno.test("a tenant id that is a PREFIX of the caller's does not match", () => {
  // Exact segment equality, not startsWith on the raw string.
  const shorter = OWN.slice(0, 8);
  assertThrows(() => assertDocumentPathIsInTenant(`${shorter}/source/x.pdf`, OWN), UnsafeDocumentPathError);
  assertThrows(() => assertDocumentPathIsInTenant(`${OWN}extra/source/x.pdf`, OWN), UnsafeDocumentPathError);
});

Deno.test("a bare tenant folder with no object is refused", () => {
  // storage.foldername() drops the last element, so a single-segment key is not covered by the
  // folder RLS this check stands in for.
  assertThrows(() => assertDocumentPathIsInTenant(OWN, OWN), UnsafeDocumentPathError);
});

Deno.test("empty inputs and control characters are refused rather than normalised", () => {
  assertThrows(() => assertDocumentPathIsInTenant("", OWN), UnsafeDocumentPathError);
  assertThrows(() => assertDocumentPathIsInTenant(`${OWN}/source/x.pdf`, ""), UnsafeDocumentPathError);
  assertThrows(() => assertDocumentPathIsInTenant(`${OWN}/source/x\u0000.pdf`, OWN), UnsafeDocumentPathError);
});
