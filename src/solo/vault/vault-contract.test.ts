import { describe, expect, it } from "vitest";
import {
  buildVaultContractMutation,
  getVaultAccessPresentation,
  summarizeContinuityPulse,
  validateVaultUpload,
  type VaultObligation,
} from "./vault-contract";

describe("Business Vault contract", () => {
  it("preserves contract fields and lifecycle during an edit", () => {
    const initial = {
      id: "contract-1",
      recordId: "record-1",
      contractType: "Service agreement",
      counterpartyName: "Vendor",
      effectiveDate: "2026-01-01",
      endDate: "2027-01-01",
      renewalDate: "2026-12-01",
      noticeDays: 30,
      paymentTerms: "Net 30",
      state: "active",
      reviewState: "owner_entered",
      ownerAssigned: false,
    };
    expect(
      buildVaultContractMutation(initial, {
        recordId: initial.recordId,
        contractType: initial.contractType,
        counterpartyName: "Updated Vendor",
        effectiveDate: initial.effectiveDate,
        endDate: initial.endDate,
        renewalDate: initial.renewalDate,
        noticeDays: String(initial.noticeDays),
        paymentTerms: initial.paymentTerms,
      }),
    ).toMatchObject({
      id: "contract-1",
      counterpartyName: "Updated Vendor",
      effectiveDate: "2026-01-01",
      endDate: "2027-01-01",
      paymentTerms: "Net 30",
      state: "active",
    });
  });

  it("fails closed while authority is unresolved or denied", () => {
    expect(getVaultAccessPresentation("loading")).toEqual({
      canRender: false,
      state: "loading",
    });
    expect(getVaultAccessPresentation("denied")).toEqual({
      canRender: false,
      state: "denied",
    });
    expect(getVaultAccessPresentation("allowed")).toEqual({
      canRender: true,
      state: "allowed",
    });
  });

  it("counts only confirmed obligations with a current source", () => {
    const obligations: VaultObligation[] = [
      {
        id: "a",
        title: "A",
        category: "filing",
        state: "confirmed",
        dueAt: "2026-09-10T12:00:00Z",
        sourceState: "current",
        ownerAssigned: true,
      },
      {
        id: "b",
        title: "B",
        category: "renewal",
        state: "proposed",
        dueAt: "2026-09-11T12:00:00Z",
        sourceState: "current",
        ownerAssigned: false,
      },
      {
        id: "c",
        title: "C",
        category: "license",
        state: "confirmed",
        dueAt: "2026-09-12T12:00:00Z",
        sourceState: "missing",
        ownerAssigned: false,
      },
      {
        id: "d",
        title: "D",
        category: "tax",
        state: "overdue",
        dueAt: "2026-09-01T12:00:00Z",
        sourceState: "current",
        ownerAssigned: false,
      },
    ];
    expect(
      summarizeContinuityPulse(obligations, new Date("2026-09-05T12:00:00Z")),
    ).toEqual({
      dueSoon: 1,
      overdue: 1,
      withoutOwner: 1,
      unavailable: 1,
    });
  });

  it("refuses credentials, risky formats, oversize files, and missing attestation", () => {
    const base = { size: 100, type: "application/pdf", name: "insurance.pdf" };
    expect(validateVaultUpload(base, false)).toBe(
      "Confirm that this file contains no passwords, keys, recovery codes, or banking secrets.",
    );
    expect(validateVaultUpload({ ...base, name: "api-key.pdf" }, true)).toBe(
      "Credential and secret files cannot be stored in the Business Vault.",
    );
    expect(
      validateVaultUpload(
        { ...base, name: "backup.zip", type: "application/zip" },
        true,
      ),
    ).toBe("This file type is not supported.");
    expect(validateVaultUpload({ ...base, size: 20 * 1024 * 1024 }, true)).toBe(
      "Files must be 15 MB or smaller.",
    );
    expect(validateVaultUpload(base, true)).toBeNull();
  });
});
