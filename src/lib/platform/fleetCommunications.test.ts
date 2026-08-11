import { describe, expect, it } from "vitest";
import { tenantSwitchPersisted } from "./fleetCommunications";

const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Fleet Communications boundaries", () => {
  it("commits a scope switch only when the caller profile row is returned", () => {
    expect(tenantSwitchPersisted(UID, { user_id: UID }, null)).toBe(true);
    expect(tenantSwitchPersisted(UID, null, null)).toBe(false);
    expect(tenantSwitchPersisted(UID, { user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, null)).toBe(false);
    expect(tenantSwitchPersisted(UID, { user_id: UID }, new Error("write failed"))).toBe(false);
  });
});
