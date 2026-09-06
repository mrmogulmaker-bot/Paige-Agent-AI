// @vitest-environment node
//
// REGRESSION GUARD — no floating Paige chat anywhere in the platform (owner decision 2026-09-06).
//
// There must be NO floating Paige chat (a FAB / pop-out overlay that reaches a Paige chat backend)
// mounted anywhere: not on any authenticated surface (Solo, Command Center, Clients, Campaigns,
// Settings, Marketplace, Analytics, tenant portal, mobile shell, embedded tenant surface) and not on
// the public marketing site (where a signed-in visitor's session would carry tenant/consumer context
// into it). The ONLY tenant-aware Paige experience is the dedicated authenticated Paige chat/workspace.
// A public "Product Guide" is a separate, tenant-isolated product and is UNAVAILABLE today — never a
// stripped-down tenant chat (docs/product/public-product-guide-contract.md).
//
// WHAT THIS GUARD IS, HONESTLY (§13). It is a STRUCTURAL BACKSTOP on source, not a proof and not a
// substitute for code review. It catches:
//   (1) resurrection of the retired widget by name (file-exists + import + JSX-mount asserts);
//   (2) the App.tsx global mount point being re-populated with a floating chat;
//   (3) a differently-NAMED re-introduction that takes the shape of a "global overlay that reaches a
//       Paige chat backend" — where a global overlay = a `document.body` portal OR a `z-[99xx]`
//       fixed FAB, and "reaches a Paige chat backend" = an inline paige-ai-chat/broker-paige-chat
//       literal OR importing a Paige-chat driver hook (so the backend call can hide inside a hook and
//       still be caught — the exact evasion an independent security review flagged 2026-09-06).
// It can still be evaded by a sufficiently different re-introduction (e.g. a normal-z `position:fixed`
// FAB that reaches Paige only through a component it renders, with no portal, no high-z, and no hook
// import of its own). That residual gap is why this guard COMPLEMENTS — does not replace — the App.tsx
// global-mount assertion and human/independent review. The predicate is unit-tested below against
// synthetic offenders so the guard is demonstrably non-vacuous.
//
// Why a structural guard at all: the removal is a compile-time fact (nothing mounts the widget), which
// is exactly what makes "no floating chat renders on any route/persona" provable without a browser.
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

// ── Detection predicate (pure; unit-tested below so the guard is provably non-vacuous) ──────────────
//
// A "floating Paige chat" is a GLOBAL OVERLAY that REACHES A PAIGE CHAT BACKEND. The dedicated
// experience is NOT flagged: it renders inside its route/shell, and where the shell portals the
// dedicated workspace it targets a specific host ref (e.g. `paigePortalHost`), never `document.body`,
// and does not carry a chat-driver hook import of its own.
const PAIGE_CHAT_HOOKS = ["useSoloChat", "useOperatorChat", "useClientChatContext", "usePaigeMemory"];

export function reachesPaigeChatBackend(src: string): boolean {
  if (/functions\/v1\/(?:paige-ai-chat|broker-paige-chat)/.test(src)) return true;
  if (/["'`](?:paige-ai-chat|broker-paige-chat)["'`]/.test(src)) return true;
  // backend call can be indirected through a Paige-chat driver hook
  return new RegExp(`\\b(?:${PAIGE_CHAT_HOOKS.join("|")})\\b`).test(src);
}

export function isGlobalOverlay(src: string): boolean {
  // A document.body portal (robust to parens/JSX in the portal children — we don't require the two
  // tokens to be adjacent, only co-present, and precision comes from the backend requirement).
  const bodyPortal = /\bcreatePortal\b/.test(src) && /document\.body/.test(src);
  // A very-high-z fixed FAB (the retired widget's own z-[9999] signature; zero legit occurrences).
  const superHighZ = /z-\[99\d\d\]/.test(src) || /zIndex:\s*99\d\d/.test(src);
  return bodyPortal || superHighZ;
}

export function isFloatingPaigeOverlay(src: string): boolean {
  return isGlobalOverlay(src) && reachesPaigeChatBackend(src);
}

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

  it("no global overlay reaches a Paige chat backend (catches a renamed / hook-indirected re-introduction)", () => {
    const offenders = nonTestSource.filter((p) => isFloatingPaigeOverlay(readFileSync(p, "utf8")));
    expect(
      offenders,
      `floating Paige overlay(s) — global overlay reaching a Paige chat backend: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  // PROVE THE GUARD BITES (§13 — a guard whose comment overclaims is worse than an honest one).
  // Synthetic offenders standing in for the evasions an independent review flagged, plus the legit
  // shapes that MUST stay clean.
  it("the overlay predicate flags the evasion shapes and clears the legitimate ones", () => {
    // (i) hook-indirected body-portal FAB (backend call hidden in a hook) → FLAGGED
    expect(
      isFloatingPaigeOverlay(
        `import { useSoloChat } from "@/solo/data/useSoloChat";\n` +
          `export const Fab = () => createPortal(<Panel/>, document.body);`,
      ),
    ).toBe(true);
    // (ii) no-portal z-[9999] fixed FAB reaching a Paige backend inline → FLAGGED
    expect(
      isFloatingPaigeOverlay(
        `export const Fab = () => (<div className="fixed bottom-6 right-6 z-[9999]">` +
          `{fetch("/functions/v1/paige-ai-chat")}</div>);`,
      ),
    ).toBe(true);
    // (iii) the dedicated shell: portals the workspace to a host ref, references document.body for a
    // scroll-lock, but carries NO chat-driver hook / backend literal of its own → NOT flagged
    expect(
      isFloatingPaigeOverlay(
        `import { PaigeWorkspace } from "@/solo/PaigeWorkspace";\n` +
          `document.body.style.overflow = "hidden";\n` +
          `createPortal(<PaigeWorkspace/>, paigePortalHost);`,
      ),
    ).toBe(false);
    // (iv) a plain drawer portaled to document.body with no Paige backend → NOT flagged
    expect(isFloatingPaigeOverlay(`createPortal(<Drawer/>, document.body);`)).toBe(false);
    // (v) the dedicated in-route chat (uses a chat hook) but is NOT a global overlay → NOT flagged
    expect(
      isFloatingPaigeOverlay(`import { useClientChatContext } from "@/hooks/useClientChatContext"; export const PaigeChat = () => <div/>;`),
    ).toBe(false);
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
