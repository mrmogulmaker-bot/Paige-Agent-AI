/**
 * After Approve, the approval card is gone — so no refusal may send the operator to a button on it.
 *
 * WHY THIS EXISTS. When an approval cannot be pinned to one call, both approval doors end in a
 * truthful terminal that records nothing and mints no card. The general gate's terminal told the
 * operator they "can approve the actions one at a time"; the card has a single Approve button, so
 * #1450 replaced that on the CRM door with "press Not now to clear them". That was wrong the same
 * way. `cancelConfirmations` CAN consume the rows, but the card that carries Not now renders only
 * on the LAST message, pressing Approve sends a new one, and the terminal mints no card — so after
 * Approve there is no Not now anywhere on screen. The one recovery the interface offers is asking
 * again.
 *
 * #1450 asserted its copy from a reading of the card component in isolation. This drives the REAL
 * chat surface — real card, real click, real second turn — so the claim is executed, not read.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: "account-a", activeTenant: { account_number: "42" } }),
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
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test-token" } } })) } },
}));
vi.mock("@/hooks/usePaigeThreads", () => ({
  usePaigeThreads: () => ({
    threads: [], isLoading: false, isFetched: true,
    loadTurns: vi.fn(async () => []), ensureThread: vi.fn(async () => "thread-a"),
    onTurnPersisted: vi.fn(), renameThread: vi.fn(), archiveThread: vi.fn(), deleteThread: vi.fn(),
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FP_A = "aaaaaaaaaaaaaaaa";
const FP_B = "bbbbbbbbbbbbbbbb";

const sse = (frames: string[]) => ({
  ok: true, status: 200,
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

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

const buttons = (host: HTMLElement, label: RegExp) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).filter((b) => label.test(b.textContent ?? ""));

async function askToDismissTwo(host: HTMLElement) {
  const textarea = host.querySelector("textarea")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textarea, "clear those two drafts");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
  await act(async () => { send.click(); await flush(); });
}

describe("PAIGE chat — the recovery a refusal names must exist on screen", () => {
  it("offers Approve and Not now while the card is live, and neither once Approve is pressed", async () => {
    let turn = 0;
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      turn += 1;
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      if (turn === 1) {
        return sse([
          `data: ${JSON.stringify({ choices: [{ delta: { content: "I can dismiss both of those." } }] })}\n\n`,
          `data: ${JSON.stringify({ paige_confirm: { tool: "action_advance", summary: "Dismiss the first draft", fingerprint: FP_A } })}\n\n`,
          `data: ${JSON.stringify({ paige_confirm: { tool: "action_advance", summary: "Dismiss the second draft", fingerprint: FP_B } })}\n\n`,
          "data: [DONE]\n\n",
        ]);
      }
      // The approval turn ends in the ambiguous terminal: it records nothing and mints no card.
      return sse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Nothing happened — more than one approval was waiting for that." } }] })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }));

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<PaigeAIChat hideHeader fill soloTenantSafety />); await flush(); });

      await askToDismissTwo(host);

      // The live card: one Approve for both, and Not now beside it.
      const approve = buttons(host, /^Approve/);
      expect(approve).toHaveLength(1);
      expect(approve[0].textContent).toMatch(/Approve 2/);
      expect(buttons(host, /Not now/)).toHaveLength(1);

      await act(async () => { approve[0].click(); await flush(); });

      // The second turn really ran, and it carried BOTH approvals — this is the state the refusal is
      // spoken in, reached by the real press, not by a request built by hand.
      expect(turn).toBe(2);
      expect(bodies[1]?.approvedConfirmations).toEqual([FP_A, FP_B]);
      expect(host.textContent).toMatch(/Nothing happened/);

      // And in that state there is nothing to press: telling the operator to press Not now, or to
      // approve one at a time, would name a control that does not exist.
      expect(buttons(host, /Not now/)).toHaveLength(0);
      expect(buttons(host, /^Approve/)).toHaveLength(0);
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
      vi.unstubAllGlobals();
    }
  });
});
