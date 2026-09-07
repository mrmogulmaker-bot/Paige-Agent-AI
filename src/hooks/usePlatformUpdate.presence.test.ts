import { describe, expect, it, vi } from "vitest";
import { canReloadWithoutLosingWork } from "./usePlatformUpdate";

describe("update reload safety signal", () => {
  it("does not synthesize beforeunload and trigger unrelated presence listeners", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    expect(canReloadWithoutLosingWork()).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    dispatch.mockRestore();
  });
});
