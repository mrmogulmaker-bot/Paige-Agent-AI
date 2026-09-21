import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";
import {
  NEW_PAIGE_CHAT_DRAFT_SLOT,
  writePaigeComposerDraft,
} from "@/lib/paigeComposerDrafts";

const harness = vi.hoisted(() => ({
  tenantId: "tenant-a" as string | null,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/app", search: "" }),
  };
});
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/playbook", () => ({
  usePlaybook: () => ({ persona: { greeting: "Harness greeting", name: "Paige", role: "AI COO" }, quickActions: [] }),
}));
vi.mock("@/hooks/useClientPortalBrand", () => ({
  useClientPortalBrandState: () => ({
    brand: harness.tenantId ? { tenant_id: harness.tenantId, tenant_name: "Harness" } : null,
    loading: false,
  }),
}));
vi.mock("@/hooks/useClientChatContext", () => ({
  useClientChatContext: () => ({ contextBlock: "", isLoading: false, hasCreditData: false }),
}));
vi.mock("@/hooks/useProfileSnapshot", () => ({ useProfileSnapshot: () => ({ snapshot: {}, refresh: vi.fn() }) }));
vi.mock("@/hooks/useBeforeUnloadGuard", () => ({ useBeforeUnloadGuard: () => undefined }));
vi.mock("@/hooks/useAnalytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/usePaigeMemory", () => ({
  usePaigeMemory: () => ({
    extractDocumentSummary: vi.fn(),
    getSessionDocumentContext: vi.fn(() => ""),
    trackActivity: vi.fn(),
    generateSessionSummary: vi.fn(),
    resetSession: vi.fn(),
  }),
}));
vi.mock("@/hooks/useChatDocumentUpload", () => ({
  useChatDocumentUpload: () => ({
    attachedDoc: null,
    isProcessingFile: false,
    isDragOver: false,
    fileInputRef: { current: null },
    handleFileSelect: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    removeAttachment: vi.fn(),
    openFilePicker: vi.fn(),
    setAttachedDoc: vi.fn(),
  }),
}));
vi.mock("@/components/voice/DictationMicButton", () => ({ DictationMicButton: () => <button type="button">Dictate</button> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) },
    functions: { invoke: vi.fn() },
  },
}));

import { PaigeChat } from "./PaigeChat";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const session = { access_token: "session-token" } as Session;
const user = (id: string) => ({ id, user_metadata: {} } as User);

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

describe("AppShell PaigeChat scoped session drafts", () => {
  let host: HTMLDivElement;
  let root: Root;
  let testNumber = 0;

  beforeEach(async () => {
    testNumber += 1;
    harness.tenantId = `app-tenant-${testNumber}`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Done" } }] })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<PaigeChat user={user(`app-user-${testNumber}`)} session={session} />);
      await settle();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const textarea = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
  const type = async (value: string) => {
    await act(async () => setTextareaValue(textarea(), value));
  };

  it("isolates and restores drafts across tenant switches", async () => {
    const firstTenant = harness.tenantId;
    const activeUser = user(`app-user-${testNumber}`);
    await type("tenant A draft");

    harness.tenantId = "app-tenant-other";
    await act(async () => {
      root.render(<PaigeChat user={activeUser} session={session} />);
      await settle();
    });
    expect(textarea().value).toBe("");
    await type("tenant B draft");

    harness.tenantId = firstTenant;
    await act(async () => {
      root.render(<PaigeChat user={activeUser} session={session} />);
      await settle();
    });
    expect(textarea().value).toBe("tenant A draft");
  });

  it("does not alias the AppShell session draft with a Solo New-chat draft", async () => {
    await act(async () => {
      writePaigeComposerDraft({
        tenantId: harness.tenantId!,
        userId: `app-user-${testNumber}`,
        threadSlot: NEW_PAIGE_CHAT_DRAFT_SLOT,
      }, "Solo-only new-chat draft");
      await settle();
    });

    expect(textarea().value).toBe("");
  });

  it("isolates and restores drafts across effective-user switches", async () => {
    const firstUser = user(`app-user-${testNumber}`);
    await type("user A draft");

    const secondUser = user("app-user-other");
    await act(async () => {
      root.render(<PaigeChat user={secondUser} session={session} />);
      await settle();
    });
    expect(textarea().value).toBe("");
    await type("user B draft");

    await act(async () => {
      root.render(<PaigeChat user={firstUser} session={session} />);
      await settle();
    });
    expect(textarea().value).toBe("user A draft");
  });

  it("hides a signed-out draft and restores it only to the same user in this browser session", async () => {
    const activeUser = user(`app-user-${testNumber}`);
    await type("same-user session draft");

    await act(async () => {
      root.render(<PaigeChat user={activeUser} session={null} />);
      await settle();
    });
    expect(textarea().value).toBe("");
    await act(async () => {
      root.render(<PaigeChat user={activeUser} session={session} />);
      await settle();
    });
    expect(textarea().value).toBe("same-user session draft");
  });

  it("retains the composer draft when the backend rejects the send", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ code: "chat_unavailable", reason: "Temporary failure." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )));
    await type("retry me");

    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>("button")).at(-1)!.click();
      await settle();
    });

    expect(textarea().value).toBe("retry me");
  });

  it("retains the composer draft when a 2xx stream closes without the completion sentinel", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" } }] })}\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )));
    await type("retain truncated AppShell turn");

    await act(async () => {
      Array.from(host.querySelectorAll<HTMLButtonElement>("button")).at(-1)!.click();
      await settle();
    });

    expect(textarea().value).toBe("retain truncated AppShell turn");
  });
});
