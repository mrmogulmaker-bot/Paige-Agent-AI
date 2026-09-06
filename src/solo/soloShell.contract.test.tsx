import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ONE CANONICAL SOLO SHELL, FOR EVERY SOLO TENANT — the guard that did not exist.
 *
 * The owner's Solo contract (`docs/doctrine/solo-shell-contract.md`) is enforced in
 * several places already, and this file deliberately does NOT restate them:
 *
 *   · form-fitting vs visible-scroll policy → `settings.scroll-policy.test.tsx`
 *     over `solo-tokens.css`'s blanket clip and its one scoped exception
 *   · rendered geometry at the four viewports → `solo-locked-surfaces-drive.mjs`
 *     and `settings-scroll-drive.mjs`
 *   · shell ownership of PAIGE, brand home and Settings focus →
 *     `TenantCommandCenterShell.ownership.test.tsx`
 *
 * What NOTHING guarded is the rule underneath all of them: that the shell is the
 * SAME shell for every tenant. Tenant identity may address a Solo account — it is
 * in the URL and on the brand-home link — but it must never reach a layout,
 * routing-shape, or interaction decision. That distinction is invisible in review:
 * an `account_number` in a `navigate()` and an `account_number` in a style ternary
 * read almost identically in a diff, and only the second forks the product.
 *
 * SOURCE-CONTRACT ASSERTIONS. These decide from the text whether tenant identity
 * can reach layout. They do not prove rendered geometry — that is the drives above,
 * and neither substitutes for the other. Neither is authenticated production proof.
 */
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
/** Comments quote the very identifiers under test, so they are stripped first. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SHELLS = [
  "src/solo/SoloApp.tsx",
  "src/components/tenant-shell/TenantCommandCenterShell.tsx",
] as const;

describe("the canonical Solo shell is one shell for every tenant", () => {
  it("hosts exactly one Solo screen host, and only the canonical shell defines it", () => {
    const appHosts = [...code(read("src/solo/SoloApp.tsx")).matchAll(/data-solo-screen-host/g)];
    expect(appHosts.length, "SoloApp declares the screen host exactly once").toBe(1);

    // Any OTHER component rendering the host would be a second page host — the
    // thing the contract forbids. Selectors and assertions that merely REFERENCE
    // it are fine, so this looks for the JSX attribute form specifically.
    const others = filesRenderingSoloHost().filter((f) => f !== "src/solo/SoloApp.tsx");
    expect(others, "only SoloApp renders [data-solo-screen-host]").toEqual([]);
  });

  it("never lets tenant identity reach a layout or interaction decision", () => {
    // The address/authority split, made mechanical. `account_number` is an ADDRESS:
    // it belongs in navigation and link construction. The moment it appears on a
    // line that also decides presentation, the shell has forked per tenant.
    const LAYOUT = /\b(style|className|classList|overflow|display|width|height|flex|grid|hidden|visib)/;
    for (const rel of SHELLS) {
      for (const line of code(read(rel)).split("\n")) {
        if (!/account_number|accountNumber/.test(line)) continue;
        expect(LAYOUT.test(line), `${rel}: tenant address must not decide layout — ${line.trim()}`).toBe(false);
      }
    }
  });

  it("carries no hardcoded tenant identity at all", () => {
    // A UUID, a numeric account compared as an account, or a tenant NAME compared
    // as a string are the three shapes a "just this one account" patch takes.
    for (const rel of SHELLS) {
      const src = code(read(rel));
      expect(src, `${rel}: no tenant UUID literal`).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(src, `${rel}: no account-number equality branch`).not.toMatch(/account_?[Nn]umber\s*===\s*['"`0-9]/);
      expect(src, `${rel}: no tenant-name equality branch`).not.toMatch(/(accountName|tenantName|\.name)\s*===\s*['"`]/);
    }
  });

  it("declares the full-bleed route policy in exactly one place", () => {
    // Two copies drift, and the copy that loses is the one nobody reads. The
    // policy's ENFORCEMENT is the CSS clip (see settings.scroll-policy.test.tsx);
    // this only holds the declaration single.
    const app = code(read("src/solo/SoloApp.tsx"));
    const decls = [...app.matchAll(/const\s+full\s*=/g)];
    expect(decls.length, "one full-bleed declaration").toBe(1);
  });

  it("keeps the shared Solo workspace stretched after client-side login navigation", () => {
    // Direct refresh always creates the wrapper inside its final shell geometry. A
    // client-side auth/account-selection handoff does not get that second layout
    // pass, so the shared frame must own its inline size instead of depending on
    // the previous route's intrinsic alignment. Without this floor, each screen
    // can collapse to a different content width while the outer shell stays full.
    const app = code(read("src/solo/SoloApp.tsx"));
    const frame = app.match(/<div className="paige-solo"[^>]*style=\{\{([^}]*)\}\}/)?.[1] ?? "";

    expect(frame, "the canonical Solo frame owns the full shell width").toMatch(/width\s*:\s*['"]100%['"]/);
    expect(frame, "the canonical Solo frame stretches in its shell parent").toMatch(/alignSelf\s*:\s*['"]stretch['"]/);
    expect(frame, "the canonical Solo frame may shrink internally without shrinking itself").toMatch(/minWidth\s*:\s*0/);
  });
});

/** Repo-wide JSX scan kept in-process so the contract runs on every CI image. */
function filesRenderingSoloHost(): string[] {
  const matches: string[] = [];
  const visit = (rel: string): void => {
    for (const entry of readdirSync(resolve(process.cwd(), rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(child);
        continue;
      }
      if (!entry.isFile() || !child.endsWith(".tsx") || child.endsWith(".test.tsx")) continue;
      if (/data-solo-screen-host(?:\s[^=]|\s*>|>)/.test(read(child))) matches.push(child);
    }
  };
  visit("src");
  return matches;
}
