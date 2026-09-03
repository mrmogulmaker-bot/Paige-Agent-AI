import { beforeEach, describe, expect, it } from "vitest";
import {
  WORKSPACE_CHOOSER_PATH,
  authorizedRootForTier,
  decideWorkspaceEntry,
  routeAllowsTier,
  workspaceRootForTenant,
  clearWorkspaceScopedState,
  hasEnteredWorkspace,
  rememberWorkspaceEntered,
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

  const soloOn = { solo_shell_enabled: true };
  const agencyOn = { agency_shell_enabled: true };

  it("resolves a tenant's own workspace root from its server-side classification", () => {
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 1971670, features: soloOn }))
      .toBe("/solo/1971670/command-center");
    expect(workspaceRootForTenant({ account_type: "sub_account", parent_tenant_id: "p", account_number: 3855, features: agencyOn }))
      .toBe("/business/3855/command-center");
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: null, account_number: 1924546, features: agencyOn }))
      .toBe("/agency/1924546/command-center");
    // §51 parent-first: a mislabelled child is still a sub-account.
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: "p", account_number: 42, features: agencyOn }))
      .toBe("/business/42/command-center");
  });

  // §57/§58. These are OPERATOR-SET per-tenant canaries, and the three gates in
  // `Admin.tsx` each promise to be byte-unchanged while they are unset. A resolver
  // that routed on tier alone would hand the un-canaried shell to a tenant whose
  // operator has not enabled it — overriding a decision that is not ours to make.
  it("refuses to route into a shell whose per-tenant canary is OFF", () => {
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 1, features: {} }))
      .toBeNull();
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 1, features: null }))
      .toBeNull();
    expect(workspaceRootForTenant({ account_type: "sub_account", parent_tenant_id: "p", account_number: 2, features: {} }))
      .toBeNull();
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: null, account_number: 3, features: {} }))
      .toBeNull();
    // The flags are not interchangeable: a Solo flag does not open the agency shell.
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: null, account_number: 3, features: soloOn }))
      .toBeNull();
  });

  // Copied from the Solo gate's own reasoning: `resolveTierKey` fail-safes an
  // unknown or absent account_type to "solo", so tier alone would route a
  // freshly-provisioned tenant, mid-setup, into the Solo shell.
  it("requires a LITERAL standalone account_type before routing to the Solo shell", () => {
    expect(workspaceRootForTenant({ account_type: null, parent_tenant_id: null, account_number: 9, features: soloOn }))
      .toBeNull();
    expect(workspaceRootForTenant({ account_type: "", parent_tenant_id: null, account_number: 9, features: soloOn }))
      .toBeNull();
  });

  it("returns no root rather than a fabricated URL when there is nothing to build one from", () => {
    // The caller falls back honestly on null; it must never invent a path.
    expect(workspaceRootForTenant(null)).toBeNull();
    expect(workspaceRootForTenant(undefined)).toBeNull();
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: null, features: soloOn }))
      .toBeNull();
  });

  describe("entry record", () => {
    beforeEach(() => {
      sessionStorage.clear();
      localStorage.clear();
    });

    it("remembers WHICH workspace was entered, so a context nobody chose re-asks", () => {
      rememberWorkspaceEntered("tenant-a");
      expect(hasEnteredWorkspace("tenant-a")).toBe(true);
      // The active context moved to something this session never chose.
      expect(hasEnteredWorkspace("tenant-b")).toBe(false);
      expect(hasEnteredWorkspace(null)).toBe(false);
      expect(hasEnteredWorkspace(undefined)).toBe(false);
    });

    it("does not record an absent tenant", () => {
      rememberWorkspaceEntered(null);
      rememberWorkspaceEntered(undefined);
      rememberWorkspaceEntered("");
      expect(sessionStorage.getItem("paige.workspace.entered")).toBeNull();
    });

    it("clears the leaving workspace's identity and navigation state, and only that", () => {
      sessionStorage.setItem("paige_impersonating_contact", '{"id":"contact-from-old-account"}');
      sessionStorage.setItem("paige_stay_in_client_view", "1");
      sessionStorage.setItem("paige.oauth.return", '{"path":"/solo/111/settings"}');
      // Personal preferences belong to the person, not the account — and so does
      // `paige.activeBusinessId`, whose owning module selects by `owner_user_id`
      // rather than by tenant. Clearing it would be over-clearing.
      localStorage.setItem("paige.activeBusinessId", "belongs-to-the-person");
      localStorage.setItem("paige:workspaceRail:collapsed:tenant-a", "1");
      localStorage.setItem("paige-tenant-theme", "dark");

      clearWorkspaceScopedState();

      expect(sessionStorage.getItem("paige_impersonating_contact")).toBeNull();
      expect(sessionStorage.getItem("paige_stay_in_client_view")).toBeNull();
      expect(sessionStorage.getItem("paige.oauth.return")).toBeNull();
      expect(localStorage.getItem("paige.activeBusinessId")).toBe("belongs-to-the-person");
      expect(localStorage.getItem("paige:workspaceRail:collapsed:tenant-a")).toBe("1");
      expect(localStorage.getItem("paige-tenant-theme")).toBe("dark");
    });
  });
});
