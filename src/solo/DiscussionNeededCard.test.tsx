import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscussionNeededCard } from "./DiscussionNeededCard";
import { paigeDiscussionNeeded } from "./data/paigeIntentfulInterview";

vi.mock("./data/paigeIntentfulInterview", async () => {
  const actual = await vi.importActual<typeof import("./data/paigeIntentfulInterview")>("./data/paigeIntentfulInterview");
  return { ...actual, paigeDiscussionNeeded: { get: vi.fn(), respond: vi.fn() } };
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mocked = vi.mocked(paigeDiscussionNeeded);
const decision = { id: "action-1", title: "Decision needed for Growth play", reason: "Missing information is preventing a complete strategic plan.", decision: "Choose the offer to prioritize", sourceRevision: 3, surface: "business_game_plan" as const };

describe("DiscussionNeededCard", () => {
  beforeEach(() => { vi.clearAllMocks(); mocked.get.mockResolvedValue(decision); mocked.respond.mockResolvedValue({ ok: true, actionId: "action-1", response: "later", sourceId: "mission-1" }); });

  async function mount(onTalkNow = vi.fn()) {
    const host = document.createElement("div"); document.body.appendChild(host); const root = createRoot(host);
    await act(async () => { root.render(<DiscussionNeededCard missionId="mission-1" onTalkNow={onTalkNow} />); await Promise.resolve(); await Promise.resolve(); });
    return { host, root, onTalkNow };
  }

  it("names the canonical missing decision and opens Paige only after Talk now is recorded", async () => {
    const view = await mount();
    expect(view.host.textContent).toContain("Choose the offer to prioritize");
    await act(async () => { (Array.from(view.host.querySelectorAll("button")).find((b) => b.textContent === "Talk now") as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(mocked.respond).toHaveBeenCalledWith("action-1", 3, "talk_now");
    expect(view.onTalkNow).toHaveBeenCalledWith(decision);
    await act(async () => view.root.unmount()); view.host.remove();
  });

  it.each([["Later", "later"], ["Don’t ask again", "dont_ask_again"]] as const)("persists %s and removes only this card", async (label, response) => {
    const view = await mount();
    await act(async () => { (Array.from(view.host.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(mocked.respond).toHaveBeenCalledWith("action-1", 3, response);
    expect(view.host.textContent).not.toContain("Choose the offer to prioritize");
    await act(async () => view.root.unmount()); view.host.remove();
  });
});
