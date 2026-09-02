import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SoloPaigeWorkspace } from "./SoloPaigeWorkspace";

const chatHarness = vi.hoisted(() => ({
  tenantId: "account-a" as string | null,
  loadTurns: vi.fn(),
  ensureThread: vi.fn(),
  dictationOnText: null as null | ((segment: string) => void),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: null }) }));
vi.mock("@/hooks/useTenantContext", () => ({ useTenantContext: () => ({ activeTenantId: chatHarness.tenantId, activeTenant: chatHarness.tenantId ? { account_number: "42" } : null }) }));
vi.mock("@/hooks/useScopedUserId", () => ({ useScopedUserId: () => "owner-1" }));
vi.mock("@/lib/playbook", () => ({ usePlaybook: () => ({ persona: { name: "PAIGE" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/voice/DictationMicButton", () => ({
  DictationMicButton: ({ onText }: { onText: (segment: string) => void }) => {
    chatHarness.dictationOnText = onText;
    return <button type="button" aria-label="Hold to dictate" onClick={() => onText("microphone words")}>Mock hold to dictate</button>;
  },
}));
vi.mock("@/hooks/useChatDocumentUpload", () => ({
  useChatDocumentUpload: () => ({
    attachedDoc: null, isDragOver: false, fileInputRef: { current: null }, acceptString: ".pdf",
    handleFileSelect: vi.fn(), handleDragOver: vi.fn(), handleDragLeave: vi.fn(), handleDrop: vi.fn(),
    removeAttachment: vi.fn(), openFilePicker: vi.fn(), setAttachedDoc: vi.fn(),
  }),
}));
vi.mock("./data/useSoloKnowledge", () => ({
  useSoloKnowledge: () => ({ loading: false, error: null, empty: true, docs: [], refresh: vi.fn() }),
}));
vi.mock("./data/useSoloSkills", () => ({
  useSoloSkills: () => ({ loading: false, error: null, empty: true, skills: [], refresh: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test" } } })) } } }));
vi.mock("@/hooks/usePaigeThreads", () => ({
  usePaigeThreads: () => ({
    threads: [
      { id: "thread-a", title: "Account plan", last_message_at: null, message_count: 1, is_archived: false, updated_at: null },
      { id: "thread-b", title: "Failed load", last_message_at: null, message_count: 1, is_archived: false, updated_at: null },
      { id: "thread-c", title: "Superseding load", last_message_at: null, message_count: 1, is_archived: false, updated_at: null },
    ],
    isLoading: false, isFetched: true, loadTurns: chatHarness.loadTurns,
    ensureThread: chatHarness.ensureThread, onTurnPersisted: vi.fn(), renameThread: vi.fn(), archiveThread: vi.fn(), deleteThread: vi.fn(),
  }),
}));
vi.mock("@/components/dashboard/paige/ThreadRail", () => ({
  ThreadRail: ({ activeThreadId, onSelect }: { activeThreadId: string | null; onSelect: (id: string) => void }) => (
    <aside><output data-active-thread>{activeThreadId}</output><button type="button" onClick={() => onSelect("thread-b")}>Open failed thread</button><button type="button" onClick={() => onSelect("thread-c")}>Open superseding thread</button></aside>
  ),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;



/**
 * CAN A HIGH-RISK TEAM ACTION ACTUALLY BE APPROVED FROM THE CANONICAL PAIGE WORKSPACE?
 *
 * The Team capability leans entirely on one assumption: that four of its five tools, classified
 * `high`, can be approved where the operator actually is. `high` means the gate accepts nothing but
 * a fingerprint carried in the request BODY — the model asserting `confirm:true` is refused — so if
 * the Solo workspace's chat did not render the approval card, those four tools would be reachable,
 * proposable, and permanently unrunnable. Paige would offer to invite someone and then silently
 * fail to, forever.
 *
 * Reading the component tree says the card is there. That is the class of proof §70 exists to
 * reject: wiring is not a person finishing the job. So this mounts the real SoloPaigeWorkspace,
 * streams a real `paige_confirm` frame for a real Team tool, clicks the real Approve button, and
 * reads the fingerprint back out of the request body that goes over the wire.
 */
describe("a high-risk Team action can be approved from the Solo PAIGE workspace", () => {
  it("renders the approval card and sends the fingerprint in the request body", async () => {
    chatHarness.tenantId = "account-a";
    chatHarness.loadTurns.mockResolvedValue([]);
    chatHarness.ensureThread.mockResolvedValue("thread-team");

    const bodies: string[] = [];
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      const stream = new ReadableStream<Uint8Array>({ start: (c) => { streamController = c; } });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<MemoryRouter><SoloPaigeWorkspace /></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });

    const composer = host.querySelector<HTMLTextAreaElement>('textarea[placeholder="Talk while she works…"]')!;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      valueSetter.call(composer, "Make Riley an admin");
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('button[aria-label="Send message"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The server proposing a high-risk Team action: a human-readable summary and the fingerprint of
    // the EXACT stored call it describes.
    const fingerprint = "a1b2c3d4e5f60718";
    const encoder = new TextEncoder();
    await act(async () => {
      streamController.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"One access change to approve."}}]}\n'));
      streamController.enqueue(encoder.encode('data: {"paige_confirm":{"tool":"team_set_permission","summary":"Change Riley Chen (riley@northwind.example) to Admin — they will be able to invite people, manage invitations, and edit everyone\'s work details. This is an access change.","fingerprint":"' + fingerprint + '"}}\n'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      streamController.enqueue(encoder.encode("data: [DONE]\n"));
      streamController.close();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The operator can SEE what they are agreeing to — named person, named consequence.
    expect(host.textContent).toContain("Change Riley Chen");
    expect(host.textContent).toContain("This is an access change.");

    const approve = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent?.trim() === "Approve");
    expect(approve, "the Approve control renders in the Solo workspace").toBeTruthy();

    bodies.length = 0;
    await act(async () => {
      approve!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // THE ASSERTION THAT MATTERS. Not that a message was sent — that the FINGERPRINT travelled in
    // the request body. A body is the one channel the model cannot write, which is the whole basis
    // on which a `high` action is allowed to run at all.
    expect(bodies.length, "approving issues a request").toBeGreaterThan(0);
    const approvalBody = JSON.parse(bodies[bodies.length - 1]);
    expect(approvalBody.approvedConfirmations).toEqual([fingerprint]);
    // And it is not carried as prose the server would have to interpret.
    expect(approvalBody.declinedConfirmations).toBeUndefined();

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
