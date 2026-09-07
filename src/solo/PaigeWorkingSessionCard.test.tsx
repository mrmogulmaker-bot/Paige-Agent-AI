import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRailApi } from "@/components/dashboard/PaigeAIChat";
import { PaigeWorkingSessionCard } from "./PaigeWorkingSessionCard";
import { paigeIntentfulInterview, type InterviewSession } from "./data/paigeIntentfulInterview";

vi.mock("./data/paigeIntentfulInterview", async () => {
  const actual = await vi.importActual<typeof import("./data/paigeIntentfulInterview")>("./data/paigeIntentfulInterview");
  return {
    ...actual,
    paigeIntentfulInterview: {
      get: vi.fn(),
      start: vi.fn(),
      update: vi.fn(),
      confirm: vi.fn(),
    },
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const mocked = vi.mocked(paigeIntentfulInterview);

const api = (overrides: Partial<ChatRailApi> = {}): ChatRailApi => ({
  threads: [],
  isLoading: false,
  isFetched: true,
  activeThreadId: null,
  streamingThreadId: null,
  onSelect: vi.fn(),
  onNewChat: vi.fn(),
  ensureActiveThread: vi.fn(async () => "thread-1"),
  onRename: vi.fn(),
  onArchive: vi.fn(),
  onDelete: vi.fn(),
  mobileOpen: false,
  onMobileOpenChange: vi.fn(),
  ...overrides,
});

const session = (overrides: Partial<InterviewSession> = {}): InterviewSession => ({
  id: "session-1",
  threadId: "thread-1",
  entrySource: "paige_brief",
  focusPath: "business_foundation",
  status: "active",
  stepKey: "question_0",
  revision: 1,
  proposedFacts: [],
  updatedAt: "2026-09-07T00:00:00Z",
  ...overrides,
});

async function renderCard(cardApi: ChatRailApi, explicitOffer = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<PaigeWorkingSessionCard api={cardApi} explicitOffer={explicitOffer} accountEpoch="tenant-a" />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { host, root };
}

describe("PaigeWorkingSessionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.get.mockResolvedValue({ eligibleForFirstUse: true, session: null });
  });

  it("offers but never forces first use, and starts only after the owner chooses a path", async () => {
    const cardApi = api();
    mocked.start.mockResolvedValue({ id: "session-1", threadId: "thread-1", status: "active", revision: 1 });
    const { host, root } = await renderCard(cardApi);
    expect(host.textContent).toContain("Would you like me to help build your business brief");
    await act(async () => {
      (Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Start interview")) as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(cardApi.ensureActiveThread).toHaveBeenCalledWith("Business working interview");
    expect(mocked.start).toHaveBeenCalledWith("thread-1", "first_use", "business_foundation");
    await act(async () => root.unmount());
    host.remove();
  });

  it("waits for conversation history before offering first use", async () => {
    const { host, root } = await renderCard(api({ isLoading: true, isFetched: false }));
    expect(host.textContent).not.toContain("Would you like me to help build your business brief");
    await act(async () => root.unmount());
    host.remove();
  });

  it("supports pause without sending the answer to chat or Memory", async () => {
    const active = session();
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: active });
    mocked.update.mockResolvedValue({ ...active, status: "paused", revision: 2 });
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    await act(async () => {
      (Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Pause")) as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(mocked.update).toHaveBeenCalledWith(active, "pause", "question_0");
    expect(host.textContent).toContain("ready to continue");
    expect(document.activeElement).toBe(Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Resume")));
    await act(async () => root.unmount());
    host.remove();
  });

  it("sends only independently selected proposal ids to the canonical confirmation RPC", async () => {
    const recap = session({
      status: "recap",
      stepKey: "recap",
      proposedFacts: [
        { id: "fact-name", canonicalOwner: "settings.setup.business_brief", fieldKey: "publicName", label: "Business name", value: "North Star", provenance: "owner_statement", state: "proposed" },
        { id: "fact-client", canonicalOwner: "settings.setup.business_brief", fieldKey: "idealCustomer", label: "Ideal customer", value: "Founder-led agencies", provenance: "owner_statement", state: "proposed" },
      ],
    });
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: recap });
    mocked.confirm.mockResolvedValue({ ok: true, verified: true, status: "completed", revision: 2, canonicalOwner: "settings.setup.business_brief", selectedIds: ["fact-name"], receipt: { action: "solo_setup.owner_saved" } });
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    const labels = host.querySelectorAll(".pws-facts label");
    await act(async () => { (labels[0] as HTMLLabelElement).click(); });
    const save = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Save 1 selected")) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await act(async () => { save.click(); await Promise.resolve(); });
    expect(mocked.confirm).toHaveBeenCalledWith(recap, ["fact-name"]);
    expect(mocked.confirm).not.toHaveBeenCalledWith(expect.anything(), expect.arrayContaining(["North Star"]));
    expect(host.textContent).toContain("Selected facts were saved to Paige Brief");
    await act(async () => root.unmount());
    host.remove();
  });


  it("selects an active interview thread without rewriting its workflow state", async () => {
    const active = session();
    const cardApi = api({ activeThreadId: null });
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: active });
    const { host, root } = await renderCard(cardApi, true);
    expect(host.textContent).toContain("ready to continue");
    expect(host.textContent).not.toContain("What name should Paige use");
    await act(async () => {
      (Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Resume")) as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(cardApi.onSelect).toHaveBeenCalledWith("thread-1");
    expect(mocked.update).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });

  it("resumes a paused interview only after the owner chooses Resume", async () => {
    const paused = session({ status: "paused" });
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: paused });
    mocked.update.mockResolvedValue({ ...paused, status: "active", revision: 2 });
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    await act(async () => {
      (Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Resume")) as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(mocked.update).toHaveBeenCalledWith(paused, "resume", "question_0");
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    await act(async () => root.unmount());
    host.remove();
  });

  it("does not offer terminal sessions as resumable in unrelated chats", async () => {
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: session({ status: "completed" }) });
    const completed = await renderCard(api({ activeThreadId: "thread-2" }), true);
    expect(completed.host.textContent).not.toContain("READY TO RESUME");
    await act(async () => completed.root.unmount());
    completed.host.remove();

    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: session({ status: "ended" }) });
    const ended = await renderCard(api({ activeThreadId: "thread-2" }), true);
    expect(ended.host.textContent).not.toContain("READY TO RESUME");
    await act(async () => ended.root.unmount());
    ended.host.remove();
  });

  it("selects a recap thread without demoting the completed interview flow", async () => {
    const recap = session({ status: "recap", stepKey: "recap" });
    const cardApi = api({ activeThreadId: "thread-2" });
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: recap });
    const { host, root } = await renderCard(cardApi, true);
    await act(async () => {
      (Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Resume")) as HTMLButtonElement).click();
      await Promise.resolve();
    });
    expect(cardApi.onSelect).toHaveBeenCalledWith("thread-1");
    expect(mocked.update).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });

  it("fails closed when the interview read returns no contract instead of crashing the Paige shell", async () => {
    mocked.get.mockResolvedValue(null as never);
    const { host, root } = await renderCard(api(), true);
    expect(host.textContent).toContain("could not be verified");
    expect(host.textContent).toContain("Nothing is being shown as saved");
    await act(async () => root.unmount());
    host.remove();
  });
  it("moves the final answer into recap with one atomic workflow write", async () => {
    const active = session({ stepKey: "question_2", revision: 4 });
    const recap = { ...active, status: "recap" as const, stepKey: "recap", revision: 5, proposedFacts: [] };
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: active });
    mocked.update.mockResolvedValue(recap);
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    const textarea = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "Founder-led agencies"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { (Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Review recap")) as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(mocked.update).toHaveBeenCalledTimes(1);
    expect(mocked.update).toHaveBeenCalledWith(active, "answer", "recap", expect.objectContaining({ fieldKey: "idealCustomer", value: "Founder-led agencies" }));
    expect(mocked.update.mock.calls[0][3]).not.toHaveProperty("label");
    expect(mocked.update.mock.calls[0][3]).not.toHaveProperty("id");
    expect(document.activeElement?.id).toBe("pws-recap-title");
    await act(async () => root.unmount()); host.remove();
  });

  it("moves focus to the answer for the next accepted interview step", async () => {
    const active = session();
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: active });
    mocked.update.mockResolvedValue({ ...active, stepKey: "question_1", revision: 2 });
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    const textarea = host.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "North Star"); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { (Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Continue") as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    await act(async () => root.unmount()); host.remove();
  });

  it("shows a visible row focus treatment for recap checkboxes", async () => {
    const recap = session({ status: "recap", stepKey: "recap", proposedFacts: [
      { id: "fact-name", canonicalOwner: "settings.setup.business_brief", fieldKey: "publicName", label: "Business name", value: "North Star", provenance: "owner_statement", state: "proposed" },
    ] });
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: recap });
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    const checkbox = host.querySelector<HTMLInputElement>('.pws-facts input[type="checkbox"]')!;
    act(() => checkbox.focus());
    expect(document.activeElement).toBe(checkbox);
    const css = await import("node:fs").then(({ readFileSync }) => readFileSync("src/solo/solo-paige-workspace.css", "utf8"));
    expect(css).toContain(".pws-facts label:focus-within{outline:2px solid hsl(var(--ring));outline-offset:2px}");
    await act(async () => root.unmount()); host.remove();
  });
  it("recovers a persisted recap_pending session without parsing it as a question", async () => {
    const pending = session({ stepKey: "recap_pending", revision: 5 });
    mocked.get.mockResolvedValue({ eligibleForFirstUse: false, session: pending });
    mocked.update.mockResolvedValue({ ...pending, status: "recap", stepKey: "recap", revision: 6 });
    const { host, root } = await renderCard(api({ activeThreadId: "thread-1" }), true);
    expect(host.textContent).toContain("Your answers are ready to review");
    await act(async () => { (Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Review recap") as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(mocked.update).toHaveBeenCalledWith(pending, "recap", "recap");
    expect(document.activeElement?.id).toBe("pws-recap-title");
    await act(async () => root.unmount()); host.remove();
  });

  it("uses roving focus and arrow keys for interview paths", async () => {
    const { host, root } = await renderCard(api());
    const radios = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1]);
    await act(async () => { radios[0].focus(); radios[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[1]);
    await act(async () => root.unmount()); host.remove();
  });
});
