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


  it("fails closed when the interview read returns no contract instead of crashing the Paige shell", async () => {
    mocked.get.mockResolvedValue(null as never);
    const { host, root } = await renderCard(api(), true);
    expect(host.textContent).toContain("could not be verified");
    expect(host.textContent).toContain("Nothing is being shown as saved");
    await act(async () => root.unmount());
    host.remove();
  });
});
