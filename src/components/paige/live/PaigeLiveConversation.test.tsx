import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveConversationCard } from "@/lib/paigeLiveConversation/contract";

const control = vi.hoisted(() => ({
  start: vi.fn(),
  transition: vi.fn(async () => undefined),
}));
vi.mock("@/lib/paigeLiveConversation/client", () => ({
  startPaigeLiveConversation: control.start,
  transitionPaigeLiveConversation: control.transition,
}));

import { PaigeLiveConversation } from "./PaigeLiveConversation";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const clickText = (text: string) => {
  const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes(text));
  if (!(button instanceof HTMLButtonElement)) throw new Error(`button not found: ${text}`);
  button.click();
  return button;
};

describe("Paige Live Conversation owner surface", () => {
  let host: HTMLDivElement;
  let root: Root;
  let getUserMedia: ReturnType<typeof vi.fn>;
  const ensureThread = vi.fn(async () => "11111111-1111-4111-8111-111111111111");
  const onAnswer = vi.fn();
  const onApprove = vi.fn();
  const onDecline = vi.fn();

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    control.start.mockReset();
    control.transition.mockClear();
    ensureThread.mockClear();
    onAnswer.mockClear();
    onApprove.mockClear();
    onDecline.mockClear();
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    control.start.mockResolvedValue({ ok: false, sessionId: "22222222-2222-4222-8222-222222222222", availability: "PROOF OWED", code: "privacy_not_approved", explanation: "Live audio stays off until retention is approved. Nothing was recorded or sent." });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    document.body.querySelectorAll(".plc-stage").forEach((node) => node.remove());
  });

  const render = async (card: LiveConversationCard | null = null, epoch = "tenant-a||", working = false, threadId: string | null = null) => {
    await act(async () => root.render(
      <PaigeLiveConversation
        contextEpoch={epoch}
        threadId={threadId}
        ensureThread={ensureThread}
        transcript={[{ id: "m1", role: "assistant", content: "We are still in the same thread." }]}
        activeCard={card}
        working={working}
        confirmationFingerprints={["fingerprint-1"]}
        onAnswer={onAnswer}
        onApprove={onApprove}
        onDecline={onDecline}
      />,
    ));
  };

  it("opens the same-thread immersive stage and fails closed without requesting a microphone", async () => {
    await render();
    await act(async () => clickText("Talk live with Paige"));
    await flush();
    expect(ensureThread).toHaveBeenCalledTimes(1);
    expect(control.start).toHaveBeenCalledWith(expect.objectContaining({ threadId: "11111111-1111-4111-8111-111111111111", contextEpoch: "tenant-a||", entryMode: "embedded" }));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Same workspace · same conversation");
    expect(document.querySelector(".plc-transcript")?.textContent).toContain("We are still in the same thread.");
    expect(document.querySelector(".plc-notice")?.textContent).toContain("PROOF OWED");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("keeps audio unavailable during genuine text work and clears working Presence afterwards", async () => {
    await render();
    await act(async () => clickText("Talk live with Paige"));
    await render(null, "tenant-a||", true);
    expect(document.querySelector('[data-presence-state="working"]')).not.toBeNull();
    expect(document.querySelector(".plc-notice")?.textContent).toContain("PROOF OWED");
    await render();
    expect(document.querySelector('[data-presence-state="unavailable"]')).not.toBeNull();
    expect(document.querySelector(".plc-working")?.textContent).toContain("No active work");
  });

  it("ends late setup results instead of reviving a closed stage", async () => {
    let resolve!: (value: unknown) => void;
    control.start.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await render();
    await act(async () => { clickText("Talk live with Paige"); });
    await flush();
    await act(async () => clickText("End"));
    await act(async () => resolve({ sessionId: "late-session", availability: "PROOF OWED" }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(control.transition).toHaveBeenCalledWith("late-session", "end", expect.objectContaining({ contextEpoch: "tenant-a||" }));
  });

  it("restores a minimized same-thread session without creating another one", async () => {
    await render(null, "tenant-a||", false, "thread-a");
    await act(async () => clickText("Talk live with Paige"));
    await act(async () => clickText("Minimize"));
    await act(async () => clickText("Talk live with Paige"));
    expect(control.start).toHaveBeenCalledTimes(1);
    expect(control.transition).toHaveBeenCalledWith(expect.any(String), "restore", { threadId: "thread-a", contextEpoch: "tenant-a||" });
  });

  it("ends a minimized session on workspace or thread switch", async () => {
    await render(null, "tenant-a||", false, "thread-a");
    await act(async () => clickText("Talk live with Paige"));
    await act(async () => clickText("Minimize"));
    await render(null, "tenant-a||", false, "thread-b");
    expect(control.transition).toHaveBeenCalledWith(expect.any(String), "end", { threadId: "thread-a", contextEpoch: "tenant-a||" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("ends the bound session when New chat selects a null provisional thread", async () => {
    await render(null, "tenant-a||", false, "thread-a");
    await act(async () => clickText("Talk live with Paige"));
    await act(async () => clickText("Minimize"));
    await render(null, "tenant-a||", false, null);
    expect(control.transition).toHaveBeenCalledWith(expect.any(String), "end", { threadId: "thread-a", contextEpoch: "tenant-a||" });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("minimizes to the exact chat control and restores keyboard focus", async () => {
    await render();
    const trigger = clickText("Talk live with Paige");
    await flush();
    await act(async () => clickText("Minimize"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(control.transition).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", "minimize", { threadId: "11111111-1111-4111-8111-111111111111", contextEpoch: "tenant-a||" });
  });

  it("focuses the portaled stage and lets Escape return to the exact chat control", async () => {
    await render();
    const trigger = clickText("Talk live with Paige");
    await flush();
    const stage = document.querySelector('[role="dialog"]');
    expect(document.activeElement).toBe(stage);
    await act(async () => stage?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("ends and clears the stage when the workspace context changes", async () => {
    await render();
    await act(async () => clickText("Talk live with Paige"));
    await flush();
    await render(null, "tenant-b||");
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(control.transition).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", "end", { threadId: "11111111-1111-4111-8111-111111111111", contextEpoch: "tenant-a||" });
  });

  it("renders every supported card type while keeping exactly one current card", async () => {
    const cards: LiveConversationCard[] = [
      { id: "q", kind: "question", title: "One question", source: { availability: "LIVE" } },
      { id: "c", kind: "choice", title: "Choose", choices: [{ id: "one", label: "First path" }, { id: "two", label: "Second path" }], source: { availability: "LIVE" } },
      { id: "p", kind: "plan", title: "Strategic Play", recordType: "strategic-play", statusLabel: "Current canonical plan", source: { availability: "LIVE", canonicalRef: "plan:1" } },
      { id: "e", kind: "evidence-result", title: "Verified result", resultLabel: "Available", source: { availability: "LIVE", provenanceLabel: "Canonical record" } },
      { id: "g", kind: "governed-action", title: "Move the deal", action: { toolName: "move_deal", authorityStatus: "confirmation-required", scopeSummary: "Deal A to Qualified" }, source: { availability: "LIVE" } },
      { id: "r", kind: "recap", title: "Recap", points: [{ id: "r1", text: "Keep the plan", ownerConfirmed: true }], source: { availability: "LIVE" } },
    ];
    await render(cards[0]);
    await act(async () => clickText("Talk live with Paige"));
    await flush();
    for (const card of cards) {
      await render(card);
      expect(document.querySelectorAll(".plc-card")).toHaveLength(1);
      expect(document.querySelector(".plc-card")?.getAttribute("data-card-kind")).toBe(card.kind);
    }
  });

  it("routes ordinary choices and exact governed confirmation fingerprints through chat callbacks", async () => {
    const choice: LiveConversationCard = { id: "c", kind: "choice", title: "Choose", choices: [{ id: "one", label: "First path" }, { id: "two", label: "Second path" }], source: { availability: "LIVE" } };
    await render(choice);
    await act(async () => clickText("Talk live with Paige"));
    await flush();
    await act(async () => clickText("Second path"));
    expect(onAnswer).toHaveBeenCalledWith("Second path");

    const governed: LiveConversationCard = { id: "g", kind: "governed-action", title: "Move the deal", action: { toolName: "move_deal", authorityStatus: "confirmation-required", scopeSummary: "Deal A to Qualified", confirmationFingerprints: ["fingerprint-1"] }, source: { availability: "LIVE" } };
    await render(governed);
    await act(async () => clickText("Confirm this action"));
    expect(onApprove).toHaveBeenCalledWith(["fingerprint-1"]);
  });

  it("shows permission denial and retry without fabricating audio state", async () => {
    control.start.mockResolvedValueOnce({ ok: false, sessionId: null, availability: "UNAVAILABLE", code: "microphone_permission_denied", explanation: "Microphone access was denied. Nothing was recorded." });
    await render();
    await act(async () => clickText("Talk live with Paige"));
    await flush();
    expect(document.querySelector(".plc-state")?.textContent).toContain("Microphone permission denied");
    expect(clickText("Retry setup check")).toBeTruthy();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("keeps initial Shift+Tab and complete forward/backward focus movement inside the dialog", async () => {
    await render();
    await act(async () => clickText("Talk live with Paige"));
    await flush();
    const stage = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(stage).toBe(document.activeElement);
    await act(async () => stage.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(stage.contains(document.activeElement)).toBe(true);
    const focusable = [...stage.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
    focusable.at(-1)!.focus();
    await act(async () => focusable.at(-1)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
    expect(document.activeElement).toBe(focusable[0]);
    focusable[0].focus();
    await act(async () => focusable[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    expect(document.activeElement).toBe(focusable.at(-1));
    expect(host.hasAttribute("inert")).toBe(true);
  });

  it("native companion close minimizes instead of reopening the stage over the platform", async () => {
    let beforeUnload: (() => void) | null = null;
    const popupDocument = document.implementation.createHTMLDocument("Paige");
    const popup = {
      document: popupDocument,
      closed: false,
      close: vi.fn(),
      addEventListener: vi.fn((name: string, listener: () => void) => { if (name === "beforeunload") beforeUnload = listener; }),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    await render();
    const trigger = clickText("Talk live with Paige");
    await flush();
    await act(async () => clickText("Open in window"));
    expect(popupDocument.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => beforeUnload?.());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(popupDocument.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(control.transition).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", "minimize", { threadId: "11111111-1111-4111-8111-111111111111", contextEpoch: "tenant-a||" });
  });
});
