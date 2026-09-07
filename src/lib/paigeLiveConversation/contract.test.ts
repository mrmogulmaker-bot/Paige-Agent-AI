import { describe, expect, it } from "vitest";
import {
  createInitialLiveConversationState,
  reduceLiveConversation,
  parseLiveConversationCard,
  resolveSpokenCardIntent,
  type LiveConversationCard,
} from "./contract";

const choiceCard: LiveConversationCard = {
  id: "card-choice-1",
  kind: "choice",
  title: "Choose the planning path",
  choices: [
    { id: "focused", label: "Focused plan" },
    { id: "broad", label: "Broad plan" },
  ],
  source: { availability: "LIVE", canonicalRef: "mission:mission-1" },
};

describe("Paige Live Conversation control contract", () => {
  it("preserves one thread and server-resolved scope through the live lifecycle", () => {
    const initial = createInitialLiveConversationState({
      threadId: "thread-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      contextEpoch: "epoch-1",
    });
    const listening = reduceLiveConversation(
      reduceLiveConversation(initial, { type: "permission-granted" }),
      { type: "provider-connected", providerSessionRef: "provider-ref" },
    );

    expect(listening.phase).toBe("listening");
    expect(listening.scope).toBe(initial.scope);
    expect(listening.providerSessionRef).toBe("provider-ref");
  });

  it("fails closed when permission is denied and exposes retry without fabricating a session", () => {
    const initial = createInitialLiveConversationState({
      threadId: "thread-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      contextEpoch: "epoch-1",
    });
    const denied = reduceLiveConversation(initial, { type: "permission-denied" });

    expect(denied.phase).toBe("permission-denied");
    expect(denied.providerSessionRef).toBeNull();
    expect(denied.failure?.retryable).toBe(true);
  });

  it("keeps exactly one primary card and archives only the replaced card reference", () => {
    const initial = createInitialLiveConversationState({
      threadId: "thread-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      contextEpoch: "epoch-1",
    });
    const first = reduceLiveConversation(initial, { type: "present-card", card: choiceCard });
    const question: LiveConversationCard = {
      id: "card-question-1",
      kind: "question",
      title: "What should Paige optimize for?",
      source: { availability: "LIVE", canonicalRef: "mission:mission-1" },
    };
    const second = reduceLiveConversation(first, { type: "present-card", card: question });

    expect(second.activeCard).toEqual(question);
    expect(second.priorCardRefs).toEqual([{ id: choiceCard.id, kind: choiceCard.kind }]);
  });

  it("allows spoken ordinary choices but never converts speech into a consequential execution", () => {
    expect(resolveSpokenCardIntent(choiceCard, "option two")).toEqual({
      kind: "conversational-selection",
      cardId: choiceCard.id,
      choiceId: "broad",
    });

    const governed: LiveConversationCard = {
      id: "card-action-1",
      kind: "governed-action",
      title: "Move the deal",
      action: { toolName: "pipeline_configure", authorityStatus: "confirmation-required" },
      source: { availability: "LIVE", canonicalRef: "deal:deal-1" },
    };
    expect(resolveSpokenCardIntent(governed, "yes")).toEqual({
      kind: "governed-review-required",
      cardId: governed.id,
      toolName: "pipeline_configure",
    });
  });

  it("clears provider state and live presentation objects on workspace switch", () => {
    const initial = createInitialLiveConversationState({
      threadId: "thread-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      contextEpoch: "epoch-1",
    });
    const active = reduceLiveConversation(
      reduceLiveConversation(
        reduceLiveConversation(initial, { type: "permission-granted" }),
        { type: "provider-connected", providerSessionRef: "provider-ref" },
      ),
      { type: "present-card", card: choiceCard },
    );
    const switched = reduceLiveConversation(active, {
      type: "scope-changed",
      scope: {
        threadId: "thread-2",
        tenantId: "tenant-2",
        workspaceId: "workspace-2",
        contextEpoch: "epoch-2",
      },
    });

    expect(switched.phase).toBe("ended");
    expect(switched.providerSessionRef).toBeNull();
    expect(switched.activeCard).toBeNull();
    expect(switched.priorCardRefs).toEqual([]);
    expect(switched.scope.workspaceId).toBe("workspace-2");
  });

  it("covers speaking, interruption, waiting, hold/resume, disconnect/retry, minimize and end", () => {
    const initial = createInitialLiveConversationState({ threadId: "thread-1", tenantId: "tenant-1", workspaceId: "workspace-1", contextEpoch: "epoch-1" });
    let state = reduceLiveConversation(reduceLiveConversation(initial, { type: "permission-granted" }), { type: "provider-connected", providerSessionRef: "provider-ref" });
    state = reduceLiveConversation(state, { type: "paige-speaking" });
    expect(state.phase).toBe("speaking");
    state = reduceLiveConversation(state, { type: "owner-interrupted" });
    expect(state.phase).toBe("interrupted");
    state = reduceLiveConversation(state, { type: "paige-waiting" });
    expect(state.phase).toBe("waiting");
    state = reduceLiveConversation(state, { type: "hold" });
    expect(state.phase).toBe("held");
    state = reduceLiveConversation(state, { type: "resume" });
    expect(state.phase).toBe("listening");
    state = reduceLiveConversation(state, { type: "minimize-changed", minimized: true });
    expect(state.minimized).toBe(true);
    state = reduceLiveConversation(state, { type: "disconnected" });
    expect(state.phase).toBe("reconnecting");
    state = reduceLiveConversation(state, { type: "retry" });
    expect(state.phase).toBe("connecting");
    state = reduceLiveConversation(state, { type: "end" });
    expect(state.phase).toBe("ended");
  });

  it("rejects malformed or oversized live-card frames without producing a renderable card", () => {
    expect(parseLiveConversationCard({ id: "bad", kind: "choice", title: "Missing choices", source: { availability: "LIVE" } })).toBeNull();
    expect(parseLiveConversationCard({ id: "bad", kind: "recap", title: "Missing points", source: { availability: "LIVE" } })).toBeNull();
    expect(parseLiveConversationCard({ id: "bad", kind: "governed-action", title: "Missing action", source: { availability: "LIVE" } })).toBeNull();
    expect(parseLiveConversationCard({ id: "bad", kind: "question", title: "x".repeat(241), source: { availability: "LIVE" } })).toBeNull();
    expect(parseLiveConversationCard(choiceCard)).toEqual(choiceCard);
  });
});
