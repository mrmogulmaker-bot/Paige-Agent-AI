import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve("src/pages/admin/ClientsConversations.tsx"), "utf8");
const workspace = readFileSync(resolve("src/pages/admin/conversations/solo/SoloConversationsWorkspace.tsx"), "utf8");
const css = readFileSync(resolve("src/pages/admin/conversations/solo/solo-conversations-workspace.css"), "utf8");
const composer = readFileSync(resolve("src/pages/admin/conversations/shell/ConversationsRichComposer.tsx"), "utf8");

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

  it("confines the visual redesign to the tab-bounded Solo descendant", () => {
    expect(css).toContain(".trc-workspace:has(.solo-conversations-workspace) > .trc-heading");
    expect(css).toContain(".trc-conversations:has(.solo-conversations-workspace) > header");
    expect(css).toContain('grid-template-columns: minmax(190px, 0.7fr) minmax(300px, 1.3fr) var(--solo-context-width)');
    expect(css).toContain(".solo-conversations-queue { margin-right: 8px; }");
    expect(workspace).not.toMatch(/Sheet|Dialog|onClose|Close client/i);
    expect(workspace).toContain('data-pane="client-context"');
    expect(page).not.toMatch(/Your client book|Client conversations/);
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
