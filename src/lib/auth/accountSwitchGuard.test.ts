import { describe, expect, it, vi } from "vitest";
import { allowAccountSwitch, registerAccountSwitchGuard } from "./accountSwitchGuard";

const intent = { fromTenantId: "tenant-a", toTenantId: "tenant-b", toTenantName: "Business B" };

describe("account switch unsaved-work guard", () => {
  it("allows switching when no active surface objects", async () => {
    expect(await allowAccountSwitch(intent)).toBe(true);
  });

  it("stops at the first active surface that declines discard", async () => {
    const first = vi.fn().mockResolvedValue(false);
    const second = vi.fn().mockResolvedValue(true);
    const removeFirst = registerAccountSwitchGuard(first);
    const removeSecond = registerAccountSwitchGuard(second);
    expect(await allowAccountSwitch(intent)).toBe(false);
    expect(first).toHaveBeenCalledWith(intent);
    expect(second).not.toHaveBeenCalled();
    removeFirst();
    removeSecond();
  });
});
