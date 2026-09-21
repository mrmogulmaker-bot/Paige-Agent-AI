import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

const harness = vi.hoisted(() => ({
  activeTenantId: "tenant-a" as string | null,
  brandTenantId: "tenant-a" as string | null,
  brandLoading: false,
  micCallbacks: [] as Array<{ onText: (text: string, at?: number | null) => void; disabled?: boolean }>,
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/app", search: "" }) };
});
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.activeTenantId }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/playbook", () => ({
  usePlaybook: () => ({ persona: { greeting: "Harness greeting", name: "Paige", role: "AI COO" }, quickActions: [] }),
}));
vi.mock("@/hooks/useClientPortalBrand", () => ({
  useClientPortalBrandState: () => ({
    brand: harness.brandTenantId ? { tenant_id: harness.brandTenantId, tenant_name: "Harness" } : null,
    loading: harness.brandLoading,
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
vi.mock("@/components/voice/DictationMicButton", () => ({
  DictationMicButton: (props: { onText: (text: string, at?: number | null) => void; disabled?: boolean }) => {
    harness.micCallbacks.push(props);
    return <button type="button" aria-label="Dictate" disabled={props.disabled}>Dictate</button>;
  },
}));
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
const success = () => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: "Done" } }] })}\n\ndata: [DONE]\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } },
);
const truncated = () => new Response(
  `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" } }] })}\n\n`,
  { status: 200, headers: { "Content-Type": "text/event-stream" } },
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

describe("PaigeChat ComposerScopeState integration", () => {
  let host: HTMLDivElement;
  let root: Root;
  let currentUser: User;
  let testNumber = 0;

  beforeEach(async () => {
    testNumber += 1;
    harness.activeTenantId = `tenant-a-${testNumber}`;
    harness.brandTenantId = harness.activeTenantId;
    harness.brandLoading = false;
    harness.micCallbacks = [];
    currentUser = user(`user-a-${testNumber}`);
    vi.stubGlobal("fetch", vi.fn(async () => success()));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<PaigeChat user={currentUser} session={session} />);
      await settle();
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  const textarea = () => host.querySelector<HTMLTextAreaElement>("textarea")!;
  const dictate = () => host.querySelector<HTMLButtonElement>('button[aria-label="Dictate"]')!;
  const send = () => Array.from(host.querySelectorAll<HTMLButtonElement>("button")).at(-1)!;
  const render = async (nextUser = currentUser, nextSession: Session | null = session) => {
    currentUser = nextUser;
    await act(async () => {
      root.render(<PaigeChat user={nextUser} session={nextSession} />);
      await settle();
    });
  };
  const type = async (value: string) => {
    await act(async () => setTextareaValue(textarea(), value));
  };

  it("disables input, dictation, and Send until the complete AppShell identity agrees", async () => {
    const tenantA = harness.activeTenantId!;
    harness.activeTenantId = null;
    harness.brandTenantId = null;
    harness.brandLoading = true;
    await render();

    expect(textarea().disabled).toBe(true);
    expect(dictate().disabled).toBe(true);
    expect(send().disabled).toBe(true);
    expect(host.textContent).toContain("Select a workspace before writing to PAIGE.");

    harness.activeTenantId = tenantA;
    harness.brandLoading = false;
    harness.brandTenantId = `tenant-other-${testNumber}`;
    await render();
    expect(textarea().disabled).toBe(true);
    expect(host.textContent).toContain("does not match this conversation");
  });

  it("isolates tenant and effective-user drafts and restores each session-memory value", async () => {
    const tenantA = harness.activeTenantId!;
    const userA = currentUser;
    await type("tenant A, user A");

    harness.activeTenantId = `tenant-b-${testNumber}`;
    harness.brandTenantId = harness.activeTenantId;
    await render();
    expect(textarea().value).toBe("");
    await type("tenant B, user A");

    await render(user(`user-b-${testNumber}`));
    expect(textarea().value).toBe("");
    await type("tenant B, user B");

    await render(userA);
    expect(textarea().value).toBe("tenant B, user A");
    harness.activeTenantId = tenantA;
    harness.brandTenantId = tenantA;
    await render(userA);
    expect(textarea().value).toBe("tenant A, user A");
  });

  it("drops a dictation callback captured by the prior tenant", async () => {
    const oldDelivery = harness.micCallbacks.at(-1)!.onText;
    harness.activeTenantId = `tenant-b-${testNumber}`;
    harness.brandTenantId = harness.activeTenantId;
    await render();

    await act(async () => oldDelivery("late words"));
    expect(textarea().value).toBe("");
  });

  it("clears only after terminal DONE and preserves a draft on a truncated stream", async () => {
    await type("first complete prompt");
    await act(async () => {
      send().click();
      await settle();
    });
    expect(textarea().value).toBe("");

    vi.stubGlobal("fetch", vi.fn(async () => truncated()));
    await type("keep this prompt");
    await act(async () => {
      send().click();
      await settle();
    });
    expect(textarea().value).toBe("keep this prompt");
  });
});
