import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("normal Paige chat scroll stability contract", () => {
  const source = readFileSync("src/components/app/PaigeChat.tsx", "utf8");

  it("does not force every message update to the bottom", () => {
    expect(source).not.toMatch(/useEffect\(\(\) => \{\s*if \(scrollRef\.current\) \{\s*scrollRef\.current\.scrollTop = scrollRef\.current\.scrollHeight/);
  });

  it("renders messages with stable identity rather than array indexes", () => {
    expect(source).toContain("data-paige-message-id={message.id}");
    expect(source).toContain("key={message.id}");
    expect(source).not.toContain("key={index}");
  });

  it("does not reuse a scroll anchor across remounts that regenerate message ids", () => {
    expect(source).toContain("transcriptSessionKeyRef");
    expect(source).toContain("storagePrefix: transcriptSessionKeyRef.current");
    expect(source).toContain('transcriptScrollRef.current?.jumpToBottom("auto")');
  });
});
