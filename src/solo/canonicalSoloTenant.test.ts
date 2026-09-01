import { describe, expect, it } from "vitest";
import { canonicalSoloSurfaces, SOLO_BRANCHES } from "@/lib/routing/tierBranches";
import { SOLO_DELIVERY_CLASSES } from "@/lib/routing/soloSurfaceContract";
import { SOLO_SETTINGS_DESTINATIONS } from "@/solo/settings-contract";
import {
  isCanonicalSoloTenant,
  resolveCanonicalSoloAdminOwner,
  resolveCanonicalSoloHome,
} from "@/solo/canonicalSoloTenant";

describe("canonical Solo tenant alignment", () => {
  it("routes contrasting standalone tenants to the same template without a feature flag", () => {
    const established = {
      isPlatformStaff: false,
      account_type: "standalone",
      parent_tenant_id: null,
      account_number: 7000001,
      features: { solo_shell_enabled: true, playbook: "advisor" },
      plan_offer: null,
    } as const;
    const future = {
      isPlatformStaff: false,
      account_type: "standalone",
      parent_tenant_id: null,
      account_number: 8000001,
      features: {},
      plan_offer: "future-offer",
    } as const;

    expect(isCanonicalSoloTenant(established)).toBe(true);
    expect(isCanonicalSoloTenant(future)).toBe(true);
    expect(resolveCanonicalSoloHome(established)).toBe("/solo/7000001/command-center");
    expect(resolveCanonicalSoloHome(future)).toBe("/solo/8000001/command-center");
  });

  it("fails closed for unresolved, parented, manager, and platform contexts", () => {
    const rejected = [
      { isPlatformStaff: false, account_type: null, parent_tenant_id: null, account_number: 1 },
      { isPlatformStaff: false, account_type: "standalone", parent_tenant_id: "parent", account_number: 2 },
      { isPlatformStaff: false, account_type: "agency", parent_tenant_id: null, account_number: 3 },
      { isPlatformStaff: true, account_type: null, parent_tenant_id: null, account_number: 4 },
    ];

    for (const candidate of rejected) {
      expect(isCanonicalSoloTenant(candidate)).toBe(false);
      expect(resolveCanonicalSoloHome(candidate)).toBeNull();
    }
  });

  it.each([
    ["context resolving", { accountContextLoading: true, accountContextStatus: "resolving", tierLoading: true, isPlatformStaff: false, activeTenant: null }, "resolving"],
    ["context error", { accountContextLoading: false, accountContextStatus: "error", tierLoading: false, isPlatformStaff: false, activeTenant: null }, "blocked_context"],
    ["signed out", { accountContextLoading: false, accountContextStatus: "signed_out", tierLoading: false, isPlatformStaff: false, activeTenant: null }, "blocked_context"],
    ["ready without tenant", { accountContextLoading: false, accountContextStatus: "ready", tierLoading: false, isPlatformStaff: false, activeTenant: null }, "blocked_context"],
    ["ready platform staff", { accountContextLoading: false, accountContextStatus: "ready", tierLoading: false, isPlatformStaff: true, activeTenant: null }, "not_solo"],
    ["ready agency", { accountContextLoading: false, accountContextStatus: "ready", tierLoading: false, isPlatformStaff: false, activeTenant: { account_type: "agency", parent_tenant_id: null, account_number: 10 } }, "not_solo"],
    ["ready Solo", { accountContextLoading: false, accountContextStatus: "ready", tierLoading: false, isPlatformStaff: false, activeTenant: { account_type: "standalone", parent_tenant_id: null, account_number: 7000001 } }, "redirect"],
  ] as const)("owns Admin safely while %s", (_label, input, expectedKind) => {
    expect(resolveCanonicalSoloAdminOwner(input)).toMatchObject({ kind: expectedKind });
  });

  it("requires every runtime Solo branch, subtab, and Settings destination to keep the canonical template", () => {
    expect(SOLO_BRANCHES.length).toBeGreaterThan(0);
    expect(SOLO_SETTINGS_DESTINATIONS.length).toBeGreaterThan(0);

    const routed = canonicalSoloSurfaces();
    const expectedRouteCount = SOLO_BRANCHES.reduce(
      (count, branch) => count + 1 + (branch.subtabs?.length ?? 0), 0,
    );
    expect(routed).toHaveLength(expectedRouteCount);
    expect(new Set(routed.map((surface) => surface.id)).size).toBe(routed.length);

    for (const surface of [...routed, ...SOLO_SETTINGS_DESTINATIONS]) {
      expect(surface.template).toBe("canonical_solo");
      expect(SOLO_DELIVERY_CLASSES).toContain(surface.delivery);
    }
  });
});
