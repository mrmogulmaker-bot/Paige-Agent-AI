import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPaigePublicPresenceScope,
  getPaigePublicPresenceScope,
  setPaigePublicPresenceScope,
  subscribePaigePublicPresenceScope,
} from "./paigePublicPresenceScope";

describe("Paige Public Presence scope", () => {
  afterEach(clearPaigePublicPresenceScope);

  it("returns a handoff only to the tenant that created it", () => {
    setPaigePublicPresenceScope({ tenantId: "tenant-a", kind: "public_presence", step: "verify_website", intendedAction: "plan" });
    expect(getPaigePublicPresenceScope("tenant-a")?.step).toBe("verify_website");
    expect(getPaigePublicPresenceScope("tenant-b")).toBeNull();
  });

  it("announces clearing so the dedicated workspace drops stale context", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePaigePublicPresenceScope(listener);
    setPaigePublicPresenceScope({ tenantId: "tenant-a", kind: "public_presence", step: "confirm_facts", intendedAction: "review" });
    clearPaigePublicPresenceScope();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getPaigePublicPresenceScope("tenant-a")).toBeNull();
    unsubscribe();
  });
});
