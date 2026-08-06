import { describe, expect, it } from "vitest";
import {
  FLEET_COMMUNICATIONS_DESTINATION,
  parseOperatorWorkspace,
  tenantSwitchPersisted,
} from "./fleetCommunications";

const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Paige Operations",
  slug: "paige-operations",
  status: "active",
};

describe("Fleet Communications boundaries", () => {
  it("enters the existing Clients Conversations home instead of inventing a Fleet surface", () => {
    expect(FLEET_COMMUNICATIONS_DESTINATION).toBe("/admin/clients-hub/conversations");
  });

  it("accepts exactly one usable, well-formed designated workspace", () => {
    expect(parseOperatorWorkspace([WORKSPACE])).toEqual(WORKSPACE);
    expect(parseOperatorWorkspace([{ ...WORKSPACE, status: "trial" }])?.status).toBe("trial");
  });

  it.each([
    null,
    [],
    [WORKSPACE, WORKSPACE],
    [{ ...WORKSPACE, id: "not-a-uuid" }],
    [{ ...WORKSPACE, status: "suspended" }],
    [{ ...WORKSPACE, name: "" }],
  ])("fails closed for malformed or unusable resolver data", (value) => {
    expect(parseOperatorWorkspace(value)).toBeNull();
  });

  it("commits a scope switch only when the caller profile row is returned", () => {
    expect(tenantSwitchPersisted(UID, { user_id: UID }, null)).toBe(true);
    expect(tenantSwitchPersisted(UID, null, null)).toBe(false);
    expect(tenantSwitchPersisted(UID, { user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }, null)).toBe(false);
    expect(tenantSwitchPersisted(UID, { user_id: UID }, new Error("write failed"))).toBe(false);
  });
});

