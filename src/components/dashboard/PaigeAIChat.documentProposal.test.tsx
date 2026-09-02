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
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
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
    // Narrowed through a real runtime assertion, not asserted away: if `approved_keys` is not an
    // array the line above fails first, so the cast below is only ever reached when it holds.
    const approvedKeys = apply!.body?.approved_keys;
    expect(Array.isArray(approvedKeys)).toBe(true);
    expect((approvedKeys as string[]).sort()).toEqual(["credit_score_equifax", "negative_items"]);
    // THE POINT: keys travel, values do not. A body carrying 712 would mean the browser decided
    // what lands on the profile.
    expect(JSON.stringify(apply!.body)).not.toContain("712");
    expect(JSON.stringify(apply!.body)).not.toContain("displayValue");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("treats Skip as a decision the server records, not a silent dismissal", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
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

describe("PAIGE chat — Skip is a decision the SERVER accepts, not one the card announces", () => {
  /**
   * WHAT WAS WRONG. Skip set the card to `skipped` synchronously and threw the apply promise away.
   * If the request failed — or the session had expired, which throws before the request is even
   * made — the rejection was unhandled, the server row stayed `awaiting_review`, and the card had
   * already hidden its own controls behind a line reading "No problem — just let me know if you
   * want to save it later." The person was told their decision was recorded while the proposal sat
   * open on the server with no way back to it.
   *
   * These drive the real chat: they render the card, click Skip, and read what is on screen.
   */
  const renderWithApply = async (
    applyResponse: () => Promise<unknown> | unknown,
  ) => {
    toastSpy.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("paige-apply-extraction")) return await applyResponse();
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
    return { host, root };
  };

  const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
  const skipButton = (host: HTMLElement) => buttons(host).find((b) => /skip all/i.test(b.textContent ?? ""));
  const clickSkip = async (host: HTMLElement) => {
    const skip = skipButton(host)!;
    expect(skip).toBeTruthy();
    await act(async () => {
      skip.click();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    });
  };

  it("does not claim the proposal was skipped when the server refuses", async () => {
    const { host, root } = await renderWithApply(async () => ({
      ok: false, status: 502,
      json: async () => ({ error: "I couldn't record that just now. Nothing was changed — try again." }),
    }));
    await clickSkip(host);

    // The settled "skipped" sentence must NOT be on screen: the server never accepted it.
    expect(host.textContent).not.toContain("just let me know if you want to save it later");
    // The person is told what actually happened, in the server's own words.
    expect(host.textContent).toContain("Nothing was changed");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("leaves the proposal retryable after a refused skip", async () => {
    let attempts = 0;
    const { host, root } = await renderWithApply(async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, status: 502, json: async () => ({ error: "Try again." }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, declined: true, applied_keys: [] }) };
    });

    await clickSkip(host);
    // The controls are still there — a failure that hides the only way to act is not a retry state.
    expect(skipButton(host)).toBeTruthy();

    await clickSkip(host);
    expect(attempts).toBe(2);
    expect(host.textContent).toContain("just let me know if you want to save it later");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("does not claim the proposal was skipped when the session has expired", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const getSession = supabase.auth.getSession as unknown as ReturnType<typeof vi.fn>;
    const { host, root } = await renderWithApply(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }));
    try {
      // The session is gone by the time Skip is pressed — `applyExtraction` throws before any
      // request is made, which is the case the discarded promise swallowed most completely.
      getSession.mockResolvedValue({ data: { session: null } });
      await clickSkip(host);

      expect(host.textContent).not.toContain("just let me know if you want to save it later");
      expect(skipButton(host)).toBeTruthy();
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Please sign in" }));
    } finally {
      // Restored in `finally`: this mock is shared by every test in the file, so leaking a
      // signed-out session on a failed assertion would break unrelated tests that run after it.
      getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("still settles as skipped when the server accepts it", async () => {
    const { host, root } = await renderWithApply(async () => ({
      ok: true, status: 200, json: async () => ({ ok: true, declined: true, applied_keys: [] }),
    }));
    await clickSkip(host);
    expect(host.textContent).toContain("just let me know if you want to save it later");
    expect(skipButton(host)).toBeUndefined();

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
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
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
