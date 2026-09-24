import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useOperatorChat } from "@/operator/data/useOperatorChat";
import { SpineConversation } from "@/operator/shell/OperatorSpine";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "test" } } })) } },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * CAN THE PLATFORM OPERATOR ACTUALLY APPROVE ANYTHING FROM THEIR OWN CONSOLE?
 *
 * Until this wiring, no. The spine's SSE loop read only `choices[0].delta.content`, so a
 * `paige_confirm` frame — valid JSON carrying no `choices` — evaluated to `undefined` and fell
 * out of the loop with no branch to catch it. Not an error, not a log: gone.
 *
 * The consequence was not a missing decoration. For an action the risk policy classes `high`,
 * the server REFUSES the model's own "they said yes" channel and instructs it to point the
 * operator at "the Needs your OK card in this conversation" — a card this surface did not draw.
 * So every high-risk action was proposable, refusable, and permanently unrunnable here, and the
 * operator was told to click something that did not exist. That is a §70 dead end exactly.
 *
 * Reading the component tree would say the plate is there now. That is the class of proof §70
 * exists to reject — wiring is not a person finishing the job. So this mounts the real hook
 * against the real conversation renderer, streams a real `paige_confirm` frame, clicks the real
 * Approve button, and reads the fingerprint back out of the body that goes over the wire.
 */
