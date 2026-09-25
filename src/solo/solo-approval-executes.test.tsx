/**
 * Solo approvals actually execute — the regression battery for the two-systems defect.
 *
 * THE DEFECT. Solo's Approve button wrote to `paige_pending_approvals` (via `execute-approval`)
 * while the chat gate in `paige-ai-chat` only ever honours a fingerprint echoed back in the
 * REQUEST BODY against `paige_pending_confirmations`. Two disjoint systems, nothing converting one
 * into the other. So the owner pressed Approve, the proposals rail ticked, and the action never
 * ran. Measured on production before this change: 36 proposals in 30 days, 21 never acted on —
 * including a contact, an offer letter and an email draft from one client session.
 *
 * `useSoloChat` compounded it by DELETING the `paige_confirm` frame outright, on the stated
 * grounds that confirms were "already surfaced in the 'She proposed today' rail". They were not.
 *
 * TWO PROOF CLASSES, kept apart on purpose (§13). The card is exercised BEHAVIOURALLY — really
 * rendered, really clicked. The hook needs a live `fetch` and a Supabase session, so its wiring is
 * pinned by SOURCE ASSERTION, the same class `confirm-gate-containment-wiring.test.ts` uses for
 * the edge handler. Neither stands in for an authenticated runtime drive, which is owed.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { PaigeConfirmCard, type ConfirmAction } from "@/components/chat/PaigeConfirmCard";

const HOOK = readFileSync("src/solo/data/useSoloChat.ts", "utf8");
const SHELL = readFileSync("src/solo/agent.tsx", "utf8");

function render(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => { root.render(node); });
  return {
    host,
    text: () => host.textContent ?? "",
    buttons: () => Array.from(host.querySelectorAll("button")),
    button: (label: string) =>
      Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(label)),
    cleanup: () => { act(() => { root.unmount(); }); host.remove(); },
  };
}

const FP = "a1b2c3d4e5f60718:3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("the card cannot offer an approval it has no binding for", () => {
  it("hands back the EXACT fingerprint of the action that was read", () => {
    const onApprove = vi.fn();
    const actions: ConfirmAction[] = [{ summary: "Add John Coleman to your contacts", fingerprint: FP }];
    const ui = render(
      <PaigeConfirmCard actions={actions} onApprove={onApprove} onDeny={vi.fn()} />,
    );

    const approve = ui.button("Approve");
    expect(approve).toBeTruthy();
    act(() => { approve!.click(); });

    // Not "a boolean is now true" — this precise stored call, and nothing else.
    expect(onApprove).toHaveBeenCalledWith([FP]);
    ui.cleanup();
  });

  it("renders NO approve control at all when no action carries a fingerprint", () => {
    // THE BITE. Restoring the old optional-`fingerprints` shape — a live Approve button with
    // nothing behind it — makes this fail. That button is what the owner pressed eight times.
    const onApprove = vi.fn();
    const ui = render(
      <PaigeConfirmCard
        actions={[{ summary: "Send the research email to Lavelle" }]}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );

    expect(ui.button("Approve")).toBeUndefined();
    expect(ui.buttons()).toHaveLength(0);
    // …and it says so ONCE, rather than leaving a person to discover it by pressing. When nothing
    // is approvable the card-level line carries it; repeating it per row reads as a stutter.
    expect(ui.text()).toContain("can’t complete approvals");
    expect(ui.text()).not.toContain("Can’t be approved from this chat.");
    expect(onApprove).not.toHaveBeenCalled();
    ui.cleanup();
  });

  it("names where the decision can be completed when one is supplied", () => {
    const ui = render(
      <PaigeConfirmCard
        actions={[{ summary: "Create the deal" }]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        cannotApproveHere="Open Paige in your workspace to approve this."
      />,
    );
    expect(ui.text()).toContain("Open Paige in your workspace to approve this.");
    ui.cleanup();
  });

  it("approves only the bound actions in a mixed batch, and says how many it could not", () => {
    const onApprove = vi.fn();
    const ui = render(
      <PaigeConfirmCard
        actions={[
          { summary: "Add John Coleman", fingerprint: FP },
          { summary: "Email the offer letter" },
        ]}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );

    act(() => { ui.button("Approve")!.click(); });
    expect(onApprove).toHaveBeenCalledWith([FP]);
    expect(ui.text()).toContain("1 of 2 can’t be approved here.");
    ui.cleanup();
  });

  it("reports the outcome instead of vanishing, and offers no second approval once settled", () => {
    const ui = render(
      <PaigeConfirmCard
        actions={[{ summary: "Add John Coleman", fingerprint: FP, state: "done" }]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(ui.text()).toContain("Done");
    expect(ui.button("Approve")).toBeUndefined();
    ui.cleanup();
  });

  it("surfaces a failure with its reason rather than a silent disappearance", () => {
    const ui = render(
      <PaigeConfirmCard
        actions={[{ summary: "Send the agreement", fingerprint: FP, state: "failed", note: "The sending domain isn't verified yet." }]}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
      />,
    );
    expect(ui.text()).toContain("Didn't run");
    expect(ui.text()).toContain("The sending domain isn't verified yet.");
    ui.cleanup();
  });
});

describe("Solo carries the approval back to the gate", () => {
  it("puts the echoed fingerprints in the request BODY, where the model cannot write", () => {
    expect(HOOK).toContain("approvedConfirmations: approvedFingerprints");
    expect(HOOK).toContain("declinedConfirmations: declinedFingerprints");
    // They must be inside the fetch body, not merely declared somewhere in the file.
    const body = HOOK.slice(HOOK.indexOf("body: JSON.stringify({"), HOOK.indexOf("if (!response.ok)"));
    expect(body).toContain("approvedConfirmations");
  });

  it("no longer DELETES the pending ask", () => {
    // The old line was `if (parsed.paige_confirm?.summary) continue;` with no collection.
    // Guard the exact regression: a bare drop with nothing captured.
    expect(HOOK).not.toMatch(/if \(parsed\.paige_confirm\?\.summary\) continue;/);
    expect(HOOK).toContain("setConfirms((prev)");
    expect(HOOK).toContain("confirms");
  });

  it("clears a pending ask when the turn, thread or chat changes — never a stale decision", () => {
    // A card offering a decision about a superseded turn is worse than none.
    expect(HOOK.match(/setConfirms\(\[\]\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("renders the ONE shared card on BOTH Solo chat surfaces, and builds no second one (§18)", () => {
    expect(SHELL).toContain('from "@/components/chat/PaigeConfirmCard"');
    // Full workspace AND the floating panel — a panel that could not approve would be the same
    // defect in a smaller frame.
    expect(SHELL.match(/<PaigeConfirmCard actions=\{confirms\}/g)?.length).toBe(2);
    expect(SHELL).toContain('onApprove={fps=>send("Approved — run it.",fps)}');
  });

  it("keeps summary and fingerprint PAIRED so an approval cannot land on a neighbouring call", () => {
    // The old caller built two arrays and filtered one, shifting every later summary onto the
    // wrong fingerprint.
    const chat = readFileSync("src/components/dashboard/PaigeAIChat.tsx", "utf8");
    expect(chat).not.toContain("fingerprints={message.confirm.map((c) => c.fingerprint).filter(");
    expect(chat).toContain("actions={message.confirm.map((c) => ({");
  });
});
