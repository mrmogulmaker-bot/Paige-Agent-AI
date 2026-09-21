import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRailApi } from "@/components/dashboard/PaigeAIChat";

const harness = vi.hoisted(() => ({
  tenantId: "tenant-a" as string | null,
  userId: "user-a" as string | null,
  rail: null as ChatRailApi | null,
  mic: null as null | {
    scopeEpoch: string;
    onText: (segment: string, insertionPoint?: number | null) => void;
  },
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
  DictationMicButton: (props: {
    scopeEpoch: string;
    onText: (segment: string, insertionPoint?: number | null) => void;
  }) => {
    harness.mic = props;
    return <button type="button">Dictate</button>;
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
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })),
    },
  },
}));
vi.mock("@/hooks/usePaigeThreads", () => ({
  usePaigeThreads: () => ({
    threads: [],
    isLoading: false,
    isFetched: true,
    loadTurns: harness.loadTurns,
    ensureThread: harness.ensureThread,
    onTurnPersisted: vi.fn(),
    renameThread: vi.fn(),
    archiveThread: vi.fn(),
    deleteThread: vi.fn(),
  }),
}));
vi.mock("@/components/paige/live/PaigeLiveConversation", () => ({
  PaigeLiveConversation: () => null,
}));

import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const successfulStream = () => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: "Done" } }] })}\n\ndata: [DONE]\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } },
);

const failedStream = () => new Response(
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
}

describe("PaigeAIChat per-thread composer drafts", () => {
  let host: HTMLDivElement;
  let root: Root;
  let testNumber = 0;

  beforeEach(async () => {
    testNumber += 1;
    harness.tenantId = `tenant-${testNumber}`;
    harness.userId = `user-${testNumber}`;
    harness.rail = null;
    harness.mic = null;
    harness.ensureThread.mockReset();
    harness.ensureThread.mockResolvedValue("thread-created");
    harness.loadTurns.mockReset();
    harness.loadTurns.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn(async () => successfulStream()));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <PaigeAIChat
          hideHeader
          fill
          enableHistory
          soloTenantSafety
          renderRail={(api) => {
            harness.rail = api;
            return null;
          }}
        />,
      );
      await settle();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const textarea = () => host.querySelector<HTMLTextAreaElement>("textarea")!;

  const selectThread = async (id: string) => {
    await act(async () => {
      harness.rail!.onSelect(id);
      await settle();
    });
  };

  const type = async (value: string) => {
    await act(async () => setTextareaValue(textarea(), value));
  };

  it("keeps A and B independent and restores each draft on return", async () => {
    await selectThread("thread-a");
    await type("draft for A");

    await selectThread("thread-b");
    expect(textarea().value).toBe("");
    await type("draft for B");

    await selectThread("thread-a");
    expect(textarea().value).toBe("draft for A");
    await selectThread("thread-b");
    expect(textarea().value).toBe("draft for B");
  });

  it("gives New chat its own stable slot without discarding a saved-thread draft", async () => {
    await selectThread("thread-a");
    await type("saved-thread draft");

    await act(async () => {
      harness.rail!.onNewChat();
      await settle();
    });
    expect(textarea().value).toBe("");
    await type("new-chat draft");

    await selectThread("thread-a");
    expect(textarea().value).toBe("saved-thread draft");
    await act(async () => {
      harness.rail!.onNewChat();
      await settle();
    });
    expect(textarea().value).toBe("new-chat draft");
  });

  it("clears only the successfully sent thread draft", async () => {
    await selectThread("thread-a");
    await type("send A");
    await selectThread("thread-b");
    await type("keep B");
    await selectThread("thread-a");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!.click();
      await settle();
    });
    expect(textarea().value).toBe("");

    await selectThread("thread-b");
    expect(textarea().value).toBe("keep B");
  });

  it("moves a failed first-send draft from New chat to the lazily created thread", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failedStream()));
    await type("retain after failure");

    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')!.click();
      await settle();
    });

    expect(harness.ensureThread).toHaveBeenCalledWith("retain after failure");
    expect(harness.rail!.activeThreadId).toBe("thread-created");
    expect(textarea().value).toBe("retain after failure");

    await act(async () => {
      harness.rail!.onNewChat();
      await settle();
    });
    expect(textarea().value).toBe("");
    await selectThread("thread-created");
    expect(textarea().value).toBe("retain after failure");
  });

  it("isolates tenant and user scopes while preserving their own session drafts", async () => {
    await type("tenant A / user A");
    const originalTenant = harness.tenantId;
    const originalUser = harness.userId;

    harness.tenantId = "tenant-other";
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory soloTenantSafety renderRail={(api) => { harness.rail = api; return null; }} />);
      await settle();
    });
    expect(textarea().value).toBe("");
    await type("tenant B / user A");

    harness.tenantId = originalTenant;
    harness.userId = "user-other";
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory soloTenantSafety renderRail={(api) => { harness.rail = api; return null; }} />);
      await settle();
    });
    expect(textarea().value).toBe("");

    harness.userId = originalUser;
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory soloTenantSafety renderRail={(api) => { harness.rail = api; return null; }} />);
      await settle();
    });
    expect(textarea().value).toBe("tenant A / user A");
  });

  it("keeps delivered dictation in the origin thread and drops a late callback", async () => {
    await selectThread("thread-a");
    const originMic = harness.mic!;
    await act(async () => originMic.onText("spoken in A"));
    expect(textarea().value).toContain("spoken in A");

    await selectThread("thread-b");
    expect(textarea().value).toBe("");
    await act(async () => originMic.onText("late words"));
    expect(textarea().value).toBe("");

    await selectThread("thread-a");
    expect(textarea().value).toContain("spoken in A");
    expect(textarea().value).not.toContain("late words");
  });
});
