// @vitest-environment jsdom
//
// P1 UI hotfix — the Paige-permissions composer chip reflects REAL authority state honestly (§13) and
// never claims a posture the server does not hold. The honest-label derivation is unit-tested pure
// (no Radix render needed); a render test then locks the trigger's accessible name, the reflected
// label, and that the chip is neutral/violet, never gold (gold is the Send act only). The Radix menu's
// item interactions (the real set_tool_autonomy write on "Ask first", the Trust Compass route) run in
// a real browser — recorded as Proof Owed in the UI evidence record, since jsdom does not carry the
// pointer/layout shims Radix menus need to open reliably.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { deriveChipView, type ChipGovView } from "./PaigeComposerAutonomyChip";

const domain = (posture: string) => ({ posture }) as unknown as ChipGovView["domains"][number];

describe("deriveChipView — the label reflects real state, never an unbacked claim", () => {
  it("loading → 'Checking…', no posture asserted", () => {
    const v = deriveChipView({ loading: true, configured: false, error: null, domains: [] });
    expect(v.label).toBe("Checking…");
    expect(v.isAskFirst).toBe(false);
    expect(v.hasStandingGrant).toBe(false);
  });

  it("unconfigured with an error → honest 'couldn't load', never a fake posture", () => {
    const v = deriveChipView({ loading: false, configured: false, error: "boom", domains: [] });
    expect(v.label).toBe("Permissions");
    expect(v.summary).toMatch(/couldn't load/i);
  });

  it("unconfigured with no error → honest 'not set up'", () => {
    const v = deriveChipView({ loading: false, configured: false, error: null, domains: [] });
    expect(v.label).toBe("Permissions");
    expect(v.summary).toMatch(/not set up/i);
  });

  it("configured with nothing on standing auto → 'Ask first' (isAskFirst)", () => {
    const v = deriveChipView({
      loading: false,
      configured: true,
      error: null,
      domains: [domain("asks"), domain("held"), domain("your_call")],
    });
    expect(v.label).toBe("Ask first");
    expect(v.isAskFirst).toBe(true);
    expect(v.hasStandingGrant).toBe(false);
  });

  it("configured with a real standing grant (a domain at guardrails/auto) → 'Within policy'", () => {
    const v = deriveChipView({
      loading: false,
      configured: true,
      error: null,
      domains: [domain("asks"), domain("guardrails")],
    });
    expect(v.label).toBe("Within policy");
    expect(v.hasStandingGrant).toBe(true);
    expect(v.isAskFirst).toBe(false);
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
vi.mock("@/solo/data/useSoloToolGovernance", () => ({
  useSoloToolGovernance: () => govMock(),
}));

import { PaigeComposerAutonomyChip } from "./PaigeComposerAutonomyChip";

const baseGov = {
  loading: false,
  configured: true,
  error: null,
  domains: [{ posture: "asks" }],
  byTool: {},
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

  it("reflects 'Within policy' when a real standing grant exists", async () => {
    govMock.mockReturnValue({ ...baseGov, domains: [{ posture: "guardrails" }] });
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
