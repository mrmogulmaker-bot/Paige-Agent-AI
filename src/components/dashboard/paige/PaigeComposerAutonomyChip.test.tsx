// @vitest-environment jsdom
//
// P1 UI hotfix — the Paige-permissions composer chip reflects REAL authority state honestly (§13) and
// never claims a posture the server does not hold. The honest-label derivation is unit-tested pure
// (no Radix render needed); a render test then locks the trigger's accessible name, the reflected
// label, and that the chip is neutral/violet, never gold (gold is the Send act only). The Radix menu's
// item interactions (the real set_tool_autonomy write on "Ask first", the Trust Compass route) run in
// a real browser — recorded as Proof Owed in the UI evidence record, since jsdom does not carry the
// pointer/layout shims Radix menus need to open reliably.
//
// §39/§5 fold (PR #1008): the standing-grant signal is keyed at the TOOL level (`byTool` effective
// `auto`), NOT the domain aggregate. A domain reads `guardrails` only when EVERY actable tool is
// effective-`auto`, but every domain carries a `high`-risk tool capped at `confirm`, so that aggregate
// is unreachable — a domain-level check would peg the chip to "Ask first" forever and lie about a real
// standing `auto` grant. So these tests drive the derivation through the REAL `deriveGovernance`, not
// an injected shape the runtime can never emit.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveChipView, type ChipGovView } from "./PaigeComposerAutonomyChip";
import { deriveGovernance } from "@/solo/data/useSoloToolGovernance";

const tool = (effective: string) => ({ effective }) as unknown as ChipGovView["byTool"][string];

describe("deriveChipView — the label reflects real state, never an unbacked claim", () => {
  it("loading → 'Checking…', no posture asserted", () => {
    const v = deriveChipView({ loading: true, configured: false, error: null, byTool: {} });
    expect(v.label).toBe("Checking…");
    expect(v.isAskFirst).toBe(false);
    expect(v.hasStandingGrant).toBe(false);
  });

  it("unconfigured with an error → honest 'couldn't load', never a fake posture", () => {
    const v = deriveChipView({ loading: false, configured: false, error: "boom", byTool: {} });
    expect(v.label).toBe("Permissions");
    expect(v.summary).toMatch(/couldn't load/i);
  });

  it("unconfigured with no error → honest 'not set up'", () => {
    const v = deriveChipView({ loading: false, configured: false, error: null, byTool: {} });
    expect(v.label).toBe("Permissions");
    expect(v.summary).toMatch(/not set up/i);
  });

  it("configured with nothing running on auto → 'Ask first' (isAskFirst)", () => {
    const v = deriveChipView({
      loading: false,
      configured: true,
      error: null,
      byTool: { crm_create_contact: tool("confirm"), crm_delete_contact: tool("off") },
    });
    expect(v.label).toBe("Ask first");
    expect(v.isAskFirst).toBe(true);
    expect(v.hasStandingGrant).toBe(false);
  });

  it("configured with a real standing grant (a tool at effective auto) → 'Within policy'", () => {
    const v = deriveChipView({
      loading: false,
      configured: true,
      error: null,
      byTool: { crm_create_contact: tool("auto"), crm_delete_contact: tool("confirm") },
    });
    expect(v.label).toBe("Within policy");
    expect(v.hasStandingGrant).toBe(true);
    expect(v.isAskFirst).toBe(false);
  });
});

// ── Reachability proof against the REAL derivation (guards against the §39 false-green that a
//    domain-level `guardrails` check produced) ────────────────────────────────────────────────────
const row = (tool_key: string, mode: string) => ({
  tool_key,
  label: tool_key,
  category: "",
  mode,
  is_default: mode === "confirm",
});

describe("deriveChipView over deriveGovernance — reachable from real rows, honest for high tools", () => {
  it("an ORDINARY tool stored 'auto' is a real standing grant → 'Within policy' (the state is reachable)", () => {
    const { byTool } = deriveGovernance([row("crm_create_contact", "auto")], {}, true);
    // Sanity: the real derivation produced an effective-auto tool (ordinary tools are not risk-capped).
    expect(byTool.crm_create_contact.effective).toBe("auto");
    const v = deriveChipView({ loading: false, configured: true, error: null, byTool });
    expect(v.label).toBe("Within policy");
    expect(v.hasStandingGrant).toBe(true);
  });

  it("a HIGH-risk tool stored 'auto' is clamped to 'confirm' → still 'Ask first' (no false autonomy claim)", () => {
    const { byTool } = deriveGovernance([row("crm_delete_contact", "auto")], {}, true);
    // The risk cap holds: a high tool can never actually run auto, so it is NOT a standing grant.
    expect(byTool.crm_delete_contact.effective).toBe("confirm");
    const v = deriveChipView({ loading: false, configured: true, error: null, byTool });
    expect(v.label).toBe("Ask first");
    expect(v.hasStandingGrant).toBe(false);
  });
});

// ── Render test: the trigger reflects the label + is a calm neutral control, never gold ──────────
const navigateSpy = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateSpy }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenant: { account_number: 3855 } }),
}));
const govMock = vi.fn();
vi.mock("@/solo/data/useSoloToolGovernance", async () => {
  const actual = await vi.importActual<typeof import("@/solo/data/useSoloToolGovernance")>(
    "@/solo/data/useSoloToolGovernance",
  );
  return { ...actual, useSoloToolGovernance: () => govMock() };
});

import { PaigeComposerAutonomyChip } from "./PaigeComposerAutonomyChip";

const baseGov = {
  loading: false,
  configured: true,
  error: null,
  domains: [],
  byTool: { crm_create_contact: tool("confirm") },
  ceilingLimiting: false,
  ceilingUnconfirmed: false,
  canWrite: true,
  authorityUnconfirmed: false,
  setDomainMode: vi.fn().mockResolvedValue({ ok: true }),
  setToolMode: vi.fn().mockResolvedValue({ ok: true }),
  refresh: vi.fn(),
};

async function mountChip(): Promise<{ host: HTMLElement; unmount: () => void }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<PaigeComposerAutonomyChip accountEpoch="t1" />);
  });
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}
const trigger = (host: HTMLElement) =>
  host.querySelector('button[data-solo-autonomy-chip="true"]') as HTMLButtonElement | null;

describe("PaigeComposerAutonomyChip trigger", () => {
  beforeEach(() => {
    navigateSpy.mockReset();
    govMock.mockReturnValue({ ...baseGov });
  });

  it("renders a button whose accessible name states the current mode", async () => {
    const { host, unmount } = await mountChip();
    const btn = trigger(host);
    expect(btn).toBeTruthy();
    expect(btn!.getAttribute("aria-label")).toMatch(/paige permissions, currently ask first/i);
    expect(btn!.textContent).toMatch(/Ask first/);
    unmount();
  });

  it("reflects 'Within policy' when a real standing grant exists (a tool at effective auto)", async () => {
    govMock.mockReturnValue({ ...baseGov, byTool: { crm_create_contact: tool("auto") } });
    const { host, unmount } = await mountChip();
    expect(trigger(host)!.getAttribute("aria-label")).toMatch(/currently within policy/i);
    unmount();
  });

  it("is a calm neutral/violet control — the trigger never uses the gold act token", async () => {
    const { host, unmount } = await mountChip();
    const btn = trigger(host)!;
    expect(btn.className).not.toMatch(/gold|accent/);
    // neutral border + indigo focus ring (never gold)
    expect(btn.className).toMatch(/border-border/);
    expect(btn.className).toMatch(/ring-ring/);
    unmount();
  });
});
