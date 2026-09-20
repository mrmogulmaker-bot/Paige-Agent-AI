// @vitest-environment jsdom
/**
 * PR #1277 exact-head correction — the readiness reminder's LAYOUT contract.
 *
 * FINDING 1 (Codex P2): the reminder originally rendered as a SIBLING of the
 * canonical Solo shell, which owns height:100dvh — banner + 100dvh expanded
 * the document past the shell's viewport. This suite pins the corrected
 * integration:
 *
 *   • the access gate's solo branch renders children ONLY — no sibling DOM of
 *     any kind (the load-bearing regression: rendering a reminder as a gate
 *     sibling again FAILS these proofs);
 *   • the reminder lives INSIDE SoloApp's height-owned paige-solo column
 *     (flex:none row; the content wrapper below it is flex:1/minHeight:0), so
 *     the canonical shell stays the ONE viewport owner and main.tcs-main the
 *     ONE scroll owner;
 *   • the reminder's own behavior: truthful copy + keyboard-reachable Setup
 *     link and Dismiss, dismissal hides it, complete/missing state renders
 *     nothing.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const gateSrc = read("src/components/auth/RequireSetupComplete.tsx");
const soloAppSrc = read("src/solo/SoloApp.tsx");

const { SoloSetupReadinessNotice } = await import("../solo/SoloSetupReadinessNotice");
const { isSoloSetupComplete } = await import("@/components/auth/RequireSetupComplete");

let host: HTMLDivElement;
let root: Root | null = null;
const mount = async (props: { visible?: boolean; setupHref: string | null; dismissed?: boolean; onDismiss?: () => void }) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(SoloSetupReadinessNotice, {
          visible: props.visible ?? true,
          setupHref: props.setupHref,
          dismissed: props.dismissed ?? false,
          onDismiss: props.onDismiss ?? (() => {}),
        }),
      ),
    );
  });
};
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  vi.clearAllMocks();
});

describe("load-bearing: the access gate never renders reminder siblings (Finding 1 regression)", () => {
  it("the gate's solo branch returns children ONLY — no JSX element, banner, link, or wrapper besides children", () => {
    const start = gateSrc.indexOf('if (tierKey === "solo")');
    const end = gateSrc.indexOf("// ── SUB-ACCOUNT");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const soloBranch = gateSrc.slice(start, end);
    // The branch contains exactly one return, of the children, and nothing
    // else renderable. A reintroduced sibling (banner/div/link) trips this.
    expect(soloBranch).toContain("return <>{children}</>;");
    expect(soloBranch).not.toMatch(/<(div|span|button|Link|aside|section)[\s>]/);
    expect(soloBranch).not.toContain("setup-readiness");
    expect(soloBranch).not.toContain("useState");
  });

  it("the gate file no longer imports Link or useState (no sibling machinery at all)", () => {
    expect(gateSrc).not.toMatch(/import\s+.*\bLink\b.*from "react-router-dom"/);
    expect(gateSrc).not.toContain("useState");
  });

  it("solo routing invariants survive the layout correction (source): the redirect stays sub_account-only", () => {
    expect(gateSrc).toContain('const gatedTier = tierKey === "sub_account";');
  });
});

describe("one viewport owner: the reminder renders inside SoloApp's height-owned subtree", () => {
  it("SoloApp renders the notice INSIDE the paige-solo column, above the flexed content wrapper", () => {
    const noticeAt = soloAppSrc.indexOf("<SoloSetupReadinessNotice");
    const columnAt = soloAppSrc.indexOf('className="paige-solo"');
    const wrapperAt = soloAppSrc.indexOf('display:\'flex\',flex:1,minHeight:0,overflow:\'hidden\'');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(columnAt).toBeGreaterThan(-1);
    // Notice is inside the paige-solo div, before the content wrapper.
    expect(noticeAt).toBeGreaterThan(columnAt);
    expect(wrapperAt).toBeGreaterThan(noticeAt);
  });

  it("the paige-solo root is a COLUMN layout with fixed height, and the content wrapper is flex:1/minHeight:0 — the reminder cannot expand the document", () => {
    expect(soloAppSrc).toContain("height:'100%'");
    expect(soloAppSrc).toContain("display:'flex',flexDirection:'column'");
    expect(soloAppSrc).toContain("display:'flex',flex:1,minHeight:0,overflow:'hidden'");
  });

  it("the notice itself is flex:none (a row inside the column, never a scroll owner)", () => {
    const noticeSrc = read("src/solo/SoloSetupReadinessNotice.tsx");
    expect(noticeSrc).toContain('flex: "none"');
    expect(noticeSrc).not.toContain("100vh");
    expect(noticeSrc).not.toContain("100dvh");
    expect(noticeSrc).not.toContain("position: \"fixed\"");
    // It reuses the shell's existing token vocabulary, not a new system.
    expect(noticeSrc).toContain("var(--line)");
    expect(noticeSrc).toContain("var(--surface)");
  });

  it("the shell (not the gate) owns dismissal, so it survives route remounts", () => {
    expect(soloAppSrc).toContain("const [setupReminderDismissed, setSetupReminderDismissed] = React.useState(false);");
  });

  it("Codex ea0e7a8b P2 regression: the reminder predicate carries the STAFF guard — an operator acting inside an incomplete standalone tenant gets no owner setup guidance", () => {
    // The guard lives on the visibility derivation, so the notice is
    // suppressed entirely for staff act-as sessions.
    const guardRegex = /!isPlatformStaff\s*&&\s*activeTenant\?\.account_number != null/;
    expect(guardRegex.test(soloAppSrc)).toBe(true);
    expect(soloAppSrc).toContain(
      "const { activeTenant, activeTenantId, activeUserId, isPlatformStaff } = useTenantContext();",
    );
    // Sabotage-sensitivity: stripping the guard from the predicate makes the
    // pin fail (proven on the mutated text, not by asserting the negation).
    const guardless = soloAppSrc.replace(/!isPlatformStaff\s*&&\s*/, "");
    expect(guardRegex.test(guardless)).toBe(false);
  });

  it("Codex 1c401d1b P2 regression: the deep link exists ONLY for callers who can edit Setup (the server-derived tenant owner) — read-only members get the notice with NO CTA", () => {
    // Visibility and link are SEPARATE: the notice is everyone's truthful
    // readiness news; the CTA must never lead to a surface the user cannot
    // change (solo_setup_access_scope maps non-owners/admins to read_only).
    expect(soloAppSrc).toContain("const showSetupReminder =");
    expect(soloAppSrc).toMatch(/canFinishSetup = isPrimaryOwner \|\| isMembershipOwner/);
    expect(soloAppSrc).toMatch(/soloSetupHref = showSetupReminder && canFinishSetup/);
    // The notice component renders the link ONLY on a non-null href, and
    // role-appropriate copy otherwise (no dead-end CTA).
    const noticeSrc = read("src/solo/SoloSetupReadinessNotice.tsx");
    expect(noticeSrc).toMatch(/setupHref != null \? \(\s*<Link/);
    expect(noticeSrc).toContain("an owner completes it from Settings");
    // Sabotage-sensitivity: unlinking the gate (link for everyone) fails the pin.
    const ungated = soloAppSrc.replace("showSetupReminder && canFinishSetup", "showSetupReminder");
    expect(/soloSetupHref = showSetupReminder && canFinishSetup/.test(ungated)).toBe(false);
  });

  it("Codex 2c3a2321 P2 regression: membership owners (is_owner / role='owner') are honored, not just the primary owner column", () => {
    // solo_setup_access_scope() grants owner_full to tenants.owner_user_id OR
    // active membership owners; the CTA gate must cover BOTH halves — the
    // primary column from context, and the canonical client-callable
    // has_tenant_role RPC (authenticated-granted, the §18 one home) for the
    // membership half. The probe runs ONLY while the reminder is visible.
    expect(soloAppSrc).toContain('supabase.rpc("has_tenant_role", {');
    expect(soloAppSrc).toMatch(/_role: "owner"/);
    expect(soloAppSrc).toMatch(/const ownerProbeTenant = showSetupReminder \? activeTenantId : null;/);
    expect(soloAppSrc).toMatch(/canFinishSetup = isPrimaryOwner \|\| isMembershipOwner/);
    // Sabotage-sensitivity: dropping either half breaks the classification pin.
    const membershipDropped = soloAppSrc.replace("isPrimaryOwner || isMembershipOwner", "isPrimaryOwner");
    expect(/isPrimaryOwner \|\| isMembershipOwner/.test(membershipDropped)).toBe(false);
  });
});

