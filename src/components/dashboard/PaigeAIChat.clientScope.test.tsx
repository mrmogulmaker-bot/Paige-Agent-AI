/**
 * S2 — a client switch ends the conversation, the way an account switch already does.
 *
 * THE DEFECT THESE PIN. `PaigeAIChat` re-POSTs its whole local `messages` array on every turn
 * (see the `messages` payload in `handleSend`). The account-change effect clears that array, so an
 * account switch cannot carry the previous workspace's content forward. There was no equivalent
 * for `clientId`: focusing a different client — or clearing focus entirely — left client A's
 * answers in the transcript, and the next turn shipped them to the model under client B's scope.
 * The backend's client-scope guard authorizes the NAMED client; it cannot know that the prose
 * already in the array is about someone else.
 *
 * Written before the fix and confirmed red: without a scope-keyed reset, assertion 1 finds
 * "Client A private answer" still on screen after the switch.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";

const harness = vi.hoisted(() => ({ tenantId: "account-a" as string | null }));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId, activeTenant: { account_number: "42" } }),
}));
vi.mock("@/hooks/useScopedUserId", () => ({ useScopedUserId: () => "owner-1" }));
vi.mock("@/lib/playbook", () => ({ usePlaybook: () => ({ persona: { name: "PAIGE" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/voice/DictationMicButton", () => ({ DictationMicButton: () => <button type="button">mic</button> }));
vi.mock("@/hooks/useChatDocumentUpload", () => ({
  useChatDocumentUpload: () => ({
    attachedDoc: null, isDragOver: false, fileInputRef: { current: null }, acceptString: ".pdf",
    handleFileSelect: vi.fn(), handleDragOver: vi.fn(), handleDragLeave: vi.fn(), handleDrop: vi.fn(),
    removeAttachment: vi.fn(), openFilePicker: vi.fn(), setAttachedDoc: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test" } } })) } },
}));
vi.mock("@/hooks/usePaigeThreads", () => ({
  usePaigeThreads: () => ({
    threads: [], isLoading: false, isFetched: true,
    loadTurns: vi.fn(async () => []), ensureThread: vi.fn(async () => "thread-a"),
    onTurnPersisted: vi.fn(), renameThread: vi.fn(), archiveThread: vi.fn(), deleteThread: vi.fn(),
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** One SSE body, delivered as a single chunk. */
const sseResponse = (frames: string[]) => ({
  ok: true,
  status: 200,
  body: {
    getReader() {
      let sent = false;
      return {
        async read() {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode(frames.join("")) };
        },
        releaseLock() {},
      };
    },
  },
});

const mount = async (props: Record<string, unknown>) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<PaigeAIChat hideHeader fill soloTenantSafety {...props} />);
    await Promise.resolve();
  });
  return { host, root };
};

describe("PAIGE chat — a client switch ends the conversation", () => {
  it("clears the transcript when the focused client changes", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: "Client A private answer" } }] })}\n\n`, "data: [DONE]\n\n"]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { host, root } = await mount({ clientId: "client-a" });

    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "tell me about them");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(host.textContent).toContain("Client A private answer");

    // Focus moves to a different client. Nothing about client A may survive into that turn.
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill soloTenantSafety clientId="client-b" />);
      await Promise.resolve();
    });

    expect(host.textContent).not.toContain("Client A private answer");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("clears the transcript when focus is cleared entirely", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: "Client A private answer" } }] })}\n\n`, "data: [DONE]\n\n"]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { host, root } = await mount({ clientId: "client-a" });
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "tell me about them");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(host.textContent).toContain("Client A private answer");

    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill soloTenantSafety clientId={null} />);
      await Promise.resolve();
    });

    expect(host.textContent).not.toContain("Client A private answer");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});

describe("PAIGE chat — a refused client scope is visible, not merely observable", () => {
  /**
   * The backend emits `{"client_scope":{"status":"refused","reason":…}}` when the named client
   * does not belong to the caller's workspace, and streams a refusal sentence. Nothing in the app
   * read that frame (zero hits repo-wide), so the surface kept asserting a focus the server had
   * denied — the code's own comment said "an advisory signal is not a control".
   *
   * Two properties, and the second is why this is not a one-liner: releasing focus changes the
   * scope epoch, which resets the transcript — so a naive fix deletes the very message the person
   * needs to read. The refusal has to survive its own consequence.
   */
  it("releases the focus the server refused, and the refusal survives the reset", async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        `data: ${JSON.stringify({ client_scope: { status: "refused", reason: "client belongs to a different workspace" } })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "I couldn't confirm that this client belongs to your workspace." } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const refused = vi.fn();
    const { host, root } = await mount({ clientId: "client-foreign", onClientScopeRefused: refused });

    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "what's their balance");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // 1. The owning surface is told to let the focus go.
    expect(refused).toHaveBeenCalledWith("client belongs to a different workspace");

    // 2. That surface drops focus, which changes the scope epoch and resets the transcript.
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill soloTenantSafety clientId={null} onClientScopeRefused={refused} />);
      await Promise.resolve();
    });

    // 3. The person is still told why. A reset that erases the explanation is not a fix.
    expect(host.textContent).toContain("couldn't confirm");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
