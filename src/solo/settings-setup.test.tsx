import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloSetupView } from "./settings-setup";

const state = vi.hoisted(() => ({
  save: vi.fn(),
  dismissProposal: vi.fn(),
  brief: {
    publicName: "First Sterling Capital",
    legalName: "",
    dbaName: "",
    website: "https://firststerling.example",
    address: "",
    phone: "",
    industry: "Financial services",
    naicsCode: "",
    sicCode: "",
    offers: "",
    deliveryModel: "",
    idealCustomer: "",
    customerSegments: "",
    serviceArea: "",
    currentPriority: "",
    goals90Day: "",
    annualDirection: "",
    successDefinition: "",
    constraints: "",
    brandVoice: "Direct and reassuring",
    operatingPreferences: "",
    doNotAssume: "",
    representativeUserIds: ["owner-1"],
    provenance: {
      publicName: { source: "owner_confirmed" as const, confidence: "confirmed" as const, confirmedAt: "2026-08-31T22:00:00Z" },
    },
  },
}));

vi.mock("./data/useSoloSetupBrief", () => ({
  useSoloSetupBrief: () => ({
    loading: false,
    error: null,
    saving: false,
    canEdit: true,
    brief: state.brief,
    representatives: [
      { id: "owner-1", name: "Antonio Cook", role: "Owner", email: "owner@example.com", status: "Active", isOwner: true },
      { id: "exec-2", name: "Avery Brooks", role: "Admin", email: "avery@example.com", status: "Active", isOwner: false },
    ],
    managedSendingEmail: "first-sterling@paigeagent.ai",
    primaryBusinessEmail: "owner@example.com",
    pendingProposal: null,
    save: state.save,
    dismissProposal: state.dismissProposal,
    refresh: vi.fn(),
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Solo Setup owner flow", () => {
  beforeEach(() => {
    state.save.mockReset().mockResolvedValue({ ok: true });
    state.dismissProposal.mockReset().mockResolvedValue({ ok: true });
    document.body.innerHTML = "";
  });

  it("separates business representatives, Team ownership, and Connections email configuration", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));

    expect(host.textContent).toContain("Business representatives");
    expect(host.textContent).toContain("Antonio Cook");
    expect(host.textContent).toContain("Team owns invitations, access and workspace roles");
    expect(host.textContent).toContain("Connections owns email and provider configuration");
    expect(host.querySelector('a[href="/solo/1971670/settings/connections?segment=communications"]')).toBeTruthy();

    await act(async () => root.unmount());
  });

  it("supports edit, cancel, representative selection, validation, and save", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));

    const button = (label: string) => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === label) as HTMLButtonElement;
    await act(async () => button("Edit brief").click());

    const publicName = host.querySelector<HTMLInputElement>('input[name="publicName"]')!;
    const setInput = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      setInput(publicName, "");
    });
    await act(async () => button("Save changes").click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Fix the highlighted");
    expect(host.querySelector('#setup-publicName-error')?.textContent).toContain("business name");
    expect(state.save).not.toHaveBeenCalled();

    await act(async () => {
      setInput(publicName, "First Sterling Capital Group");
      host.querySelector<HTMLInputElement>('input[value="exec-2"]')!.click();
      button("Save changes").click();
    });
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
      publicName: "First Sterling Capital Group",
      representativeUserIds: ["owner-1", "exec-2"],
    }), null);

    await act(async () => button("Edit brief").click());
    await act(async () => button("Cancel").click());
    expect(host.querySelector('input[name="publicName"]')).toBeNull();

    await act(async () => root.unmount());
  });
});
