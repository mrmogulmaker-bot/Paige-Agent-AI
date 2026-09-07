import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const resizeCallbacks: Array<ResizeObserverCallback> = [];

class HarnessResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal("ResizeObserver", HarnessResizeObserver);
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/app" }) };
});
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQueryClient: () => ({ invalidateQueries: vi.fn() }) };
});
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/playbook", () => ({
  usePlaybook: () => ({ persona: { greeting: "Harness greeting", name: "Paige", role: "AI COO" }, quickActions: [] }),
}));
vi.mock("@/hooks/useClientPortalBrand", () => ({ useClientPortalBrandState: () => ({ brand: null, loading: false }) }));
vi.mock("@/hooks/useClientChatContext", () => ({
  useClientChatContext: () => ({ contextBlock: "", isLoading: false, hasCreditData: false }),
}));
vi.mock("@/hooks/useProfileSnapshot", () => ({ useProfileSnapshot: () => ({ snapshot: {}, refresh: vi.fn() }) }));
vi.mock("@/hooks/useBeforeUnloadGuard", () => ({ useBeforeUnloadGuard: () => undefined }));
vi.mock("@/hooks/useAnalytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks/usePaigeMemory", () => ({
  usePaigeMemory: () => ({
    extractDocumentSummary: vi.fn(), getSessionDocumentContext: vi.fn(() => ""), trackActivity: vi.fn(),
    generateSessionSummary: vi.fn(), resetSession: vi.fn(),
  }),
}));
vi.mock("@/hooks/useChatDocumentUpload", () => ({
  useChatDocumentUpload: () => ({
    attachedDoc: null, isProcessingFile: false, isDragOver: false, fileInputRef: { current: null },
    handleFileSelect: vi.fn(), handleDragOver: vi.fn(), handleDragLeave: vi.fn(), handleDrop: vi.fn(),
    removeAttachment: vi.fn(), openFilePicker: vi.fn(), setAttachedDoc: vi.fn(),
  }),
}));
vi.mock("@/components/voice/DictationMicButton", () => ({ DictationMicButton: () => <button type="button">Dictate</button> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) }, functions: { invoke: vi.fn() } },
}));

import { PaigeChat } from "./PaigeChat";

function setGeometry(transcript: HTMLDivElement, scrollHeight: { value: number }) {
  Object.defineProperties(transcript, {
    clientHeight: { configurable: true, get: () => 300 },
    scrollHeight: { configurable: true, get: () => scrollHeight.value },
    scrollTo: {
      configurable: true,
      value: ({ top }: ScrollToOptions) => { transcript.scrollTop = Math.min(Number(top), scrollHeight.value - 300); },
    },
  });
  transcript.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, right: 600, top: 0, bottom: 300,
    width: 600, height: 300, toJSON: () => ({}),
  });
  const message = transcript.querySelector<HTMLElement>("[data-paige-message-id]")!;
  message.getBoundingClientRect = () => ({
    x: 0, y: -transcript.scrollTop, left: 0, right: 600, top: -transcript.scrollTop,
    bottom: scrollHeight.value - transcript.scrollTop, width: 600, height: scrollHeight.value, toJSON: () => ({}),
  });
}

describe("normal PaigeChat remount scroll behavior", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    resizeCallbacks.length = 0;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    sessionStorage.clear();
  });

  it("does not inherit an unresolvable anchor after remount and follows subsequent growth", async () => {
    const props = { user: { id: "owner-a", user_metadata: {} } as never, session: null };
    await act(async () => root.render(<PaigeChat {...props} />));
    const first = host.querySelector<HTMLDivElement>("[data-paige-transcript-scroll=true]")!;
    const firstHeight = { value: 1_200 };
    setGeometry(first, firstHeight);
    const firstId = first.querySelector<HTMLElement>("[data-paige-message-id]")!.dataset.paigeMessageId;
    first.dispatchEvent(new WheelEvent("wheel"));
    first.scrollTop = 425;
    first.dispatchEvent(new Event("scroll", { bubbles: true }));

    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<PaigeChat {...props} />));
    const remount = host.querySelector<HTMLDivElement>("[data-paige-transcript-scroll=true]")!;
    const remountHeight = { value: 1_200 };
    setGeometry(remount, remountHeight);
    const remountId = remount.querySelector<HTMLElement>("[data-paige-message-id]")!.dataset.paigeMessageId;
    expect(remountId).not.toBe(firstId);

    await act(async () => window.dispatchEvent(new Event("paige-factory-reset")));
    expect(remount.scrollTop).toBe(900);

    remountHeight.value = 1_350;
    await act(async () => {
      for (const callback of resizeCallbacks) callback([], {} as ResizeObserver);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(remount.scrollTop).toBe(1_050);
  });
});