describe("the platform operator can approve a gated action from the spine", () => {
  function Harness() {
    const chat = useOperatorChat();
    return (
      <div>
        <button type="button" data-ask onClick={() => chat.send("Move Northwind to Proposal")}>
          ask
        </button>
        <SpineConversation trust={{ level: 2, tally: [0, 1, 0, 0] }} turns={chat.transcript} />
      </div>
    );
  }

  it("draws what it is approving, and sends that fingerprint in the request body", async () => {
    const bodies: string[] = [];
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      const stream = new ReadableStream<Uint8Array>({ start: (c) => { controllers.push(c); } });
      return new Response(stream, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<Harness />); });

    await act(async () => {
      host.querySelector<HTMLButtonElement>("button[data-ask]")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The server proposing a gated call: the sentence a person must read, and the fingerprint of
    // the EXACT stored call it describes.
    const fingerprint = "a1b2c3d4e5f60718";
    const enc = new TextEncoder();
    await act(async () => {
      controllers[0].enqueue(enc.encode('data: {"choices":[{"delta":{"content":"One change to approve."}}]}\n'));
      controllers[0].enqueue(enc.encode(
        'data: {"paige_confirm":{"tool":"crm_update","summary":"Move Northwind Partners to Proposal — this changes what the pipeline reports.","fingerprint":"' + fingerprint + '"}}\n',
      ));
      await Promise.resolve();
    });
    await act(async () => {
      controllers[0].enqueue(enc.encode("data: [DONE]\n"));
      controllers[0].close();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // THE OPERATOR CAN SEE WHAT THEY ARE AGREEING TO. A plate that drew its act button but not
    // its list would ask them to agree to something they cannot read.
    expect(host.textContent).toContain("Move Northwind Partners to Proposal");
    expect(host.textContent).toContain("needs your OK");
    // Her prose is not overwritten by the plate, and not replaced with a false "sent nothing back".
    expect(host.textContent).toContain("One change to approve.");

    const approve = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent?.trim() === "Approve");
    expect(approve, "the Approve control renders on the operator spine").toBeTruthy();

    bodies.length = 0;
    await act(async () => {
      approve!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // THE ASSERTION THAT MATTERS. Not that a message went — that the FINGERPRINT travelled in the
    // request BODY. The body is the one channel the model cannot author, which is the entire basis
    // on which a `high` action is permitted to run at all. Sending the sentence alone would not
    // approve nothing; it would silently fall back to the model's own word.
    expect(bodies.length, "approving issues a request").toBeGreaterThan(0);
    const approval = JSON.parse(bodies[bodies.length - 1]);
    expect(approval.approvedConfirmations).toEqual([fingerprint]);
    // The key is OMITTED rather than sent empty: echoing `[]` would switch off the server's
    // by-scope fallback for every tool in the request while approving nothing.
    expect(approval.declinedConfirmations).toBeUndefined();

    // Decided means decided: the act is gone, so it cannot be fired twice. `act` itself is removed
    // rather than just its handler, because the gold plate has no disabled treatment — a button
    // that still looks live and does nothing is the dead control this work exists to end.
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .some((b) => b.textContent?.trim() === "Approve")).toBe(false);
    // ...and the record of what was agreed to stays on screen.
    expect(host.textContent).toContain("Move Northwind Partners to Proposal");

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("asks once when the agent gates the same call twice in one turn", async () => {
    const bodies: string[] = [];
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => { controllers.push(c); } }), { status: 200 });
    }));

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<Harness />); });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button[data-ask]")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The agent can gate the same tool across several rounds inside ONE turn, and each gated
    // result emits its own frame. Two frames, one action.
    const fp = "a1b2c3d4e5f60718";
    const frame = 'data: {"paige_confirm":{"tool":"crm_update","summary":"Move Northwind Partners to Proposal.","fingerprint":"' + fp + '"}}\n';
    const enc = new TextEncoder();
    await act(async () => {
      controllers[0].enqueue(enc.encode(frame));
      controllers[0].enqueue(enc.encode(frame));
      controllers[0].enqueue(enc.encode("data: [DONE]\n"));
      controllers[0].close();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Listed once, not twice — and the speaker line does not claim "2 actions".
    expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(host.textContent).not.toContain("2 actions");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .some((b) => b.textContent?.trim() === "Approve")).toBe(true);

    bodies.length = 0;
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>("button")]
        .find((b) => b.textContent?.trim() === "Approve")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    // ...and the echo carries it once.
    expect(JSON.parse(bodies[bodies.length - 1]).approvedConfirmations).toEqual([fp]);

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("does not leave an empty bubble when the turn was all proposal and no prose", async () => {
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({ start: (c) => { controllers.push(c); } }), { status: 200 },
    )));

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<Harness />); });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button[data-ask]")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const enc = new TextEncoder();
    await act(async () => {
      controllers[0].enqueue(enc.encode(
        'data: {"paige_confirm":{"tool":"crm_update","summary":"Move Northwind Partners to Proposal.","fingerprint":"a1b2c3d4e5f60718"}}\n',
      ));
      controllers[0].enqueue(enc.encode("data: [DONE]\n"));
      controllers[0].close();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The plate is the turn. What must NOT happen is the old false negative being stamped over a
    // real proposal — that sentence belongs to a turn where nothing arrived at all.
    expect(host.textContent).toContain("Move Northwind Partners to Proposal.");
    expect(host.textContent).not.toContain("she sent nothing back");
    // Exactly one "Paige" speaker line, and it is the plate's own qualified one — not a bare
    // empty bubble sitting above it.
    expect(host.textContent).toContain("needs your OK");
    expect((host.textContent ?? "").match(/Paige/g) ?? []).toHaveLength(1);

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("refuses to draw Approve when the frame carried no fingerprint", async () => {
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      new ReadableStream<Uint8Array>({ start: (c) => { controllers.push(c); } }), { status: 200 },
    )));

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<Harness />); });
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button[data-ask]")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const enc = new TextEncoder();
    await act(async () => {
      controllers[0].enqueue(enc.encode(
        'data: {"paige_confirm":{"tool":"crm_update","summary":"Move Northwind Partners to Proposal."}}\n',
      ));
      controllers[0].enqueue(enc.encode("data: [DONE]\n"));
      controllers[0].close();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The proposal is still SHOWN — the operator should see what was asked for.
    expect(host.textContent).toContain("Move Northwind Partners to Proposal.");
    // But there is nothing to echo, so there is no Approve. A button here would send the sentence
    // with no fingerprint, which does not approve nothing: it silently downgrades to the model's
    // own assertion. An honest absence beats a control that quietly weakens the gate (§13).
    expect([...host.querySelectorAll<HTMLButtonElement>("button")]
      .some((b) => b.textContent?.trim() === "Approve")).toBe(false);

    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
