import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createPaigeRequestFence, PaigeAIChat } from "@/components/dashboard/PaigeAIChat";
import { SoloPaigeWorkspace } from "./SoloPaigeWorkspace";

const chatHarness = vi.hoisted(() => ({
  tenantId: "account-a" as string | null,
  loadTurns: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: chatHarness.tenantId }) }));
vi.mock("@/hooks/useScopedUserId", () => ({ useScopedUserId: () => "owner-1" }));
vi.mock("@/lib/playbook", () => ({ usePlaybook: () => ({ persona: { name: "PAIGE" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useChatDocumentUpload", () => ({
  useChatDocumentUpload: () => ({
    attachedDoc: null, isDragOver: false, fileInputRef: { current: null }, acceptString: ".pdf",
    handleFileSelect: vi.fn(), handleDragOver: vi.fn(), handleDragLeave: vi.fn(), handleDrop: vi.fn(),
    removeAttachment: vi.fn(), openFilePicker: vi.fn(), setAttachedDoc: vi.fn(),
  }),
}));
vi.mock("./data/useSoloKnowledge", () => ({
  useSoloKnowledge: () => ({ loading: false, error: null, empty: true, docs: [], refresh: vi.fn() }),
}));
vi.mock("./data/useSoloSkills", () => ({
  useSoloSkills: () => ({ loading: false, error: null, empty: true, skills: [], refresh: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test" } } })) } } }));
vi.mock("@/hooks/usePaigeThreads", () => ({
  usePaigeThreads: () => ({
    threads: [
      { id: "thread-a", title: "Account plan", last_message_at: null, message_count: 1, is_archived: false, updated_at: null },
      { id: "thread-b", title: "Failed load", last_message_at: null, message_count: 1, is_archived: false, updated_at: null },
      { id: "thread-c", title: "Superseding load", last_message_at: null, message_count: 1, is_archived: false, updated_at: null },
    ],
    isLoading: false, isFetched: true, loadTurns: chatHarness.loadTurns,
    ensureThread: vi.fn(), onTurnPersisted: vi.fn(), renameThread: vi.fn(), archiveThread: vi.fn(), deleteThread: vi.fn(),
  }),
}));
vi.mock("@/components/dashboard/paige/ThreadRail", () => ({
  ThreadRail: ({ activeThreadId, onSelect }: { activeThreadId: string | null; onSelect: (id: string) => void }) => (
    <aside><output data-active-thread>{activeThreadId}</output><button type="button" onClick={() => onSelect("thread-b")}>Open failed thread</button><button type="button" onClick={() => onSelect("thread-c")}>Open superseding thread</button></aside>
  ),
}));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const RouteProbe = () => {
  const location = useLocation();
  return <output data-route>{location.pathname}</output>;
};

describe("Solo PAIGE workspace contract", () => {
  it("ships the approved taxonomy without a second Memory or Code workspace", () => {
    const workspace = source("src/solo/SoloPaigeWorkspace.tsx");
    expect(workspace).toContain('label: "Chat"');
    expect(workspace).toContain('label: "Knowledge"');
    expect(workspace).toContain('label: "Helpers"');
    expect(workspace).toContain('label: "Capabilities"');
    expect(workspace).not.toMatch(/label:\s*["']Memory["']/);
    expect(workspace).not.toMatch(/label:\s*["']Code|Sandbox["']/);
    expect(workspace).toContain('useSubtabRoute("solo", "paige", "chat")');
  });

  it("deep-links and switches the canonical Solo PAIGE subtabs", async () => {
    chatHarness.loadTurns.mockResolvedValue([]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/42/paige/knowledge"]}>
          <Routes>
            <Route path="/solo/:account/*" element={<><SoloPaigeWorkspace full /><RouteProbe /></>} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Knowledge");
    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent?.includes("Helpers"))?.click();
      await Promise.resolve();
    });
    expect(host.querySelector("[data-route]")?.textContent).toBe("/solo/42/paige/helpers");
    await act(async () => root.unmount());
    host.remove();
  });

  it("keeps secondary tabs docked over product context and canonicalizes stale full routes", async () => {
    chatHarness.loadTurns.mockResolvedValue([]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/solo/42/calendar"]}>
          <Routes>
            <Route path="/solo/:account/*" element={<><SoloPaigeWorkspace full={false} /><RouteProbe /></>} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent?.includes("Knowledge"))?.click();
      await Promise.resolve();
    });
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Knowledge");
    expect(host.querySelector("[data-route]")?.textContent).toBe("/solo/42/calendar");
    await act(async () => root.unmount());

    const staleRoot = createRoot(host);
    await act(async () => {
      staleRoot.render(
        <MemoryRouter initialEntries={["/solo/42/paige/skills"]}>
          <Routes>
            <Route path="/solo/:account/*" element={<><SoloPaigeWorkspace full /><RouteProbe /></>} />
          </Routes>
        </MemoryRouter>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector("[data-route]")?.textContent).toBe("/solo/42/paige/chat");
    await act(async () => staleRoot.unmount());
    host.remove();
  });

  it("keeps named leadership contextual and disputed assignments out of the Helpers view", () => {
    const workspace = source("src/solo/SoloPaigeWorkspace.tsx");
    expect(workspace).toContain("Current delegations");
    expect(workspace).toContain("Ephemeral helper");
    expect(workspace).toContain("Department specialist");
    expect(workspace).toContain("Durable named leadership");
    expect(workspace).not.toMatch(/ZION|OATHEN|MASON|KAVYN|MIRAEL|VAYRON|METHRA/);
    expect(workspace).not.toContain("Sub-Agent Console");
    expect(workspace).not.toContain("Forge sub-agent");
    expect(workspace).not.toContain("useSoloSubagents");
  });

  it("treats Mind as unavailable and keeps authority local to the action", () => {
    const workspace = source("src/solo/SoloPaigeWorkspace.tsx");
    expect(workspace).toContain("Mind is proposed");
    expect(workspace).toContain("not available yet");
    expect(workspace).not.toContain("/command-center/mind");
    expect(source("src/components/tenant-shell/TenantCommandCenterShell.tsx")).toContain("Ask first");
    expect(workspace).not.toMatch(/conversationHeader=\{[^\n]*Ask first/);
  });

  it("keeps the shared async safety additive and Solo-only", () => {
    const chat = source("src/components/dashboard/PaigeAIChat.tsx");
    const shell = source("src/components/tenant-shell/TenantCommandCenterShell.tsx");
    const operator = source("src/components/paige/PaigePlatformDesk.tsx");
    const sharedWorkspace = source("src/components/paige/PaigeWorkspace.tsx");
    expect(chat).toContain("soloTenantSafety?: boolean");
    expect(chat).toContain("new AbortController()");
    expect(chat).toContain("signal: requestTicket.signal");
    expect(chat).toContain("Cancel PAIGE response");
    expect(shell).not.toContain("soloTenantSafety");
    expect(operator).not.toContain("soloTenantSafety");
    expect(sharedWorkspace).not.toContain("soloTenantSafety");
    expect(chat).toContain("soloTenantSafety ? null : (");
    expect(chat).toContain("<DictationMicButton");
  });

  it("aborts and rejects every stale request generation", () => {
    const fence = createPaigeRequestFence();
    const accountA = fence.begin("account-a");
    expect(fence.isCurrent(accountA, "account-a")).toBe(true);

    fence.invalidate();
    expect(accountA.signal.aborted).toBe(true);
    expect(fence.isCurrent(accountA, "account-a")).toBe(false);

    const accountB = fence.begin("account-b");
    expect(fence.isCurrent(accountA, "account-b")).toBe(false);
    expect(fence.isCurrent(accountB, "account-b")).toBe(true);
  });

  it("cannot commit delayed account-A or history work after account B is accepted", async () => {
    const fence = createPaigeRequestFence();
    const committed: string[] = [];
    const accountA = fence.begin("account-a");
    let releaseAccountA!: () => void;
    const delayedAccountA = new Promise<void>((resolve) => { releaseAccountA = resolve; }).then(() => {
      if (fence.isCurrent(accountA, "account-b")) committed.push("account-a transcript or history");
    });

    fence.invalidate();
    const accountB = fence.begin("account-b");
    releaseAccountA();
    await delayedAccountA;
    if (fence.isCurrent(accountB, "account-b")) committed.push("account-b accepted");

    expect(committed).toEqual(["account-b accepted"]);
  });

  it("cannot let a superseded request timeout invalidate the accepted request", () => {
    vi.useFakeTimers();
    const fence = createPaigeRequestFence();
    const accountA = fence.begin("account-a");
    window.setTimeout(() => {
      if (!fence.isCurrent(accountA, "account-b")) return;
      fence.invalidate();
    }, 45_000);
    const accountB = fence.begin("account-b");
    vi.advanceTimersByTime(45_000);
    expect(fence.isCurrent(accountB, "account-b")).toBe(true);
    vi.useRealTimers();
    expect(source("src/components/dashboard/PaigeAIChat.tsx")).toMatch(/setTimeout\(\(\) => \{\s*if \(!ticketAccepted\(requestTicket\)\) return;/);
  });

  it("behaviorally restores the prior thread when the next transcript cannot hydrate", async () => {
    chatHarness.tenantId = "account-a";
    chatHarness.loadTurns.mockImplementation(async (id: string) => {
      if (id === "thread-b") throw new Error("history unavailable");
      return [{ id: "turn-a", role: "user", content: "Account A context", bundle_ref: null, surfaces_used: null, seq: 1, created_at: null }];
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory soloTenantSafety />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector("[data-active-thread]")?.textContent).toBe("thread-a");
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.querySelector("[data-active-thread]")?.textContent).toBe("thread-a");
    expect(host.textContent).toContain("Account A context");
    await act(async () => root.unmount());
    host.remove();
  });

  it("behaviorally restores the displayed transcript owner after overlapping selections", async () => {
    chatHarness.tenantId = "account-a";
    let releaseThreadB!: (turns: unknown[]) => void;
    const pendingThreadB = new Promise<unknown[]>((resolve) => { releaseThreadB = resolve; });
    chatHarness.loadTurns.mockImplementation(async (id: string) => {
      if (id === "thread-b") return pendingThreadB;
      if (id === "thread-c") throw new Error("superseding history unavailable");
      return [{ id: "turn-a", role: "user", content: "Displayed A context", bundle_ref: null, surfaces_used: null, seq: 1, created_at: null }];
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory soloTenantSafety />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>("aside button"));
    await act(async () => { buttons.find((button) => button.textContent === "Open failed thread")?.click(); await Promise.resolve(); });
    expect(host.querySelector("[data-active-thread]")?.textContent).toBe("thread-b");
    await act(async () => { buttons.find((button) => button.textContent === "Open superseding thread")?.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(host.querySelector("[data-active-thread]")?.textContent).toBe("thread-a");
    expect(host.textContent).toContain("Displayed A context");
    await act(async () => { releaseThreadB([]); await Promise.resolve(); });
    expect(host.querySelector("[data-active-thread]")?.textContent).toBe("thread-a");
    await act(async () => root.unmount());
    host.remove();
  });

  it("clears account-authored UI before the next account hydrates", () => {
    const chat = source("src/components/dashboard/PaigeAIChat.tsx");
    const app = source("src/solo/SoloApp.tsx");
    expect(chat).toMatch(/acceptedEpochRef\.current = activeTenantId;[\s\S]*requestFenceRef\.current\.invalidate\(\);/);
    expect(chat).toContain("setMessages([mkMsg({ role: \"assistant\", content: openingGreeting })])");
    expect(chat).toContain('setInput("")');
    expect(chat).toContain("setAttachedDoc(null)");
    expect(chat).toContain("setIsLoading(false)");
    expect(chat).toContain("setHistoryHydrated(false)");
    expect(chat).toContain("setHistoryTransitioning(false)");
    expect(chat).toContain("retryTurnRef.current = null");
    expect(app).toMatch(/paigeTabEpochRef\.current=activeTenantId;setPaigeDockedTab\('chat'\)/);
  });

  it("uses the authenticated active tenant only as an invalidation epoch", () => {
    const workspace = source("src/solo/SoloPaigeWorkspace.tsx");
    const app = source("src/solo/SoloApp.tsx");
    expect(workspace).toContain("activeTenantId");
    expect(workspace).toContain("soloTenantSafety");
    expect(app).toContain("activeTenantId");
    expect(app).toContain("accountEpochKey");
    expect(app).toContain("activeTenantId??'resolving'");
    expect(app).not.toMatch(/accountEpochKey=.*urlAccount/);
    expect(app).not.toContain("tenant_id:");
  });

  it("blocks sends during account resolution and thread hydration and guards history failures", () => {
    const chat = source("src/components/dashboard/PaigeAIChat.tsx");
    expect(chat).toContain("soloTenantSafety && !activeTenantId");
    expect(chat).toContain("setHistoryTransitioning(true)");
    expect(chat).toContain("if (!ticketAccepted(requestTicket)) return;");
    expect(chat).toContain("composerBlocked");
    expect(chat).toContain("Resolving the active account");
    expect(chat).toContain("previousTranscriptThreadId");
    expect(chat).toMatch(/hydratedFromRef\.current = id;[\s\S]*setConnectionIssue\(null\);[\s\S]*retryTurnRef\.current = null;/);
  });

  it("keeps structured action frames while filtering private thought steps for Solo", () => {
    const chat = source("src/components/dashboard/PaigeAIChat.tsx");
    expect(chat).toContain('steps.filter((step) => step.kind !== "thought")');
    expect(chat).toContain("approval_queued");
    expect(chat).toContain("paige_confirm");
    expect(chat).toContain("paige_artifact");
    expect(source("src/solo/SoloPaigeWorkspace.tsx")).not.toContain("hideReasoningStrip");
  });

  it("includes searchable conversation history and honest recoverable connection states", () => {
    const workspace = source("src/solo/SoloPaigeWorkspace.tsx");
    const chat = source("src/components/dashboard/PaigeAIChat.tsx");
    expect(workspace).toContain("Search conversations");
    expect(workspace).toContain("renderRail");
    expect(chat).toContain('navigator.onLine === false');
    expect(chat).toContain('setConnectionIssue("timeout")');
    expect(chat).toContain("server-side work cancellation is not confirmed");
  });

  it("preserves the approved prototype lineage in implementation source", () => {
    const workspace = source("src/solo/SoloPaigeWorkspace.tsx");
    expect(workspace).toContain("51D7A6F680DB83AEF6BFE1147E9FC1651E39206EFAED17963F2FC16EC294F117");
  });
});
