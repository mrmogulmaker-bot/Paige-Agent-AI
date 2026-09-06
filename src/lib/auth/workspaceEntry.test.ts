import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_CHOOSER_PATH,
  authorizedRootForTier,
  decideWorkspaceEntry,
  routeAllowsTier,
  workspaceRootForTenant,
  clearWorkspaceScopedState,
  enterableWorkspaces,
  isEnterableTenantStatus,
  hasEnteredWorkspace,
  reachableWorkspaceCount,
  rememberWorkspaceEntered,
  workspaceRecordUsable,
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
  it("uses canonical workspace routes independently of retired route-era canaries", () => {
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 1, features: {} }))
      .toBe("/solo/1/command-center");
    expect(workspaceRootForTenant({ account_type: "standalone", parent_tenant_id: null, account_number: 1, features: null }))
      .toBe("/solo/1/command-center");
    expect(workspaceRootForTenant({ account_type: "sub_account", parent_tenant_id: "p", account_number: 2, features: {} }))
      .toBe("/business/2/command-center");
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: null, account_number: 3, features: {} }))
      .toBe("/agency/3/command-center");
    // The flags are not interchangeable: a Solo flag does not open the agency shell.
    expect(workspaceRootForTenant({ account_type: "agency", parent_tenant_id: null, account_number: 3, features: soloOn }))
      .toBe("/agency/3/command-center");
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

  // The filter that locked the owner out of his own recovery path. Counting only
  // `active` meant a person whose other workspaces were on `trial` looked like a
  // one-workspace person: the chooser found nothing to choose and bounced them
  // back into the context they were escaping. Production carries 4 trial tenants.
  describe("which workspaces a person may be offered", () => {
    it("treats a TRIAL workspace as enterable — it is live, not gone", () => {
      expect(isEnterableTenantStatus("trial")).toBe(true);
      expect(isEnterableTenantStatus("active")).toBe(true);
    });

    it("excludes only workspaces that are genuinely gone", () => {
      expect(isEnterableTenantStatus("canceled")).toBe(false);
      expect(isEnterableTenantStatus("cancelled")).toBe(false);
      expect(isEnterableTenantStatus("deleted")).toBe(false);
      expect(isEnterableTenantStatus("archived")).toBe(false);
      expect(isEnterableTenantStatus(null)).toBe(false);
      expect(isEnterableTenantStatus(undefined)).toBe(false);
      expect(isEnterableTenantStatus("  ")).toBe(false);
    });

    it("is a DENY list, so a status nobody anticipated does not silently trap people", () => {
      // The failure this shape prevents: a new status added later would, under an
      // allow list, make every workspace carrying it unreachable with no code change.
      expect(isEnterableTenantStatus("past_due")).toBe(true);
      expect(isEnterableTenantStatus("grace_period")).toBe(true);
    });

    it("is case- and whitespace-tolerant, because the value comes from data", () => {
      expect(isEnterableTenantStatus("CANCELED")).toBe(false);
      expect(isEnterableTenantStatus(" Canceled ")).toBe(false);
    });

    it("narrows a real list to exactly the offerable workspaces", () => {
      const tenants = [
        { id: "solo", status: "active" },
        { id: "child-a", status: "trial" },
        { id: "child-b", status: "trial" },
        { id: "gone", status: "canceled" },
      ];
      expect(enterableWorkspaces(tenants).map((t) => t.id)).toEqual(["solo", "child-a", "child-b"]);
      // Three, not one. One is what made the chooser decide there was nothing to
      // choose and send the owner back where he came from.
      expect(enterableWorkspaces(tenants)).toHaveLength(3);
      expect(enterableWorkspaces(null)).toEqual([]);
      expect(enterableWorkspaces(undefined)).toEqual([]);
    });
  });

  // Round seven's F1. The OFFER list and the "is there a way out?" count are two
  // different questions, and collapsing them into one is what removed an exit.
  describe("how many workspaces a person can actually reach", () => {
    it("counts the workspace someone is IN even when its status is not offerable", () => {
      const tenants = [
        { id: "held", status: "suspended" },
        { id: "other", status: "active" },
      ];
      // The offer list is unchanged: nobody is sent INTO a suspended workspace.
      expect(enterableWorkspaces(tenants).map((t) => t.id)).toEqual(["other"]);
      // But the person parked on it is demonstrably in it, and needs the way out —
      // counting only the offer list made them look like a one-workspace person, so
      // the exit control rendered nothing and the door never asked.
      expect(reachableWorkspaceCount(tenants, "held")).toBe(2);
    });

    it("does not double-count the active workspace when it is already offerable", () => {
      const tenants = [
        { id: "a", status: "active" },
        { id: "b", status: "trial" },
      ];
      expect(reachableWorkspaceCount(tenants, "a")).toBe(2);
    });

    it("does not invent a workspace from an active id that is not in the list", () => {
      // A stale `active_tenant_id` pointing at something this person cannot see must
      // not manufacture a second choice the chooser would then fail to offer.
      expect(reachableWorkspaceCount([{ id: "a", status: "active" }], "ghost")).toBe(1);
      expect(reachableWorkspaceCount([{ id: "a", status: "active" }], null)).toBe(1);
      expect(reachableWorkspaceCount(null, "a")).toBe(0);
      expect(reachableWorkspaceCount(undefined, undefined)).toBe(0);
    });

    it("still reports one when the only other workspace is genuinely gone", () => {
      const tenants = [
        { id: "a", status: "active" },
        { id: "gone", status: "canceled" },
      ];
      expect(reachableWorkspaceCount(tenants, "a")).toBe(1);
    });
  });

  // Round seven's F2. The record is only useful if a read returns what was written,
  // so that — not "did the write throw?" — is the property this probe must test.
  describe("whether the entry record can be relied on at all", () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it("reports usable when a write survives a read", () => {
      expect(workspaceRecordUsable()).toBe(true);
    });

    it("reports UNUSABLE when the store accepts writes but returns nothing", () => {
      // Real browsers do this: some privacy modes expose a quota-zero store that
      // swallows writes silently. Reporting it usable switches off the URL fallback
      // while the record it vouched for never matches — the redirect loop, rebuilt.
      vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
      expect(workspaceRecordUsable()).toBe(false);
    });

    it("reports unusable when the store throws", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("blocked");
      });
      expect(workspaceRecordUsable()).toBe(false);
    });

    it("leaves no probe behind", () => {
      workspaceRecordUsable();
      expect(sessionStorage.getItem("paige.workspace.entered.probe")).toBeNull();
    });
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
