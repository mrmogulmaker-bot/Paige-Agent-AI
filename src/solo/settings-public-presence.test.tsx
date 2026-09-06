import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanSoloSetupBrief } from "./settings-setup-contract";
import { SettingsPublicPresence } from "./settings-public-presence";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const onReviewBusinessProfile = vi.fn();
  await act(async () =>
    root.render(
      <SettingsPublicPresence
        brief={cleanSoloSetupBrief({
          publicName: "Northstar Studio",
          website: "https://northstar.example",
          phone: "+1 555 010 2020",
          serviceArea: "Greater Raleigh",
          industry: "Brand strategy",
          offers: "Strategy intensives and identity systems",
          provenance: {
            publicName: {
              source: "owner_confirmed",
              confidence: "confirmed",
              confirmedAt: "2026-09-05T14:30:00.000Z",
            },
          },
        })}
        primaryBusinessEmail="hello@northstar.example"
        onReviewBusinessProfile={onReviewBusinessProfile}
      />,
    ),
  );
  return { host, root, onReviewBusinessProfile };
}

const control = (root: ParentNode, label: string) =>
  Array.from(root.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === label,
  ) as HTMLButtonElement;

describe("Settings Public Presence", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("answers the owner question with source-backed readiness rather than a score", async () => {
    const { host, root } = await mount();
    expect(host.textContent).toContain("Be found. Be recognized. Be trusted.");
    expect(host.textContent).toContain("Business identity");
    expect(host.textContent).toContain("Website discoverability");
    expect(host.textContent).toContain("Maps and listings");
    expect(host.textContent).toContain("Directory coverage");
    expect(host.textContent).toContain("Reputation");
    expect(host.textContent).toContain("Business Profile · owner confirmed");
    expect(host.textContent).toContain("No supported provider source");
    expect(host.textContent).not.toMatch(/seo score|ranking|keyword wins|review count/i);
    expect(host.querySelector("[data-presence-score]")).toBeNull();
    await act(async () => root.unmount());
  });

  it("does not promote an unconfirmed fallback name to owner-confirmed truth", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <SettingsPublicPresence
          brief={cleanSoloSetupBrief({ publicName: "Fallback name" })}
          primaryBusinessEmail=""
          onReviewBusinessProfile={() => undefined}
        />,
      ),
    );
    expect(host.textContent).toContain("Business Profile · confirmation required");
    expect(host.textContent).not.toContain("Business Profile · owner confirmed");
    expect(host.textContent).toContain("Needs review");
    await act(async () => root.unmount());
  });

  it("uses a compact five-view workspace and explains disabled provider actions", async () => {
    const { host, root } = await mount();
    expect(
      Array.from(host.querySelectorAll('[role="tab"]')).map((tab) =>
        tab.textContent?.trim(),
      ),
    ).toEqual([
      "Presence Center",
      "Profiles & Listings",
      "Website & Search",
      "Reviews & Reputation",
      "Public Facts",
    ]);
    await act(async () => control(host, "Profiles & Listings").click());
    expect(host.textContent).toContain("Google Business Profile");
    expect(host.textContent).toContain("Apple Business Connect");
    expect(host.textContent).toContain("Yelp");
    expect(host.textContent).toContain("Connection setup stays in Integrations");
    const unavailable = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button:disabled"),
    );
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.every((button) => button.title.length > 0)).toBe(true);
    expect(host.textContent).not.toMatch(/claimed|synced|corrected|published/i);
    await act(async () => root.unmount());
  });

  it("opens Public Facts as a contained inspector, closes with Escape, and restores focus", async () => {
    const { host, root } = await mount();
    const opener = control(host, "Inspect public facts");
    opener.focus();
    await act(async () => opener.click());
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain("Northstar Studio");
    expect(dialog?.textContent).toContain("hello@northstar.example");
    expect(dialog?.textContent).toContain("Business Profile remains the edit home");
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => root.unmount());
  });

  it("routes canonical fact repair to Business Profile", async () => {
    const { host, root, onReviewBusinessProfile } = await mount();
    await act(async () => control(host, "Review Business Profile").click());
    expect(onReviewBusinessProfile).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
