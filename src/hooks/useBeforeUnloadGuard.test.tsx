import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { hasUnsavedWork, useBeforeUnloadGuard } from "./useBeforeUnloadGuard";

function Harness({ active }: { active: boolean }) {
  useBeforeUnloadGuard(active);
  return null;
}

describe("useBeforeUnloadGuard", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    if (root) act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it("blocks a reload only while recoverable work is active", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<Harness active />));
    expect(hasUnsavedWork()).toBe(true);
    const blocked = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    act(() => root?.render(<Harness active={false} />));
    expect(hasUnsavedWork()).toBe(false);
    const clear = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clear);
    expect(clear.defaultPrevented).toBe(false);
  });
});
