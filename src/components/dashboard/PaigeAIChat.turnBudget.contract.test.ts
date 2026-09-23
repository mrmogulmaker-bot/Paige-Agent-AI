import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const readBudget = (source: string): number | null => {
  const match = source.match(/const PAIGE_INTERACTIVE_TURN_BUDGET_MS = ([\d_]+);/);
  return match ? Number(match[1].replace(/_/g, "")) : null;
};

describe("PAIGE interactive turn budget", () => {
  it("keeps the client fence and server work budget symmetric at 360 seconds", () => {
    const clientBudget = readBudget(read("src/components/dashboard/PaigeAIChat.tsx"));
    const serverBudget = readBudget(read("supabase/functions/paige-ai-chat/index.ts"));

    expect(clientBudget).toBe(360_000);
    expect(serverBudget).toBe(360_000);
    expect(clientBudget).toBe(serverBudget);
  });
});
