import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("src/pages/admin/ClientsConversations.tsx"), "utf8");
const workspace = readFileSync(resolve("src/pages/admin/conversations/solo/SoloConversationsWorkspace.tsx"), "utf8");
const css = readFileSync(resolve("src/pages/admin/conversations/solo/solo-conversations-workspace.css"), "utf8");
const composer = readFileSync(resolve("src/pages/admin/conversations/shell/ConversationsRichComposer.tsx"), "utf8");
const composerAtom = readFileSync(resolve("src/pages/admin/conversations/MessageComposer.tsx"), "utf8");

describe("Solo Conversations page wiring", () => {
  it("clears account-owned state and rejects late account work", () => {
    expect(page).toContain("tenantIdRef.current = null");
    expect(page.match(/accountEpochRef\.current\.accept/g)?.length ?? 0).toBeGreaterThanOrEqual(12);
    expect(page).toContain("if (!accountEpochRef.current.accept(composeEpoch)) return");
    expect(page).toContain('setRows([]); setConnectors([]); setLoading(true)');
    expect(page).toContain('setBody("")');
    expect(page).toContain('setHandlingMode("human")');
    expect(page).toContain("setAppendSignature(true); setDragOver(false); setUndo(null)");
    expect(page).toContain("if (accountEpochRef.current.accept(epoch)) void cancelUndo(id)");
  });

  it("keeps sends on proven email and SMS seams and fails governed handling closed", () => {
    expect(page).toContain('c.channel_type === "email" || c.channel_type === "sms"');
    expect(page).toContain("const composerConnectors = isSolo ? sendableConnectors : activeConnectors");
    expect(page).toContain("canSendInSolo(handlingMode, composeChannel)");
    expect(page).toContain("canSendInSolo(handlingMode, m.channel_type)");
    expect(page).toContain('sendDisabled={isSolo && handlingMode === "governed"}');
    expect(composer).toContain("disabled={disabled || uploading}");
    expect(composer).toContain("disabled={disabled || sending || drafting || uploading}");
    expect(composer).toContain("disabled={disabled || drafting || sending || uploading || !canDraft}");
    expect(composer).toContain("> Insert");
    expect(composer).toContain("onApplySnippet?.(snippet.id)");
    expect(composer).toContain("setInsertOpen(false)");
    expect(page).toContain("showCombinedInsert: isSolo");
    expect(composer).toContain('placeholder="Insert template…"');
  });

  it("opts Solo into Enter-to-send while keeping validation, IME, and duplicate-submit guards", () => {
    expect(page).toContain("onSend: send");
    expect(page).toContain("sendOnEnter: isSolo");
    expect(page).toContain("sendDisabled: isSolo");
    expect(page).toContain("!selected.contactId");
    expect(page).toContain("suppressions.some((suppression) => suppression.channel === composeChannel)");
    expect(page).toContain("sendInFlightRef.current = epoch");
    expect(composerAtom).toContain("!e.nativeEvent.isComposing");
    expect(composerAtom).toContain("sendOnEnter && plainEnter");
    expect(composerAtom).toContain("submitLockRef.current");
    expect(composerAtom).toContain("sending || disabled || sendDisabled");
  });

  it("confines the visual redesign to the tab-bounded Solo descendant", () => {
    expect(css).toContain(".trc-workspace:has(.solo-conversations-workspace) > .trc-heading");
    expect(css).toContain(".trc-conversations:has(.solo-conversations-workspace) > header");
    expect(css).toContain('grid-template-columns: minmax(190px, 1fr) minmax(320px, 1.8fr) minmax(190px, 1fr)');
    expect(css).toContain('grid-template-columns: minmax(156px, 1fr) minmax(250px, 1.7fr) minmax(156px, 1fr)');
    expect(css).toContain('grid-template-columns: minmax(128px, 1fr) minmax(224px, 1.55fr) minmax(128px, 1fr)');
    expect(css).not.toContain('--solo-context-width: 230px');
    expect(css).not.toContain('--solo-context-width: 200px');
    expect(css).not.toContain('--solo-context-width: 176px');
    expect(css).toContain(".solo-conversations-queue { margin-right: 8px; }");
    expect(workspace).not.toMatch(/Sheet|Dialog|onClose|Close client/i);
    expect(workspace).toContain('data-pane="client-context"');
    expect(page).not.toMatch(/Your client book|Client conversations/);
  });

  it("keeps an expanded selected-client profile visible instead of giving the collapse control the pane height", () => {
    expect(css).toContain(".solo-conversations-queue > *,\n.solo-conversations-thread > *");
    expect(css).not.toContain(".solo-conversations-pane > *");
    expect(css).not.toMatch(/data-form-fit="(?:narrow|tight)"[^}]*solo-context-content[^}]*visibility:\s*hidden/s);
  });

  it("keeps conversation controls compact and moves secondary channel truth into one disclosure", () => {
    expect(workspace).toContain('className="solo-operating-toolbar"');
    expect(workspace).toContain('className="solo-channel-menu"');
    expect(workspace).not.toContain('className="solo-channel-strip"');
    expect(css).not.toContain(".solo-channel-strip { flex-wrap: wrap");
  });

  it("keeps provider readiness visible and Escape-restorable", () => {
    expect(workspace).toContain("Provider / source");
    expect(workspace).toContain("A2P readiness");
    expect(workspace).toContain("Webhook health");
    expect(workspace).toContain('event.key !== "Escape"');
    expect(workspace).toContain('querySelector<HTMLElement>("summary")?.focus()');
  });

  it("opens the existing primary PAIGE workspace without fabricating client or specialist continuity", () => {
    expect(page).toContain('import { useAgentPresence } from "@/components/ui/paige"');
    expect(page).toContain("const { expandRail } = useAgentPresence()");
    expect(page).toContain("onOpenPaige={expandRail}");
    expect(page).toContain("selectedClientName={selected.name}");
    expect(page).toContain("selectedThreadLabel={`${CHANNEL_LABEL[selected.channel]}");
    expect(workspace).toContain("Account context");
    expect(workspace).toContain("Client and thread handoff");
    expect(workspace).toContain("Specialist delegation");
    expect(workspace).toContain("Durable outcomes");
    expect(workspace.match(/<dd>PROPOSED<\/dd>/g)).toHaveLength(3);
    expect(workspace).toContain("Nothing here sends externally.");
  });
});
