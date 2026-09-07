import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { PlatformUpdateBannerView } from "./PlatformUpdateBanner";

describe("PlatformUpdateBannerView typing protection", () => {
  it("defers the banner while an editable control has focus", () => {
    const input = document.createElement("input");
    const host = document.createElement("div");
    document.body.append(input, host);
    const root = createRoot(host);
    act(() => root.render(
      <PlatformUpdateBannerView
        updateAvailable
        customerUpdate={null}
        recentRelease={null}
        reload={() => true}
        dismiss={() => undefined}
      />,
    ));
    expect(host.querySelector('[aria-label="Paige update"]')).not.toBeNull();
    act(() => input.focus());
    expect(host.querySelector('[aria-label="Paige update"]')).toBeNull();
    act(() => root.unmount());
    input.remove();
    host.remove();
  });
});
