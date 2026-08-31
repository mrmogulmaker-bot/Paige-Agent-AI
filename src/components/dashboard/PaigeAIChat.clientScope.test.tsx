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

/**
 * An SSE body delivered CHUNK BY CHUNK, with an optional gate before a chosen chunk.
 *
 * §13 — the first version of this file delivered the whole body in one read, which is why every
 * test in it passed while the surface was still broken. A single chunk means the stream is over
 * before a switch can land, so it can only ever exercise the between-turns case. The defect an
 * independent reviewer found lives entirely in the MID-STREAM case: the reset clears the
 * transcript, and the next chunk's `setMessages([...newMessages, …])` — closed over the array
 * captured before the switch — puts the previous client's content straight back.
 */
const sseResponse = (frames: string[], opts: { gateBefore?: number; gate?: Promise<void> } = {}) => ({
  ok: true,
  status: 200,
  body: {
    getReader() {
      let i = 0;
      return {
        async read() {
          if (i >= frames.length) return { done: true, value: undefined };
          if (opts.gate && i === opts.gateBefore) await opts.gate;
          const value = new TextEncoder().encode(frames[i]);
          i += 1;
          return { done: false, value };
        },
        releaseLock() {},
      };
    },
  },
});

/**
 * MOUNTED THE WAY THE CLIENT-FOCUSING SURFACE ACTUALLY MOUNTS — `hideHeader fill enableHistory`,
 * and NO `soloTenantSafety`.
 *
 * That flag is passed by exactly one mount (`SoloPaigeWorkspace`), and Solo passes no `clientId`.
 * The surface that focuses clients (`PaigeWorkspace`) does not pass it. So a test that sets it is
 * testing a configuration in which the bug cannot occur — which is precisely why the first version
 * of these tests was green against broken code, and why re-introducing the defect left the entire
 * 507-test suite passing. The flag is deliberately absent here.
 */
const mount = async (props: Record<string, unknown>) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<PaigeAIChat hideHeader fill enableHistory {...props} />);
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
      root.render(<PaigeAIChat hideHeader fill enableHistory clientId="client-b" />);
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
      root.render(<PaigeAIChat hideHeader fill enableHistory clientId={null} />);
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
        `data: ${JSON.stringify({ client_scope: { status: "refused", kind: "permission", reason: "client belongs to a different workspace" } })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "I couldn't confirm that this client belongs to your workspace." } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const refused = vi.fn();
    const { host, root } = await mount({ clientId: "client-foreign", onFocusRelease: refused });

    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "what's their balance");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // 1. The owning surface is told to let the focus go.
    expect(refused).toHaveBeenCalledWith("refused");

    // 2. That surface drops focus, which changes the scope epoch and resets the transcript.
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory clientId={null} onFocusRelease={refused} />);
      await Promise.resolve();
    });

    // 3. The person is still told why. A reset that erases the explanation is not a fix.
    expect(host.textContent).toContain("couldn't confirm");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});

describe("PAIGE chat — a switch that lands MID-STREAM", () => {
  /**
   * THE CASE THE FIRST VERSION OF THIS FILE COULD NOT REACH, and the one that was broken.
   *
   * The reset clears the transcript. The stream is still running. Its next chunk calls
   * `setMessages([...newMessages, …])` with `newMessages` captured BEFORE the switch — so the
   * previous client's question and answer are written straight back, under the new client's scope,
   * and the next turn POSTs them. The transcript reset is only half of the isolation; the other
   * half is refusing to COMMIT a result that outlived its scope, and that half was gated behind a
   * prop this surface does not set.
   */
  it("refuses to commit a stream that outlived its scope", async () => {
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => { openGate = () => resolve(); });
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse(
        [
          `data: ${JSON.stringify({ choices: [{ delta: { content: "Client A private answer" } }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [{ delta: { content: " — and more about A" } }] })}\n\n`,
          "data: [DONE]\n\n",
        ],
        { gateBefore: 1, gate },
      ),
    ));

    const { host, root } = await mount({ clientId: "client-a" });
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "tell me about them");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); });

    // First chunk has landed; the stream is parked before the second.
    expect(host.textContent).toContain("Client A private answer");

    // The focus changes WHILE the stream is still open.
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory clientId="client-b" />);
      await Promise.resolve();
    });
    expect(host.textContent).not.toContain("Client A private answer");

    // Now let the rest of client A's answer arrive. It must not reach the screen.
    await act(async () => { openGate(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    expect(host.textContent).not.toContain("Client A private answer");
    expect(host.textContent).not.toContain("and more about A");
    expect(host.textContent).not.toContain("tell me about them");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});

describe("PAIGE chat — an UNKNOWN refusal is not a permission verdict", () => {
  /**
   * The server has six refusal reasons and only two of them are answers about ownership. The other
   * four — a failed workspace RPC, a failed authority RPC, a failed authorization read, a thrown
   * exception — mean it could not find out. The handler's own comment says so.
   *
   * Before the `kind` field existed, this surface treated all six identically: it dropped the
   * operator's focused client permanently and told them Paige could not confirm the client belongs
   * to their workspace. On a transient RPC blip that is false, unactionable, and not undoable from
   * their side.
   */
  it("keeps the focus and offers a retry when the server could not check", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse([
        `data: ${JSON.stringify({ client_scope: { status: "refused", kind: "unknown", reason: "client authorization read failed" } })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    ));
    const refused = vi.fn();
    const { host, root } = await mount({ clientId: "client-a", onFocusRelease: refused });

    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "what's their balance");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // The owning surface is NOT told to drop the focus — nothing was established about ownership.
    expect(refused).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});

describe("PAIGE chat — a parked notice cannot survive to greet an unrelated switch", () => {
  /**
   * The notice is parked on the way out of a refused scope and adopted on the way into the next
   * one. If the surface that owns focus does NOT release it — a mount that passes no
   * `onClientScopeRefused`, or focus already cleared — an unstamped notice would sit in the ref
   * indefinitely and be adopted by the next epoch change of any kind, including a WORKSPACE switch.
   * The operator would open a different workspace and be told a client there could not be
   * confirmed. Stamping it with the epoch it belongs to is what makes that impossible.
   */
  it("discards a notice nobody released, instead of carrying it into the next switch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse([
        `data: ${JSON.stringify({ client_scope: { status: "refused", kind: "permission", reason: "client belongs to a different workspace" } })}\n\n`,
        "data: [DONE]\n\n",
      ]),
    ));
    // No `onFocusRelease`: nothing releases the focus, so the notice is never adopted here.
    const { host, root } = await mount({ clientId: "client-a" });
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(textarea, "what's their balance");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
    await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    // A LATER, UNRELATED focus change. It must not inherit the earlier refusal's explanation.
    await act(async () => {
      root.render(<PaigeAIChat hideHeader fill enableHistory clientId="client-c" />);
      await Promise.resolve();
    });
    expect(host.textContent).not.toContain("let go of that focus");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
