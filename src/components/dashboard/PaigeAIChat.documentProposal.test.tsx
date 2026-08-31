/**
 * S3 — a document PROPOSES; it does not write.
 *
 * WHAT THIS PINS. A credit-report PDF dropped into this chat used to call
 * `sync-credit-report-data` with the service-role key the moment the model finished reading it,
 * writing three FICO columns on `profiles` plus `credit_negative_items`, `credit_accounts`,
 * `credit_inquiries`, `credit_factor_scores` and `funding_readiness_scores` — eight tables, no
 * person asked. This surface did not even parse the `sync_status` frame that reported it, so on
 * Solo the writes landed with no visible confirmation of any kind.
 *
 * The owner's rule is "any profile/client update is a clear human-reviewed proposal. Never
 * auto-write extracted fields." These tests are the front-end half of that: the frame is consumed,
 * the card appears, and the request that eventually writes carries KEYS the person ticked — never
 * the values, which would put the browser in charge of what lands on a credit profile.
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
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));
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

const UPLOAD_ID = "11111111-1111-4111-8111-111111111111";
const PROPOSAL = {
  id: UPLOAD_ID,
  source: "document",
  documentType: "Credit report",
  intro: "I read this report. Nothing has been saved to the profile yet.",
  fields: [
    { key: "credit_score_equifax", label: "Equifax score", value: 712, displayValue: "712" },
    { key: "negative_items", label: "Negative items to record", value: 3, displayValue: "3 items" },
  ],
};

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

const sendTurn = async (host: HTMLElement) => {
  const textarea = host.querySelector("textarea")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textarea, "here's my report");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const send = Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
    .find((b) => /send/i.test(b.getAttribute("aria-label") ?? ""))!;
  await act(async () => { send.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

describe("PAIGE chat — a document proposes, it does not write", () => {
  it("renders the proposal a document turn produced, instead of dropping the frame", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([
      `data: ${JSON.stringify({ choices: [{ delta: { content: "I read your report." } }] })}\n\n`,
      `data: ${JSON.stringify({ extraction_proposal: PROPOSAL })}\n\n`,
      "data: [DONE]\n\n",
    ])));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PaigeAIChat hideHeader fill soloTenantSafety />); await Promise.resolve(); });
    await sendTurn(host);

    expect(host.textContent).toContain("Equifax score");
    expect(host.textContent).toContain("Negative items to record");
    expect(host.textContent).toContain("Nothing has been saved");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("sends the ticked KEYS and never the values", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      if (String(url).includes("paige-apply-extraction")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, applied_keys: ["credit_score_equifax"] }) };
      }
      return sse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "I read your report." } }] })}\n\n`,
        `data: ${JSON.stringify({ extraction_proposal: PROPOSAL })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PaigeAIChat hideHeader fill soloTenantSafety />); await Promise.resolve(); });
    await sendTurn(host);

    const save = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /save selected/i.test(b.textContent ?? ""))!;
    expect(save).toBeTruthy();
    await act(async () => { save.click(); await Promise.resolve(); await Promise.resolve(); });

    const apply = calls.find((c) => c.url.includes("paige-apply-extraction"));
    expect(apply).toBeTruthy();
    expect(apply!.body.upload_id).toBe(UPLOAD_ID);
    expect(Array.isArray(apply!.body.approved_keys)).toBe(true);
    expect(apply!.body.approved_keys.sort()).toEqual(["credit_score_equifax", "negative_items"]);
    // THE POINT: keys travel, values do not. A body carrying 712 would mean the browser decided
    // what lands on the profile.
    expect(JSON.stringify(apply!.body)).not.toContain("712");
    expect(JSON.stringify(apply!.body)).not.toContain("displayValue");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("treats Skip as a decision the server records, not a silent dismissal", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      if (String(url).includes("paige-apply-extraction")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, declined: true, applied_keys: [] }) };
      }
      return sse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "I read your report." } }] })}\n\n`,
        `data: ${JSON.stringify({ extraction_proposal: PROPOSAL })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PaigeAIChat hideHeader fill soloTenantSafety />); await Promise.resolve(); });
    await sendTurn(host);

    const skip = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /skip all/i.test(b.textContent ?? ""))!;
    expect(skip).toBeTruthy();
    await act(async () => { skip.click(); await Promise.resolve(); await Promise.resolve(); });

    const apply = calls.find((c) => c.url.includes("paige-apply-extraction"));
    expect(apply).toBeTruthy();
    expect(apply!.body.approved_keys).toEqual([]);

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});

describe("PAIGE chat — unticking a field means it is not written", () => {
  /**
   * THE MUTATION THAT PASSED EVERY OTHER TEST. Making the card's `toggle()` a no-op — so a person
   * unticks "Equifax score", presses Save, and the score is written anyway — left all three of the
   * tests above green, because none of them ever unchecked a box. "Sends the ticked keys" was not
   * testing ticking at all; it was testing that A list was sent.
   *
   * Found by an independent reviewer. This is the case that makes the per-field checklist mean
   * something.
   */
  it("omits the field the person unticked", async () => {
    const calls: Array<{ url: string; body: any }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
      if (String(url).includes("paige-apply-extraction")) {
        return { ok: true, status: 200, json: async () => ({ ok: true, applied_keys: ["negative_items"] }) };
      }
      return sse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "I read your report." } }] })}\n\n`,
        `data: ${JSON.stringify({ extraction_proposal: PROPOSAL })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }));
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<PaigeAIChat hideHeader fill soloTenantSafety />); await Promise.resolve(); });
    await sendTurn(host);

    // Untick the Equifax score specifically.
    const boxes = Array.from(host.querySelectorAll<HTMLElement>('[role="checkbox"], input[type="checkbox"]'));
    expect(boxes.length).toBeGreaterThan(1);
    await act(async () => { boxes[0].click(); await Promise.resolve(); });

    const save = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => /save selected/i.test(b.textContent ?? ""))!;
    await act(async () => { save.click(); await Promise.resolve(); await Promise.resolve(); });

    const apply = calls.find((c) => c.url.includes("paige-apply-extraction"));
    expect(apply).toBeTruthy();
    expect(apply!.body.approved_keys).toEqual(["negative_items"]);

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
