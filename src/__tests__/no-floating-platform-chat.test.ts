// @vitest-environment node
//
// REGRESSION GUARD — no floating Paige chat anywhere in the platform (owner decision 2026-09-06).
//
// There must be NO floating Paige chat (a FAB / pop-out overlay posting to a Paige chat backend)
// mounted anywhere: not on any authenticated surface (Solo, Command Center, Clients, Campaigns,
// Settings, Marketplace, Analytics, tenant portal, mobile shell, embedded tenant surface) and not on
// the public marketing site (where a signed-in visitor's session would carry tenant/consumer context
// into it). The ONLY tenant-aware Paige experience is the dedicated authenticated Paige chat/workspace.
// A public "Product Guide" is a separate, tenant-isolated product and is UNAVAILABLE today — never a
// stripped-down tenant chat (docs/product/public-product-guide-contract.md).
//
// This guard fails if the retired floating widget is resurrected OR if a differently-named floating
// overlay that posts to a Paige chat backend is introduced. It is a STRUCTURAL guard on source, not a
// rendered proof; the removal is a compile-time fact (nothing mounts the widget), which is exactly what
// makes "no floating chat renders on any route/persona" provable without a browser.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const SRC = "src";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(?:tsx?|jsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const isTest = (p: string) => /(?:^|\/)(?:__tests__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/.test(p.replaceAll("\\", "/"));
const allSource = walk(SRC).map((p) => p.replaceAll("\\", "/"));
const nonTestSource = allSource.filter((p) => !isTest(p));

describe("no floating Paige chat is mounted anywhere (owner decision 2026-09-06)", () => {
  it("the retired floating widget and its route gate no longer exist", () => {
    expect(existsSync("src/components/FloatingChatbot.tsx")).toBe(false);
    expect(existsSync("src/lib/routing/floatingChatVisibility.ts")).toBe(false);
  });

  it("nothing imports the retired FloatingChatbot or its visibility gate", () => {
    const offenders = nonTestSource.filter((p) => {
      const src = readFileSync(p, "utf8");
      return /from\s+["'][^"']*\/FloatingChatbot["']/.test(src)
        || /from\s+["'][^"']*floatingChatVisibility["']/.test(src)
        || /\bshouldRenderFloatingChatbot\b/.test(src)
        || /\bGatedChatbot\b/.test(src);
    });
    expect(offenders, `re-introduced references: ${offenders.join(", ")}`).toEqual([]);
  });

  it("App.tsx mounts no floating chat", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    // The one global mount point. Target actual imports/mounts/calls, not the retirement comment
    // (which is allowed to name the widget to explain why it is gone).
    expect(app).not.toMatch(/import\s+\{[^}]*FloatingChatbot[^}]*\}/); // no import of the widget
    expect(app).not.toMatch(/import\s+\{[^}]*shouldRenderFloatingChatbot[^}]*\}/); // no import of the gate
    expect(app).not.toMatch(/<\s*FloatingChatbot\b/); // no JSX mount of the widget
    expect(app).not.toMatch(/<\s*GatedChatbot\b/); // no JSX mount of the gate wrapper
    expect(app).not.toMatch(/\bshouldRenderFloatingChatbot\s*\(/); // no call to the gate
  });

  it("no floating overlay posts to a Paige chat backend (catches a renamed re-introduction)", () => {
    // A "floating Paige chat" = a component that renders a document.body portal (a global overlay)
    // AND talks to a Paige chat backend. No such file may exist; the dedicated surfaces render inside
    // their route, not as a body portal.
    const offenders = nonTestSource.filter((p) => {
      const src = readFileSync(p, "utf8");
      const isBodyPortal = /createPortal\s*\([^)]*document\.body/.test(src);
      const talksToPaigeChat = /functions\/v1\/(?:paige-ai-chat|broker-paige-chat)/.test(src)
        || /["'`](?:paige-ai-chat|broker-paige-chat)["'`]/.test(src);
      return isBodyPortal && talksToPaigeChat;
    });
    expect(offenders, `floating overlay(s) posting to a Paige chat backend: ${offenders.join(", ")}`).toEqual([]);
  });

  // POSITIVE CONTROL — prove the removal did NOT take out the dedicated Paige experience.
  it("the dedicated Paige chat experience still exists", () => {
    expect(existsSync("src/components/dashboard/PaigeAIChat.tsx")).toBe(true);
    expect(existsSync("src/components/app/PaigeChat.tsx")).toBe(true);
    expect(existsSync("src/pages/broker/BrokerPaigeSession.tsx")).toBe(true);
    // and it still talks to the Paige chat backend (it was not accidentally gutted)
    expect(readFileSync("src/components/dashboard/PaigeAIChat.tsx", "utf8")).toMatch(/paige-ai-chat/);
  });
});
