import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRailApi } from "./PaigeAIChat";

const harness = vi.hoisted(() => ({
  tenantId: "tenant-a" as string | null,
  userId: "user-a" as string | null,
  threads: [] as Array<{ id: string; title: string; updated_at: string }>,
  isFetched: true,
  rail: null as ChatRailApi | null,
  micCallbacks: [] as Array<{ onText: (text: string, at?: number | null) => void; disabled?: boolean }>,
  ensureThread: vi.fn(async () => "thread-created"),
  loadTurns: vi.fn(async () => [] as Array<{ role: string; content: string }>),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId, activeTenant: { account_number: 42 } }),
}));
vi.mock("@/hooks/useScopedUserId", () => ({ useScopedUserId: () => harness.userId }));
vi.mock("@/lib/playbook", () => ({ usePlaybook: () => ({ persona: { name: "PAIGE" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/voice/DictationMicButton", () => ({
  DictationMicButton: (props: { onText: (text: string, at?: number | null) => void; disabled?: boolean }) => {
    harness.micCallbacks.push(props);
    return <button type="button" aria-label="Dictate" disabled={props.disabled}>Dictate</button>;
  },
}));
vi.mock("@/hooks/useChatDocumentUpload", () => ({
  useChatDocumentUpload: () => ({
    attachedDoc: null,
    isProcessingFile: false,
    isDragOver: false,
    fileInputRef: { current: null },
    acceptString: ".pdf",
    handleFileSelect: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    removeAttachment: vi.fn(),
    openFilePicker: vi.fn(),
    setAttachedDoc: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) } },
}));
vi.mock("@/hooks/usePaigeThreads", () => ({
  usePaigeThreads: () => ({
    threads: harness.threads,
    isLoading: false,
    isFetched: harness.isFetched,
    loadTurns: harness.loadTurns,
    ensureThread: harness.ensureThread,
    onTurnPersisted: vi.fn(),
    renameThread: vi.fn(),
    archiveThread: vi.fn(),
    deleteThread: vi.fn(),
  }),
}));
vi.mock("@/components/paige/live/PaigeLiveConversation", () => ({ PaigeLiveConversation: () => null }));

import { PaigeAIChat } from "./PaigeAIChat";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const successfulStream = () => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: "Done" } }] })}\n\ndata: [DONE]\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } },
);
const streamed = (content: string) => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } },
);
const serverFailure = () => new Response(
  JSON.stringify({ code: "chat_unavailable", reason: "Temporary failure." }),
  { status: 500, headers: { "Content-Type": "application/json" } },
);

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PaigeAIChat ComposerScopeState integration", () => {
  let host: HTMLDivElement;
  let root: Root;
  let testNumber = 0;

  beforeEach(() => {
    testNumber += 1;
    harness.tenantId = `tenant-${testNumber}`;
    harness.userId = `user-${testNumber}`;
    harness.threads = [];
    harness.isFetched = true;
    harness.rail = null;
    harness.micCallbacks = [];
    harness.ensureThread.mockReset();
    harness.ensureThread.mockResolvedValue(`thread-created-${testNumber}`);
    harness.loadTurns.mockReset();
    harness.loadTurns.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => successfulStream()));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const render = async (extra: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(
        <PaigeAIChat
          hideHeader
          fill
          enableHistory
          soloTenantSafety
          renderRail={(api) => { harness.rail = api; return null; }}
          {...extra}
        />,
      );
      await settle();
    });
  };
  const textarea = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
  const send = () => host.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!;
  const type = async (value: string) => {
    await act(async () => setTextareaValue(textarea(), value));
  };

  it("does not permit typing while history is unresolved, then enables a confirmed empty history", async () => {
    harness.isFetched = false;
    await render();
    expect(textarea().disabled).toBe(true);
    expect(host.textContent).toContain("Loading your conversations");

    harness.isFetched = true;
    await render();
    expect(textarea().disabled).toBe(false);
  });

  it("keeps A visible but non-writable during B hydration, then restores each per-thread draft", async () => {
    await render();
    await act(async () => {
      harness.rail!.onSelect("thread-a");
      await settle();
    });
    await type("draft A");

    let resolveB: ((turns: Array<{ role: string; content: string }>) => void) | null = null;
    harness.loadTurns.mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve; }));
    await act(async () => {
      harness.rail!.onSelect("thread-b");
      await Promise.resolve();
    });
    expect(textarea().disabled).toBe(true);
    expect(textarea().value).toBe("draft A");

    await act(async () => {
      resolveB?.([]);
      await settle();
    });
    expect(textarea().disabled).toBe(false);
    expect(textarea().value).toBe("");
    await type("draft B");

    await act(async () => {
      harness.rail!.onSelect("thread-a");
      await settle();
    });
    expect(textarea().value).toBe("draft A");
  });

  it("isolates an account switch before cleanup and drops the origin dictation callback", async () => {
    await render();
    await type("origin words");
    const originDelivery = harness.micCallbacks.at(-1)!.onText;

    harness.tenantId = `tenant-switched-${testNumber}`;
    await render();
    expect(textarea().value).toBe("");

    await act(async () => originDelivery(" late"));
    expect(textarea().value).toBe("");
  });

  it("isolates client, mission, and explicit no-focus drafts and drops late focused dictation", async () => {
    await render({ clientId: "client-a" });
    await type("client A draft");
    const clientADelivery = harness.micCallbacks.at(-1)!.onText;

    await render({ clientId: "client-b" });
    expect(textarea().value).toBe("");
    await type("client B draft");
    await act(async () => clientADelivery(" late A"));
    expect(textarea().value).toBe("client B draft");

    await render({ businessMissionId: "mission-a" });
    expect(textarea().value).toBe("");
    await type("mission A draft");

    await render({ businessMissionId: "mission-b" });
    expect(textarea().value).toBe("");
    await type("mission B draft");

    await render();
    expect(textarea().value).toBe("");
    await type("no focus draft");

    await render({ clientId: "client-a" });
    expect(textarea().value).toBe("client A draft");
    await render({ clientId: "client-b" });
    expect(textarea().value).toBe("client B draft");
    await render({ businessMissionId: "mission-a" });
    expect(textarea().value).toBe("mission A draft");
    await render({ businessMissionId: "mission-b" });
    expect(textarea().value).toBe("mission B draft");
    await render();
    expect(textarea().value).toBe("no focus draft");
  });

  it("releases focus before saved-thread hydration without moving the focused new-chat draft", async () => {
    const onFocusRelease = vi.fn();
    let releaseFocusedLoad: ((turns: Array<{ role: string; content: string }>) => void) | null = null;
    harness.loadTurns.mockImplementationOnce(() => new Promise((resolve) => { releaseFocusedLoad = resolve; }));

    await render({ clientId: "client-a", onFocusRelease });
    await type("focused new-chat draft");
    await act(async () => {
      harness.rail!.onSelect("saved-thread");
      await Promise.resolve();
    });
    expect(onFocusRelease).toHaveBeenCalledWith("thread_resumed");

    await render({ onFocusRelease });
    expect(textarea().value).toBe("");
    await act(async () => {
      releaseFocusedLoad?.([]);
      await settle();
    });

    await render({ clientId: "client-a", onFocusRelease });
    expect(textarea().value).toBe("focused new-chat draft");
  });

  it.each([false, true])(
    "aborts an origin rail stream, releases its busy state, and never clears the target request (solo=%s)",
    async (soloTenantSafety) => {
      await render({ soloTenantSafety });
      await act(async () => {
        harness.rail!.onSelect("thread-a");
        await settle();
      });
      await type("thread A retained draft");

      let resolveOrigin: ((response: Response) => void) | null = null;
      let resolveTarget: ((response: Response) => void) | null = null;
      let originSignal: AbortSignal | undefined;
      const fetchMock = vi.fn()
        .mockImplementationOnce((_url: string, init?: RequestInit) => {
          originSignal = init?.signal as AbortSignal | undefined;
          return new Promise<Response>((resolve) => { resolveOrigin = resolve; });
        })
        .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveTarget = resolve; }));
      vi.stubGlobal("fetch", fetchMock);

      await act(async () => {
        send().click();
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        harness.rail!.onSelect("thread-b");
        await settle();
      });
      const originWasAborted = originSignal?.aborted === true;
      expect.soft(originWasAborted).toBe(true);
      if (!originWasAborted) {
        await act(async () => {
          resolveOrigin?.(streamed("PRE-FIX ORIGIN COMPLETION"));
          await settle();
        });
        return;
      }
      expect(textarea().disabled).toBe(false);
      expect(textarea().value).toBe("");

      await type("thread B prompt");
      await act(async () => {
        send().click();
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(textarea().disabled).toBe(true);

      await act(async () => {
        resolveOrigin?.(streamed("STALE THREAD A"));
        await settle();
      });
      expect(host.textContent).not.toContain("STALE THREAD A");
      expect(textarea().disabled).toBe(true);

      await act(async () => {
        resolveTarget?.(streamed("FRESH THREAD B"));
        await settle();
      });
      expect(host.textContent).toContain("FRESH THREAD B");
      expect(textarea().disabled).toBe(false);

      await act(async () => {
        harness.rail!.onNewChat();
        await settle();
      });
      expect(textarea().disabled).toBe(false);
      expect(textarea().value).toBe("");

      await act(async () => {
        harness.rail!.onSelect("thread-a");
        await settle();
      });
      expect(textarea().value).toBe("thread A retained draft");
    },
  );

  it("migrates a lazy new-chat draft and preserves a newer edit after successful Retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => serverFailure()));
    await render({ clientId: "client-a" });
    await type("original submission");
    await act(async () => {
      send().click();
      await settle();
    });
    expect(textarea().value).toBe("original submission");
    expect(harness.ensureThread).toHaveBeenCalledTimes(1);

    await type("newer edit that must survive");
    vi.stubGlobal("fetch", vi.fn(async () => successfulStream()));
    const retry = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Retry")!;
    await act(async () => {
      retry.click();
      await settle();
    });

    expect(textarea().value).toBe("newer edit that must survive");
    expect(host.textContent).not.toContain("Your message wasn't sent");
    expect(fetch).toHaveBeenCalledTimes(1);

    await render({ clientId: "client-b" });
    expect(textarea().value).toBe("");
    await render({ clientId: "client-a" });
    expect(textarea().value).toBe("newer edit that must survive");
  });
});