describe("the readiness predicate is one shared pure function", () => {
  it("isSoloSetupComplete recognizes the three readiness signals and nothing else", () => {
    expect(isSoloSetupComplete(null)).toBe(false);
    expect(isSoloSetupComplete({})).toBe(false);
    expect(isSoloSetupComplete({ playbook: "" })).toBe(false);
    expect(isSoloSetupComplete({ playbook: "funding" })).toBe(true);
    expect(isSoloSetupComplete({ playbook_config: { slug: "x" } })).toBe(true);
    expect(isSoloSetupComplete({ solo_setup_complete: true })).toBe(true);
    expect(isSoloSetupComplete({ solo_setup_complete: false })).toBe(false);
  });

  it("the gate consumes the same predicate (one home for the signal)", () => {
    expect(gateSrc).toContain("const hasPlaybook = isSoloSetupComplete(activeTenant?.features);");
  });
});

describe("the reminder's behavior (component)", () => {
  it("renders truthful copy with a keyboard-reachable Setup link and Dismiss while incomplete", async () => {
    await mount({ setupHref: "/solo/42/settings/setup" });
    expect(host.textContent).toContain("Setup isn't finished");
    expect(host.textContent).toContain("everything else works");
    const link = host.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("/solo/42/settings/setup");
    const dismiss = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Dismiss setup reminder");
    expect(dismiss).toBeTruthy();
  });

  it("dismissal hides the reminder via the shell-held callback", async () => {
    let dismissed = false;
    await mount({ setupHref: "/solo/42/settings/setup", onDismiss: () => { dismissed = true; } });
    const dismiss = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Dismiss setup reminder")!;
    await act(async () => { dismiss.click(); });
    expect(dismissed).toBe(true);
  });

  it("renders nothing when dismissed or when not visible (complete / staff)", async () => {
    await mount({ visible: true, setupHref: "/solo/42/settings/setup", dismissed: true });
    expect(host.querySelector("[data-setup-readiness]")).toBeNull();
    await mount({ visible: false, setupHref: "/solo/42/settings/setup" });
    expect(host.querySelector("[data-setup-readiness]")).toBeNull();
  });

  it("Codex 1c401d1b P2: a read-only caller sees the truthful notice with NO link — role-appropriate copy, no dead-end CTA", async () => {
    await mount({ visible: true, setupHref: null });
    expect(host.querySelector("[data-setup-readiness]")).toBeTruthy();
    expect(host.textContent).toContain("Setup isn't finished");
    expect(host.querySelector("a")).toBeNull();
    expect(host.textContent).toContain("an owner completes it from Settings");
    const dismiss = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Dismiss setup reminder");
    expect(dismiss).toBeTruthy();
  });
});
