import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoloBusinessContextSetup } from "./SoloBusinessContextSetup";
import { cleanSoloSetupBrief } from "./settings-setup-contract";
import { EMPTY_PAIGE_PROFILE } from "./settings-business-context-contract";

const state = vi.hoisted(() => ({
  accessScope: "owner_full" as "owner_full" | "admin_operational" | "read_only",
  saving: false,
  activeTenantId: "tenant-a",
  save: vi.fn(),
  refresh: vi.fn(),
  confirm: vi.fn(),
  brief: null as unknown as ReturnType<typeof cleanSoloSetupBrief>,
  businessOwners: [] as never[],
  knowledgeSources: [] as never[],
  voiceExamples: [] as never[],
  paigeProfile: null as unknown as typeof EMPTY_PAIGE_PROFILE,
}));
state.brief = cleanSoloSetupBrief({
  publicName: "Canonical Solo",
  legalName: "Canonical Solo LLC",
  representativeUserIds: ["owner-1"],
});
state.paigeProfile = EMPTY_PAIGE_PROFILE;

vi.mock("./data/useSoloBusinessContext", () => ({
  useSoloBusinessContext: () => ({
    loading: false,
    error: null,
    saving: state.saving,
    accessScope: state.accessScope,
    canEdit: state.accessScope !== "read_only",
    canEditLegal: state.accessScope === "owner_full",
    activeTenantId: state.activeTenantId,
    resolvedTenantId: state.activeTenantId,
    brief: state.brief,
    businessOwners: state.businessOwners,
    primaryBusinessEmail: "owner@example.com",
    knowledgeSources: state.knowledgeSources,
    paigeProfile: state.paigeProfile,
    voiceExamples: state.voiceExamples,
    managedEmail: {
      localPart: "canonical-solo",
      domain: "mail.paigeagent.ai",
      address: "canonical-solo@mail.paigeagent.ai",
      available: null,
    },
    pendingProposal: null,
    representatives: [
      {
        id: "owner-1",
        name: "Owner Person",
        role: "Owner",
        email: "owner@example.com",
        status: "Active",
        isOwner: true,
      },
    ],
    representativesLoading: false,
    representativesError: null,
    save: state.save,
    checkManagedEmail: vi.fn().mockResolvedValue({
      available: true,
      address: "available@mail.paigeagent.ai",
    }),
    registerManagedEmail: vi.fn().mockResolvedValue({}),
    searchNaics: vi.fn().mockResolvedValue([
      {
        code: "541611",
        title:
          "Administrative Management and General Management Consulting Services",
      },
    ]),
    dismissProposal: vi.fn(),
    refresh: state.refresh,
  }),
}));
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => ({ confirm: state.confirm, dialog: null }),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(account = "100") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <SoloBusinessContextSetup account={account} />
      </MemoryRouter>,
    ),
  );
  return { host, root };
}
const button = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === label,
  ) as HTMLButtonElement;
async function setValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  await act(async () =>
    input.dispatchEvent(new Event("input", { bubbles: true })),
  );
}

