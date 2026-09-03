import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloSetupView } from "./settings-setup";
import { allowAccountSwitch } from "@/lib/auth/accountSwitchGuard";

const state = vi.hoisted(() => ({
  save: vi.fn(),
  dismissProposal: vi.fn(),
  accessScope: "owner_full" as "owner_full" | "admin_operational" | "read_only",
  saving: false,
  pendingProposal: null as null | { id: string; reason: string; proposedAt: string; patch: Record<string, string> },
  businessOwners: [] as Array<Record<string, unknown>>,
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
    saving: state.saving,
    accessScope: state.accessScope,
    canEdit: state.accessScope !== "read_only",
    canEditLegal: state.accessScope === "owner_full",
    activeTenantId: "tenant-a",
    resolvedTenantId: "tenant-a",
    brief: state.brief,
    businessOwners: state.businessOwners,
    representatives: [
      { id: "owner-1", name: "Antonio Cook", role: "Owner", email: "owner@example.com", status: "Active", isOwner: true },
      { id: "exec-2", name: "Avery Brooks", role: "Admin", email: "avery@example.com", status: "Active", isOwner: false },
    ],
    representativesLoading: false,
    representativesError: null,
    managedSendingEmail: "first-sterling@paigeagent.ai",
    primaryBusinessEmail: "owner@example.com",
    pendingProposal: state.pendingProposal,
    save: state.save,
    dismissProposal: state.dismissProposal,
    refresh: vi.fn(),
  }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Solo Setup owner flow", () => {
  beforeEach(() => {
    state.save.mockReset().mockResolvedValue({ ok: true, kind: "saved", brief: state.brief, businessOwners: [] });
    state.dismissProposal.mockReset().mockResolvedValue({ ok: true });
    state.accessScope = "owner_full";
    state.saving = false;
    state.pendingProposal = null;
    state.businessOwners = [];
    state.brief.legalName = "";
    delete (state.brief.provenance as Record<string, unknown>).brandVoice;
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
    }), [], null);

    await act(async () => button("Edit brief").click());
    await act(async () => button("Cancel").click());
    expect(host.querySelector('input[name="publicName"]')).toBeNull();

    await act(async () => root.unmount());
  });

  it("renders carrier-safe legal identity controls", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));

    expect(host.textContent).toContain("The legal sender carriers will verify");
    expect(host.textContent).toContain("Full registration numbers are sealed");
    await act(async () => {
      Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief")?.click();
    });

    expect(host.querySelector<HTMLInputElement>('#setup-businessRegistrationNumber')?.type).toBe("password");
    expect(host.querySelectorAll('#setup-entityType option')).toHaveLength(9);
    expect(host.querySelectorAll('#setup-businessRegistrationIdentifier option')).toHaveLength(11);
    expect(host.querySelectorAll('#setup-authorizedRepresentativeJobPosition option')).toHaveLength(8);
    expect(host.querySelector('#setup-authorized-representative')).toBeTruthy();

    await act(async () => root.unmount());
  });

  it("shows field validation before an existing legal sender name can be cleared", async () => {
    state.brief.legalName = "First Sterling Capital LLC";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    const button = (label: string) => Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === label) as HTMLButtonElement;
    await act(async () => button("Edit brief").click());
    const legalName = host.querySelector<HTMLInputElement>('input[name="legalName"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(legalName, "");
      legalName.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Save changes").click());
    expect(host.querySelector("#setup-legalName-error")?.textContent).toContain("legal business name");
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it("keeps Admin operational editing separate from Owner-only legal and ownership facts", async () => {
    state.accessScope = "admin_operational";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));

    const edit = Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief") as HTMLButtonElement;
    await act(async () => edit.click());
    expect(host.querySelector('textarea[name="offers"]')).toBeTruthy();
    expect(host.querySelector('input[name="legalName"]')).toBeNull();
    expect(host.textContent).not.toContain("Add business owner");
    expect(host.textContent).toContain("Admin edit is limited");

    await act(async () => root.unmount());
  });

  it("shows Member access as read-only", async () => {
    state.accessScope = "read_only";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    expect((Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief") as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain("read-only for Setup");
    await act(async () => root.unmount());
  });

  it("freezes edits, cancel, and account switching while a durable save is pending", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief")?.click());
    state.saving = true;
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    expect((Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Cancel") as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector('textarea[name="offers"]')).toBeNull();
    await expect(allowAccountSwitch({ fromTenantId: "tenant-a", toTenantId: "tenant-b", toTenantName: "Business B" })).resolves.toBe(false);
    expect(host.textContent).toContain("Wait for this save to finish before switching accounts");
    await act(async () => root.unmount());
  });

  it("keeps a failed draft and exposes explicit retry recovery", async () => {
    state.save.mockResolvedValue({ ok: false, kind: "failed", error: "Durable write failed." });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief")?.click());
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Save changes")?.click());
    expect(host.textContent).toContain("Durable write failed.");
    expect(host.textContent).toContain("Retry save");
    expect(host.querySelector('input[name="publicName"]')).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("does not expose proposal editing to read-only users", async () => {
    state.accessScope = "read_only";
    state.pendingProposal = { id: "proposal-1", reason: "Suggested", proposedAt: "2026-09-01T00:00:00Z", patch: { offers: "Draft" } };
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    expect(host.textContent).not.toContain("Review in draft");
    expect(host.textContent).not.toContain("Dismiss");
    await act(async () => root.unmount());
  });

  it("offers stored-version review instead of a guaranteed conflict retry", async () => {
    state.save.mockResolvedValue({ ok: false, kind: "conflict", error: "Changed in another session." });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief")?.click());
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Save changes")?.click());
    expect(host.textContent).toContain("Load stored version");
    expect(host.textContent).toContain("Review my draft");
    expect(host.textContent).not.toContain("Retry save");
    await act(async () => root.unmount());
  });

  it("restores a connected ownership record when Adopt follows an override edit", async () => {
    state.businessOwners = [{
      id: "owner-record-1", ownerKind: "company", legalName: "Connected Holdings", displayName: "Connected",
      ownershipInterest: "25", effectiveDate: "2026-01-01", status: "active", representativeUserId: "owner-1",
      provenance: { legalName: { source: "connection_sourced", confidence: "observed" } },
    }];
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Edit brief")?.click());
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Override")?.click());
    const legal = host.querySelector<HTMLInputElement>("#setup-owner-legal-0")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(legal, "Changed Holdings");
      legal.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => Array.from(host.querySelectorAll("button")).find((node) => node.textContent?.trim() === "Adopt")?.click());
    expect(host.querySelector<HTMLInputElement>("#setup-owner-legal-0")?.value).toBe("Connected Holdings");
    await act(async () => root.unmount());
  });

  it("keeps Paige Brief inside Setup and returns a guided draft to the durable save flow", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));

    expect(host.querySelector('#paige-brief')).toBeTruthy();
    expect(host.querySelector('a[href="#paige-brief"]')).toBeTruthy();
    const open = Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.includes("Teach Paige")) as HTMLButtonElement;
    expect(open).toBeTruthy();
    await act(async () => open.click());

    const dialog = document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain("Back to Setup");
    expect(dialog?.textContent).toContain("Talk with Paige is proposed");
    expect(dialog?.textContent).toContain("Nothing changes until you save the Setup brief");

    const voice = dialog.querySelector<HTMLTextAreaElement>('textarea[name="brandVoice"]')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(voice, "Clear, candid, and practical");
    await act(async () => voice.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => (Array.from(dialog.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Apply to Setup draft") as HTMLButtonElement).click());

    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>('textarea[name="brandVoice"]')?.value).toBe("Clear, candid, and practical");
    expect(state.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Save changes to make it durable");

    await act(async () => Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Save changes")?.click());
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ brandVoice: "Clear, candid, and practical" }), [], null);
    await act(async () => root.unmount());
  });

  it("keeps the guided Paige Brief unavailable to read-only members", async () => {
    state.accessScope = "read_only";
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    const open = Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.includes("Teach Paige")) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    expect(host.textContent).toContain("Workspace Owner or verified Admin");
    await act(async () => root.unmount());
  });

  it("keeps a connection-sourced voice locked until the owner explicitly overrides it", async () => {
    (state.brief.provenance as Record<string, unknown>).brandVoice = {
      source: "connection_sourced",
      confidence: "observed",
    };
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    const open = Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.includes("Teach Paige")) as HTMLButtonElement;
    await act(async () => open.click());
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]') as HTMLElement;
    expect(dialog.querySelector<HTMLTextAreaElement>('textarea[name="brandVoice"]')?.disabled).toBe(true);
    expect(dialog.textContent).toContain("explicitly choose Override");
    await act(async () => (Array.from(dialog.querySelectorAll("button"))
      .find((node) => node.textContent?.includes("Back to Setup")) as HTMLButtonElement).click());
    await act(async () => Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Edit brief")?.click());
    await act(async () => (Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Override") as HTMLButtonElement).click());
    await act(async () => open.click());
    const reopened = document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]') as HTMLElement;
    const voice = reopened.querySelector<HTMLTextAreaElement>('textarea[name="brandVoice"]')!;
    expect(voice.disabled).toBe(false);
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(voice, "Owner-authorized override voice");
    await act(async () => voice.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => (Array.from(reopened.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Apply to Setup draft") as HTMLButtonElement).click());
    await act(async () => Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Save changes")?.click());
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({
      brandVoice: "Owner-authorized override voice",
      sourceDecisions: { brandVoice: "override" },
    }), [], null);
    await act(async () => root.unmount());
  });

  it("confirms before abandoning a dirty guided brief and preserves it when the owner keeps working", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<MemoryRouter><SoloSetupView account="1971670" /></MemoryRouter>));
    const open = Array.from(host.querySelectorAll("button"))
      .find((node) => node.textContent?.includes("Teach Paige")) as HTMLButtonElement;
    await act(async () => open.click());
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]') as HTMLElement;
    const voice = dialog.querySelector<HTMLTextAreaElement>('textarea[name="brandVoice"]')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(voice, "A voice still in progress");
    await act(async () => voice.dispatchEvent(new Event("input", { bubbles: true })));
    await act(async () => (Array.from(dialog.querySelectorAll("button"))
      .find((node) => node.textContent?.includes("Back to Setup")) as HTMLButtonElement).click());
    expect(document.body.textContent).toContain("Discard this unfinished Paige Brief?");
    await act(async () => (Array.from(document.body.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Keep working") as HTMLButtonElement).click());
    expect(document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]')).toBeTruthy();
    expect(voice.value).toBe("A voice still in progress");

    const handledByNestedModal = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    handledByNestedModal.preventDefault();
    await act(async () => document.dispatchEvent(handledByNestedModal));
    expect(document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]')).toBeTruthy();
    expect(document.body.textContent).not.toContain("Discard this unfinished Paige Brief?");

    let switchPromise!: Promise<boolean>;
    await act(async () => {
      switchPromise = allowAccountSwitch({ fromTenantId: "tenant-a", toTenantId: "tenant-b", toTenantName: "Business B" });
    });
    expect(document.body.textContent).toContain("Discard Setup changes and switch accounts?");
    await act(async () => (Array.from(document.body.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Stay here") as HTMLButtonElement).click());
    await expect(switchPromise).resolves.toBe(false);

    await act(async () => (Array.from(dialog.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Cancel") as HTMLButtonElement).click());
    await act(async () => (Array.from(document.body.querySelectorAll("button"))
      .find((node) => node.textContent?.trim() === "Discard draft") as HTMLButtonElement).click());
    expect(document.body.querySelector('[role="dialog"][aria-label="Teach Paige your business voice"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
