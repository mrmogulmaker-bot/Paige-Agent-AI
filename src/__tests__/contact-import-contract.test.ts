import { describe, expect, it } from "vitest";
import { buildImportPreview, publicImportSummary } from "../../supabase/functions/_shared/contact-import-contract";

const source = { system: "csv", accountKey: "verified-account", snapshotKey: "upload-1", observedAt: "2026-09-04T12:00:00Z" };
describe("bounded contact import preview", () => {
  it("parses BOM, CRLF, quoted commas, escaped quotes and embedded newlines", () => {
    const result = buildImportPreview('\uFEFFID,Email,Note,Custom\r\n1, A@Example.com ,"hello,\r\n""friend""",keep\r\n', { ID: "external_id", Email: "email", Note: "notes" }, [], source);
    expect(result.rows[0].fields.email).toBe("a@example.com");
    expect(result.rows[0].fields.notes).toBe('hello,\r\n"friend"');
    expect(result.rows[0].customFields.Custom).toBe("keep");
    expect(result.counts.total).toBe(1);
  });
  it("never guesses country or consent; opt-out dominates grants", () => {
    const result = buildImportPreview("Phone,Consent,Out\n2025550123,yes,true", { Phone: "phone", Consent: "email_consent", Out: "email_opt_out" }, [], source);
    expect(result.rows[0].consent).toEqual({ email: "denied", sms: "unknown" });
    expect(result.rows[0].decisions).toContain("phone_requires_e164");
    expect(result.counts.missingUsableIdentity).toBe(1);
    expect(result.rows[0].automaticActions).toEqual([]);
  });
  it("requires duplicate/conflict review and proposes no stronger-field overwrite", () => {
    const result = buildImportPreview("ID,Email,Name\na,a@example.com,Incoming", { ID: "external_id", Email: "email", Name: "first_name" }, [{ contactKey: "c1", email: "a@example.com", fields: { first_name: "Existing" } }], source);
    expect(result.rows[0].matches).toEqual(["c1"]);
    expect(result.rows[0].decisions).toContain("existing_record_match");
    expect(result.rows[0].decisions).toContain("existing_field_conflict");
    expect(result.rows[0].proposedPatch).toEqual({});
  });
  it("marks every same-file duplicate and preserves deterministic row keys", () => {
    const csv = "ID,Email\n1,a@example.com\n1,a@example.com";
    const mapping = { ID: "external_id", Email: "email" } as const;
    const result = buildImportPreview(csv, mapping, [], source);
    expect(result.rows.every(row => row.decisions.includes("duplicate_in_file"))).toBe(true);
    expect(new Set(result.rows.map(row => row.rowKey)).size).toBe(2);
    expect(buildImportPreview(csv, mapping, [], source).rows.map(row => row.rowKey)).toEqual(result.rows.map(row => row.rowKey));
  });
  it("does not expose raw values or custom headers in the public summary", () => {
    const result = buildImportPreview("Email,Secret Header\nprivate@example.com,secret", { Email: "email" }, [], source);
    const safe = JSON.stringify(publicImportSummary(result));
    expect(safe).not.toContain("private");
    expect(safe).not.toContain("secret");
    expect(safe).not.toContain("Secret Header");
    expect(safe).not.toContain("verified-account");
  });
  it.each(['A,A\n1,2', 'A,B\n1', 'A\n"unterminated', 'A\n"ok"junk', 'A\na"b'])('rejects ambiguous CSV %s', csv => {
    expect(() => buildImportPreview(csv, {}, [], source)).toThrow();
  });
  it("rejects unknown mappings, missing source context, and oversized inputs", () => {
    expect(() => buildImportPreview("A\nx", { A: "tenant_id" } as never, [], source)).toThrow();
    expect(() => buildImportPreview("A\nx", { Missing: "email" }, [], source)).toThrow();
    expect(() => buildImportPreview("A\nx", {}, [], { ...source, accountKey: "" })).toThrow();
    expect(() => buildImportPreview("A\n" + "x".repeat(5_000_001), {}, [], source)).toThrow();
  });
  it("recognizes phone-only and name-only probable duplicates without auto-merging", () => {
    const result = buildImportPreview("Name,Phone\nAlice,+12025550123\nBob,", { Name: "first_name", Phone: "phone" }, [{ contactKey: "c1", phone: "+12025550123" }, { contactKey: "c2", fields: { first_name: "Bob" } }], source);
    expect(result.rows.map(row => row.matches)).toEqual([["c1"], ["c2"]]);
    expect(result.rows.every(row => Object.keys(row.proposedPatch).length === 0)).toBe(true);
  });
});

describe("import hostile and uncertainty boundaries", () => {
  it("retains hostile custom headers without modifying object prototypes", () => {
    const preview = buildImportPreview("Email,__proto__,constructor\na@example.com,polluted,private", { Email: "email" }, [], source);
    expect(Object.getPrototypeOf(preview.rows[0].customFields)).toBeNull();
    expect(preview.rows[0].customFields.__proto__).toBe("polluted");
    expect(preview.rows[0].customFields.constructor).toBe("private");
    expect(({} as Record<string, string>).polluted).toBeUndefined();
  });
  it("does not treat unknown opt-out or ambiguous consent as a grant", () => {
    const preview = buildImportPreview("Email,EC,SC,EO\na@example.com,maybe,revoked,unknown", { Email: "email", EC: "email_consent", SC: "sms_consent", EO: "email_opt_out" }, [], source);
    expect(preview.rows[0].consent).toEqual({ email: "unknown", sms: "denied" });
  });
  it("keeps a revoked consent denied despite a negative opt-out flag", () => {
    const preview = buildImportPreview("Email,C,O\na@example.com,revoked,false", { Email: "email", C: "email_consent", O: "email_opt_out" }, [], source);
    expect(preview.rows[0].consent.email).toBe("denied");
  });
  it("does not match an external identity owned by another source account", () => {
    const preview = buildImportPreview("ID,Email\n1,a@example.com", { ID: "external_id", Email: "email" }, [{ contactKey: "other", externalId: "1", sourceSystem: "csv", sourceAccountKey: "other-account" }], source);
    expect(preview.rows[0].matches).toEqual([]);
  });
});