describe("canonical Solo Setup business context", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    state.accessScope = "owner_full";
    state.saving = false;
    state.activeTenantId = "tenant-a";
    state.save.mockReset().mockResolvedValue({ ok: true, kind: "saved" });
    state.refresh.mockReset();
    state.confirm.mockReset().mockResolvedValue(true);
    state.businessOwners = [];
    state.knowledgeSources = [];
    state.voiceExamples = [];
    state.paigeProfile = EMPTY_PAIGE_PROFILE;
    state.brief = cleanSoloSetupBrief({
      publicName: "Canonical Solo",
      legalName: "Canonical Solo LLC",
      representativeUserIds: ["owner-1"],
    });
  });

  it("renders exactly the approved five accessible subtabs in order", async () => {
    const { host, root } = await mount();
    expect(
      Array.from(host.querySelectorAll('[role="tab"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual([
      "Business profile",
      "People & email",
      "Knowledge bucket",
      "Direction",
      "Paige brief",
    ]);
    expect(host.textContent).toContain(
      "A structured address people can actually edit",
    );
    await act(async () => root.unmount());
  });

  it("uses the same canonical template for unrelated Solo account route values", async () => {
    const first = await mount("111");
    const firstTabs = Array.from(
      first.host.querySelectorAll('[role="tab"]'),
    ).map((node) => node.textContent);
    await act(async () => first.root.unmount());
    const second = await mount("9082725");
    expect(
      Array.from(second.host.querySelectorAll('[role="tab"]')).map(
        (node) => node.textContent,
      ),
    ).toEqual(firstTabs);
    expect(second.host.innerHTML).not.toContain("Antonio Daniel LLC");
    await act(async () => second.root.unmount());
  });

  it("keeps one draft across tabs and writes it through the combined durable save", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    const street = host.querySelector<HTMLInputElement>(
      'input[name="registeredStreet"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(street, "3314 N Kenwood Ave");
    await act(async () =>
      street.dispatchEvent(new Event("input", { bubbles: true })),
    );
    await act(async () => button(host, "Knowledge bucket").click());
    await act(async () => button(host, "Add knowledge").click());
    const dialog = document.body.querySelector(
      '[role="dialog"][aria-label="Add business knowledge"]',
    )!;
    expect(dialog).toBeTruthy();
    await act(async () =>
      button(dialog as HTMLElement, "← Back to Setup").click(),
    );
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({
          registeredStreet: "3314 N Kenwood Ave",
        }),
        knowledgeSources: expect.any(Array),
        paigeProfile: expect.any(Object),
        voiceExamples: expect.any(Array),
      }),
    );
    await act(async () => root.unmount());
  });

  it("exposes the rich Paige profile and labels its live conversation adapter honestly", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Paige brief").click());
    expect(host.textContent).toContain(
      "Teach Paige how this business sounds and works",
    );
    expect(host.textContent).toContain("Audience relationship");
    expect(host.textContent).toContain("Channel differences");
    expect(host.textContent).toContain("Working style & boundaries");
    expect(host.textContent).toContain("Talk with Paige is proposed");
    await act(async () => root.unmount());
  });

  it("preserves legacy fields and representative controls", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    for (const name of ["dbaName", "industry", "sicCode", "regionsOfOperation"])
      expect(host.querySelector(`[name="${name}"]`)).toBeTruthy();
    await act(async () => button(host, "People & email").click());
    for (const name of [
      "authorizedRepresentativePhone",
      "authorizedRepresentativeJobPosition",
      "authorizedRepresentativeUserId",
    ])
      expect(host.querySelector(`[name="${name}"]`)).toBeTruthy();
    await act(async () => root.unmount());
  });
  it("cancels unfinished knowledge without keeping an invalid record", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => button(host, "Knowledge bucket").click());
    await act(async () => button(host, "Add knowledge").click());
    await act(async () => button(document.body, "← Back to Setup").click());
    expect(host.textContent).toContain("No trusted sources yet");
    await act(async () => root.unmount());
  });
  it("loads stored conflict data outside edit mode", async () => {
    state.save.mockResolvedValue({
      ok: false,
      kind: "conflict",
      error: "Changed elsewhere",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => button(host, "Save business context").click());
    await act(async () => button(host, "Load stored version").click());
    expect(state.refresh).toHaveBeenCalledOnce();
    expect(button(host, "Edit business context")).toBeTruthy();
    await act(async () => root.unmount());
  });
  it("removes a dependent authorized representative without trapping the next save", async () => {
    state.brief = cleanSoloSetupBrief({
      ...state.brief,
      authorizedRepresentativeUserId: "owner-1",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => button(host, "People & email").click());
    await act(async () =>
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ authorizedRepresentativeUserId: "" }),
      }),
    );
    await act(async () => root.unmount());
  });
  it("keeps drawer edits isolated until confirmed and restores focus on discard", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => button(host, "Paige brief").click());
    const opener = button(host, "Teach Paige");
    opener.focus();
    await act(async () => opener.click());
    const input = document.body.querySelector<HTMLTextAreaElement>(
      'textarea[name="voiceCharacter"]',
    )!;
    await setValue(input, "Warm and direct");
    state.confirm.mockResolvedValue(false);
    await act(async () => button(document.body, "← Back to Setup").click());
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
    state.confirm.mockResolvedValue(true);
    await act(async () => button(document.body, "← Back to Setup").click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        paigeProfile: expect.objectContaining({ voiceCharacter: "" }),
      }),
    );
    await act(async () => root.unmount());
  });
  it("freezes every tab action while a durable save is pending", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => button(host, "People & email").click());
    state.saving = true;
    await act(async () =>
      root.render(
        <MemoryRouter>
          <SoloBusinessContextSetup account="100" />
        </MemoryRouter>,
      ),
    );
    const guard = host.querySelector<HTMLFieldSetElement>(
      "fieldset.setup-brief",
    )!;
    expect(guard.disabled).toBe(true);
    expect(
      button(host, "Add business owner").closest("fieldset[disabled]"),
    ).toBe(guard);
    expect(
      host
        .querySelector('input[type="checkbox"]')!
        .closest("fieldset[disabled]"),
    ).toBe(guard);
    await act(async () => root.unmount());
  });
  it("shows ownership validation instead of failing without a repair path", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => button(host, "People & email").click());
    await act(async () => button(host, "Add business owner").click());
    await act(async () => button(host, "Save business context").click());
    expect(state.save).not.toHaveBeenCalled();
    expect(host.querySelector('.setup-owner-card [role="alert"]')).toBeTruthy();
    await act(async () => root.unmount());
  });
  it("does not advertise managed-email registration without its lifecycle contract", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "People & email").click());
    expect(button(host, "Check or change address").disabled).toBe(true);
    expect(host.textContent).toContain("Registration unavailable");
    expect(host.textContent).toContain("canonical-solo@mail.paigeagent.ai");
    await act(async () => root.unmount());
  });
  it("enforces read-only controls for a member", async () => {
    state.accessScope = "read_only";
    const { host, root } = await mount();
    expect(button(host, "Edit business context").disabled).toBe(true);
    await act(async () => button(host, "Knowledge bucket").click());
    expect(host.textContent).not.toContain("Add knowledge");
    await act(async () => button(host, "Paige brief").click());
    expect(button(host, "Teach Paige").disabled).toBe(true);
    await act(async () => root.unmount());
  });
});
