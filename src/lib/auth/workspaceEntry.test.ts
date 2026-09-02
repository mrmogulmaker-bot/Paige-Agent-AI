import { describe, expect, it } from "vitest";
import {
  WORKSPACE_CHOOSER_PATH,
  authorizedRootForTier,
  decideWorkspaceEntry,
  routeAllowsTier,
  workspaceRootForTenant,
} from "./workspaceEntry";
import type { TierClassification } from "@/lib/tier/tierFeatures";

const solo: TierClassification = { account_type: "standalone", parent_tenant_id: null, isPlatformStaff: false };
const subAccount: TierClassification = { account_type: "sub_account", parent_tenant_id: "parent-uuid", isPlatformStaff: false };
/** A mistyped child (§51 anchor case): parented but labelled agency. Parent-first must win. */
const mistypedChild: TierClassification = { account_type: "agency", parent_tenant_id: "parent-uuid", isPlatformStaff: false };
const agency: TierClassification = { account_type: "agency", parent_tenant_id: null, isPlatformStaff: false };
const enterprise: TierClassification = { account_type: "enterprise", parent_tenant_id: null, isPlatformStaff: false };

describe("workspace entry containment", () => {
  it("lets each tier mount only its own operating mode", () => {
    expect(routeAllowsTier("solo", "solo")).toBe(true);
    expect(routeAllowsTier("business", "sub_account")).toBe(true);
    expect(routeAllowsTier("agency", "agency")).toBe(true);
    // Enterprise shares the agency shell by design (§60).
    expect(routeAllowsTier("agency", "enterprise")).toBe(true);

    expect(routeAllowsTier("business", "solo")).toBe(false);
    expect(routeAllowsTier("agency", "solo")).toBe(false);
    expect(routeAllowsTier("solo", "sub_account")).toBe(false);
    expect(routeAllowsTier("solo", "agency")).toBe(false);
    expect(routeAllowsTier("business", "agency")).toBe(false);
  });

  it("sends a Solo caller who reaches /business back to their OWN Solo root, never into the sub-account shell", () => {
    // The reported defect: `/business/*` had no tier gate, and AgencyApp's own
    // guard rewrote the URL to /business/{the caller's own Solo number} and left
    // them in a shell they could not leave.
    expect(decideWorkspaceEntry({ root: "business", classification: solo, accountNumber: 1971670 }))
      .toEqual({ kind: "redirect", to: "/solo/1971670/command-center" });
  });

  it("sends a Solo caller who reaches /agency back to their own Solo root", () => {
    expect(decideWorkspaceEntry({ root: "agency", classification: solo, accountNumber: "1971670" }))
      .toEqual({ kind: "redirect", to: "/solo/1971670/command-center" });
  });

  it("sends a sub-account caller who reaches /solo back to their own business root", () => {
    expect(decideWorkspaceEntry({ root: "solo", classification: subAccount, accountNumber: 3855 }))
      .toEqual({ kind: "redirect", to: "/business/3855/command-center" });
  });

  it("treats a parented tenant as a sub-account even when its account_type says agency (§51 parent-first)", () => {
    expect(decideWorkspaceEntry({ root: "agency", classification: mistypedChild, accountNumber: 42 }))
      .toEqual({ kind: "redirect", to: "/business/42/command-center" });
  });

  it("allows the tiers that legitimately own each shell, unchanged", () => {
    expect(decideWorkspaceEntry({ root: "business", classification: subAccount, accountNumber: 1 })).toEqual({ kind: "allow" });
    expect(decideWorkspaceEntry({ root: "agency", classification: agency, accountNumber: 1 })).toEqual({ kind: "allow" });
    expect(decideWorkspaceEntry({ root: "agency", classification: enterprise, accountNumber: 1 })).toEqual({ kind: "allow" });
    expect(decideWorkspaceEntry({ root: "solo", classification: solo, accountNumber: 1 })).toEqual({ kind: "allow" });
  });

  it("FAILS CLOSED to the chooser when the wrong-mode caller has no account number to go home to", () => {
    // The ruling bans a convenience fallback into another tenant. With no home
    // to name, the only safe destination is the authorized chooser.
    for (const accountNumber of [null, undefined, "", "   "]) {
      expect(decideWorkspaceEntry({ root: "business", classification: solo, accountNumber }))
        .toEqual({ kind: "chooser" });
    }
    expect(WORKSPACE_CHOOSER_PATH).toBe("/choose-account");
  });

  it("never routes a tenant-facing shell for a tier with no tenant home", () => {
    expect(authorizedRootForTier("god", 5)).toBeNull();
  });

  it("resolves a tenant's own workspace root from its server-side classification", () => {
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 1971670 }))
      .toBe("/solo/1971670/command-center");
    expect(workspaceRootForTenant({ account_type: "sub_account", parent_tenant_id: "p", account_number: 3855 }))
      .toBe("/business/3855/command-center");
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: null, account_number: 1924546 }))
      .toBe("/agency/1924546/command-center");
    // §51 parent-first: a mislabelled child is still a sub-account.
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: "p", account_number: 42 }))
      .toBe("/business/42/command-center");
  });

  it("returns no root rather than a fabricated URL when there is nothing to build one from", () => {
    // The caller falls back honestly on null; it must never invent a path.
    expect(workspaceRootForTenant(null)).toBeNull();
    expect(workspaceRootForTenant(undefined)).toBeNull();
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: null }))
      .toBeNull();
  });
});
