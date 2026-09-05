/**
 * Campaigns › Social — rendered behaviour.
 *
 * EVIDENCE CLASS, stated up front (§32/§70.1). This is a HARNESS drive against an in-memory double,
 * not authenticated runtime proof. It shows that a person can reach the control, change it, submit
 * it, and be told what the server said — and that every state has something to show. It does NOT
 * show that the RPC accepts the payload on production, and must never be reported as if it did.
 *
 * The idiom is the one every other Solo suite uses: raw `createRoot` + `act`, no testing-library,
 * previous root torn down inside `renderAt` so an orphan tree cannot keep answering queries (the
 * failure `sales-ops.contract.test.tsx:82-86` documents).
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  social: {} as Record<string, unknown>,
  pending: {} as Record<string, unknown>,
  trust: {} as Record<string, unknown>,
  saved: [] as Array<Record<string, string>>,
  saveResult: { ok: true, recordedCount: 0 } as Record<string, unknown>,
}));

vi.mock("./useSocialCommand", () => ({ useSocialCommand: () => harness.social }));
vi.mock("./data/useSoloPendingActions", () => ({ useSoloPendingActions: () => harness.pending }));
vi.mock("./data/useSoloTrust", () => ({ useSoloTrust: () => harness.trust }));

const { SocialCommand } = await import("./social-command");

let host: HTMLDivElement;
let root: Root | null = null;

const CAMPAIGNS = { phase: "ready", artifacts: [], submissions: [] };

function renderAt(campaigns: Record<string, unknown> = CAMPAIGNS) {
  // Tear the previous tree down FIRST: an orphan root still answers document queries, so a deleted
  // surface would keep passing a text assertion.
  if (root) act(() => root!.unmount());
  host.remove();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<SocialCommand campaigns={campaigns} onOpenStudio={() => {}} onAskPaige={() => {}} />);
  });
}

const buttonSaying = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  harness.saved = [];
  harness.saveResult = { ok: true, recordedCount: 0 };
  harness.social = {
    tenantId: "tenant-1",
    phase: "ready",
    handles: [],
    canManage: true,
    recordChangedAt: null,
    notPermitted: false,
    retry: () => {},
    recordHandles: async (draft: Record<string, string>) => {
      harness.saved.push(draft);
      return harness.saveResult;
    },
  };
  harness.pending = { items: [], loading: false, error: null, refresh: () => {} };
  harness.trust = { loading: false, configured: true, departments: [], bySlug: {}, error: null };
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host.remove();
  vi.restoreAllMocks();
});

describe("first use — the state a freshly provisioned workspace actually opens on", () => {
  it("says nothing is on record rather than showing zeros", () => {
    renderAt();
    expect(host.textContent).toContain("Nothing is on record yet");
    // Five KPI tiles, and not one of them carrying a number.
    expect(host.querySelectorAll(".social-kpi")).toHaveLength(5);
    expect(host.querySelectorAll(".social-figure--absent").length).toBeGreaterThanOrEqual(5);
    expect(host.textContent).not.toMatch(/\b0\b/);
  });

  it("offers the one thing a person can finish here", () => {
    renderAt();
    expect(buttonSaying("Record accounts")).toBeTruthy();
  });

  it("renders every module, so no part of the surface is missing before data exists", () => {
    renderAt();
    for (const heading of ["Active missions", "PAIGE sees", "Content pipeline", "Channels"]) {
      expect(host.textContent, `${heading} must render`).toContain(heading);
    }
    expect(host.querySelectorAll(".social-stage")).toHaveLength(6);
  });
});

describe("the record flow, driven", () => {
  it("opens the form, accepts a handle, submits it, and reports what the server said", async () => {
    harness.saveResult = { ok: true, recordedCount: 1 };
    renderAt();

    act(() => buttonSaying("Record accounts")!.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog, "the form must open").toBeTruthy();

    const field = [...dialog.querySelectorAll("input")].find(
      (input) => input.previousElementSibling?.textContent === "Instagram",
    ) as HTMLInputElement;
    expect(field).toBeTruthy();

    // React tracks the last value it set, so a bare `.value =` is swallowed on the next change.
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(field, "@acme");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(field.value).toBe("@acme");

    const form = dialog.querySelector("form") as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });

    expect(harness.saved).toEqual([{ instagram: "@acme" }]);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("1 account on record");
  });

  it("clears an account by submitting it empty, and says so in the server's own count", async () => {
    harness.social = { ...harness.social, handles: [{ network: "x", label: "X", handle: "@old" }] };
    harness.saveResult = { ok: true, recordedCount: 0 };
    renderAt();

    act(() => buttonSaying("Update accounts")!.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const field = [...dialog.querySelectorAll("input")].find(
      (input) => input.previousElementSibling?.textContent === "X",
    ) as HTMLInputElement;
    expect(field.value, "the form must open on what is already on record").toBe("@old");

    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(field, "");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      (dialog.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // An omitted network is cleared — the payload carries no empty string for it.
    expect(harness.saved).toEqual([{}]);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("No account is on record");
  });

  it("surfaces a refusal as the server wrote it, and does not claim a save", async () => {
    harness.saveResult = { ok: false, message: "Your permission or workspace changed. Reopen this page with owner or admin access." };
    renderAt();
    act(() => buttonSaying("Record accounts")!.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    await act(async () => {
      (dialog.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const text = document.querySelector('[role="dialog"]')!.textContent ?? "";
    expect(text).toContain("Your permission or workspace changed");
    expect(text).not.toContain("Saved.");
  });

  it("refuses the write to a read-only member, in the form and on the hero", () => {
    harness.social = { ...harness.social, canManage: false };
    renderAt();
    expect(host.textContent).toContain("Read-only access");
    act(() => buttonSaying("Record accounts")!.click());
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("An owner or admin of this workspace can record these");
    for (const input of dialog.querySelectorAll("input")) expect(input.disabled).toBe(true);
    expect((buttonSaying("Save to record") ?? dialog.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("recorded accounts", () => {
  beforeEach(() => {
    harness.social = {
      ...harness.social,
      handles: [
        { network: "instagram", label: "Instagram", handle: "@acme" },
        { network: "linkedin", label: "LinkedIn", handle: "acme-co" },
      ],
      recordChangedAt: "2026-09-04T10:00:00.000Z",
    };
  });

  it("shows each account as a record and gives none of them a metric", () => {
    renderAt();
    expect(host.textContent).toContain("@acme");
    expect(host.textContent).toContain("acme-co");
    expect(host.querySelectorAll(".social-channels li")).toHaveLength(2);
    // Every channel card's metric slot is the absent mark, never a number.
    for (const card of host.querySelectorAll(".social-channel-metric")) {
      expect(card.querySelector(".social-figure--absent"), "a channel must carry no audience figure").toBeTruthy();
    }
  });

  it("states the record's own last-changed time and refuses a per-account one", () => {
    renderAt();
    expect(host.textContent).toMatch(/This workspace record last changed/);
    expect(host.textContent).toContain("no per-account date is shown");
  });
});

describe("what PAIGE has filed", () => {
  it("shows only growth-desk work, with the desk that filed it", () => {
    harness.pending = {
      loading: false, error: null, refresh: () => {},
      items: [
        { id: "a", title: "Draft the launch note", summary: "Ready for your read", department: "marketing", rationale: "Filed for your decision", createdAt: "2026-09-04" },
        { id: "b", title: "Retention policy review", summary: null, department: "legal_compliance", rationale: null, createdAt: "2026-09-04" },
      ],
    };
    renderAt();
    expect(host.textContent).toContain("Draft the launch note");
    expect(host.textContent).not.toContain("Retention policy review");
  });

  it("distinguishes a failed read from nothing waiting", () => {
    harness.pending = { items: [], loading: false, error: "read_failed", refresh: () => {} };
    renderAt();
    expect(host.textContent).toContain("This could not be read");
    expect(host.textContent).not.toContain("Nothing is waiting on you");
  });
});

describe("states", () => {
  it("distinguishes resolving, loading, unresolved and failed, and never blanks", () => {
    for (const [phase, expected] of [
      ["resolving", "Resolving this account"],
      ["unavailable", "Social needs a resolved workspace"],
      ["error", "could not be read"],
    ] as const) {
      harness.social = { ...harness.social, phase };
      renderAt();
      expect(host.textContent, `phase ${phase}`).toContain(expected);
    }
    harness.social = { ...harness.social, phase: "loading" };
    renderAt();
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading Social");
  });

  it("tells a member their access is the reason, not that the business has no accounts", () => {
    harness.social = { ...harness.social, notPermitted: true, canManage: false, handles: [] };
    renderAt();
    expect(host.textContent).toContain("Not shown at your access level");
    expect(host.textContent).not.toContain("No account is on record");
  });
});

describe("Trust Compass is reflected, never re-implemented", () => {
  it("labels the lanes as the platform default and offers no control", () => {
    harness.trust = {
      loading: false, configured: true, error: null, bySlug: {},
      departments: [{ slug: "marketing", name: "Marketing", acts: [{ label: "Draft a campaign", lane: "confirm" }] }],
    };
    renderAt();
    expect(host.textContent).toContain("Drafts for you");
    expect(host.textContent).toContain("the platform default for these desks");
    // No autonomy control may exist here: exactly one lives on this platform, and it is not this.
    expect(host.querySelectorAll('input[type="range"], select')).toHaveLength(0);
    expect(host.textContent).not.toMatch(/your settings|you chose|change autonomy/i);
  });

  it("renders nothing rather than an empty frame when no lane is readable", () => {
    renderAt();
    expect(host.querySelector(".social-governance")).toBeNull();
  });
});

describe("shell contract", () => {
  it("renders no masthead and declares no tab role", () => {
    renderAt();
    expect(host.querySelector(".pg-hd")).toBeNull();
    expect(host.querySelectorAll('[role="tab"], [role="tablist"]')).toHaveLength(0);
  });

  it("keeps the Vibe Studio launcher the replaced panel offered", () => {
    renderAt();
    expect(host.querySelector("[data-solo-vibe-studio-launcher]")).toBeTruthy();
  });
});
