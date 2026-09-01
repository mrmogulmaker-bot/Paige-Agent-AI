import { describe, expect, it } from "vitest";
import {
  SOLO_ACCESS_AREAS,
  defaultSoloAccessProfile,
  normalizeSoloAccessProfiles,
  validateSoloAccessProfile,
} from "./team-access-profile";

describe("Solo Team access profiles", () => {
  it("keeps the Owner profile fixed and gives Admin and Member deterministic defaults", () => {
    expect(defaultSoloAccessProfile("owner").areas.every((area) => area.level === "manage")).toBe(true);
    expect(defaultSoloAccessProfile("admin").areas).toHaveLength(SOLO_ACCESS_AREAS.length);
    expect(defaultSoloAccessProfile("member").areas).toHaveLength(SOLO_ACCESS_AREAS.length);
  });

  it("rejects any choice above the governed role ceiling", () => {
    const member = defaultSoloAccessProfile("member");
    const analytics = member.areas.find((area) => area.key === "analytics");
    expect(analytics).toBeDefined();
    expect(validateSoloAccessProfile("member", {
      ...member,
      areas: member.areas.map((area) => area.key === "analytics" ? { ...area, level: "manage" as const } : area),
    })).toEqual({ analytics: "Manage is above the Member ceiling for Analytics." });
  });

  it("normalizes server profiles without inventing missing areas or accepting an editable Owner", () => {
    const normalized = normalizeSoloAccessProfiles({
      tenant_id: "tenant-a",
      viewer_permission: "owner",
      can_manage: true,
      profiles: [
        { permission: "owner", version: 99, updated_at: "2026-09-01T12:00:00Z", areas: { analytics: "hidden" } },
        { permission: "admin", version: 4, updated_at: "2026-09-01T12:00:00Z", areas: { analytics: "view" } },
      ],
    });
    expect(normalized?.profiles.owner.areas.every((area) => area.level === "manage")).toBe(true);
    expect(normalized?.profiles.admin.areas.find((area) => area.key === "analytics")?.level).toBe("view");
    expect(normalized?.profiles.member.areas).toHaveLength(SOLO_ACCESS_AREAS.length);
  });
});
