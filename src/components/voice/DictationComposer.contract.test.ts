import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("dictation composer scope and send contract", () => {
  it("enumerates every DictationMicButton mount and requires an explicit context epoch", () => {
    const files = [
      "src/components/dashboard/PaigeAIChat.tsx",
      "src/components/app/PaigeChat.tsx",
      "src/pages/admin/conversations/shell/ConversationsRichComposer.tsx",
    ];
    const sources = files.map(read);
    const mountCount = sources.reduce(
      (count, source) => count + (source.match(/<DictationMicButton\b/g)?.length ?? 0),
      0,
    );
    expect(mountCount).toBe(3);
    expect(sources[0]).toContain("scopeEpoch={dictationEpoch}");
    expect(sources[1]).toContain("scopeEpoch={dictationScopeEpoch}");
    expect(sources[2]).toContain("scopeEpoch={dictationScopeEpoch}");
    expect(sources[0]).toContain('scopedUserId ?? "anonymous"');
    expect(sources[0]).toContain('activeThreadId ?? "new"');
    expect(sources[1]).toContain("user.id,");
    expect(sources[1]).toContain("location.pathname,");
    expect(sources[1]).toContain('location.search ?? ""');
  });

  it("pins the load-bearing epoch teardown and stale callback fence", () => {
    const hook = read("src/lib/voice/useDictation.ts");
    const scopeEffect = hook.slice(
      hook.indexOf("if (!run || run.scopeEpoch === scopeEpoch)"),
      hook.indexOf("}, [scopeEpoch, teardownRun]"),
    );
    expect(scopeEffect).toMatch(/generationRef\.current \+= 1;[\s\S]*currentRunRef\.current = null;[\s\S]*teardownRun\(run\);/);
    expect(hook).toContain("run.scopeEpoch === scopeEpochRef.current");
  });

  it("holds each composer send path until dictation finalization completes", () => {
    const paigeAiChat = read("src/components/dashboard/PaigeAIChat.tsx");
    const paigeChat = read("src/components/app/PaigeChat.tsx");
    const conversations = read("src/pages/admin/conversations/shell/ConversationsRichComposer.tsx");
    expect(paigeAiChat).toContain("const composerSendBlocked = composerBlocked || dictationActive;");
    expect(paigeAiChat).toContain("if (dictationActive) return;");
    expect(paigeChat).toContain("if (dictationActive) return;");
    expect(paigeChat).toContain("disabled={isLoading || dictationActive || (!input.trim() && !attachedDoc)}");
    expect(conversations).toContain("sendDisabled={sendDisabled || dictationActive}");
  });

  it("binds the conversations epoch to both tenant and selected thread", () => {
    const page = read("src/pages/admin/ClientsConversations.tsx");
    expect(page).toContain('dictationScopeEpoch: `${activeTenantId ?? "resolving"}|${selected.key}`');
  });
});
