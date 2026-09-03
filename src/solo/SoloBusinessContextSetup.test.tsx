import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  registrationAvailable: false,
  checkEmail: vi.fn(),
  registerEmail: vi.fn(),
  searchNaics: vi.fn(),
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
      registrationAvailable: state.registrationAvailable,
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
    checkManagedEmail: state.checkEmail,
    registerManagedEmail: state.registerEmail,
    searchNaics: state.searchNaics,
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    document.body.innerHTML = "";
    state.accessScope = "owner_full";
    state.saving = false;
    state.activeTenantId = "tenant-a";
    state.save.mockReset().mockResolvedValue({ ok: true, kind: "saved" });
    state.refresh.mockReset();
    state.searchNaics
      .mockReset()
      .mockResolvedValue([{ code: "541611", title: "Management consulting" }]);
    state.confirm.mockReset().mockResolvedValue(true);
    state.registrationAvailable = false;
    state.checkEmail.mockReset().mockImplementation(async (local: string) => ({
      available: true,
      address: `${local}@mail.paigeagent.ai`,
    }));
    state.registerEmail
      .mockReset()
      .mockImplementation(async (local: string) => ({
        registered: true,
        registrationAvailable: true,
        available: true,
        localPart: local,
        domain: "mail.paigeagent.ai",
        address: `${local}@mail.paigeagent.ai`,
      }));
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
    expect(host.textContent).toContain("Business address");
    expect(host.textContent).not.toContain("people can actually edit");
    await act(async () => root.unmount());
  });

  it("selects a NAICS search result from read mode into a saveable draft", async () => {
    const { host, root } = await mount();
    await setValue(host.querySelector(".setup-search input")!, "management");
    await act(async () => button(host, "Search").click());
    const result = host.querySelector<HTMLButtonElement>(
      ".setup-result-list button",
    )!;
    expect(result.disabled).toBe(false);
    await act(async () => result.click());
    expect(
      host.querySelector<HTMLInputElement>('[name="naicsCode"]')?.value,
    ).toBe("541611");
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ naicsCode: "541611" }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("lets an owner start adding knowledge without finding the global edit button", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Knowledge bucket").click());
    expect(button(host, "Add knowledge")).toBeTruthy();
    await act(async () => button(host, "Add knowledge").click());
    expect(
      document.querySelector(
        '[role="dialog"][aria-label="Add business knowledge"]',
      ),
    ).toBeTruthy();
    expect(button(host, "Save business context")).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("captures browser-populated address values at save even without an input event", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    const input = host.querySelector<HTMLInputElement>(
      '[name="registeredCity"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Indianapolis");
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ registeredCity: "Indianapolis" }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("offers country and US state dropdowns without rewriting stored facts", async () => {
    state.brief = cleanSoloSetupBrief({
      ...state.brief,
      registeredIsoCountry: "US",
      registeredRegion: "IN",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    const country = host.querySelector<HTMLSelectElement>(
      'select[name="registeredIsoCountry"]',
    );
    const region = host.querySelector<HTMLSelectElement>(
      'select[name="registeredRegion"]',
    );
    expect(country?.value).toBe("US");
    expect(region?.value).toBe("IN");
    expect(region?.textContent).toContain("Indiana");
    expect(country?.querySelector('option[value=""]')).toBeTruthy();
    expect(region?.querySelector('option[value=""]')).toBeTruthy();
    await act(async () => root.unmount());
  });

  it.each(["click", "keyboard"])(
    "preserves several DOM-only autofilled fields and authorized email across %s tab navigation",
    async (navigation) => {
      const { host, root } = await mount();
      await act(async () => button(host, "Edit business context").click());
      await act(async () => button(host, "Override email").click());
      for (const [name, value] of Object.entries({
        registeredCity: "Indianapolis",
        registeredStreet: "100 Test Street",
        primaryBusinessEmail: "new@example.com",
      })) {
        const control = host.querySelector<HTMLInputElement>(
          `input[name="${name}"]`,
        )!;
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(control, value);
      }
      await act(async () => {
        if (navigation === "click") button(host, "Direction").click();
        else
          button(host, "Business profile").dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
          );
      });
      await act(async () => button(host, "Save business context").click());
      expect(state.save).toHaveBeenCalledWith(
        expect.objectContaining({
          brief: expect.objectContaining({
            registeredCity: "Indianapolis",
            registeredStreet: "100 Test Street",
          }),
          primaryBusinessEmail: "new@example.com",
          primaryBusinessEmailDecision: "override",
        }),
      );
      await act(async () => root.unmount());
    },
  );

  it.each(["admin_operational", "read_only"] as const)(
    "does not grant NAICS selection or Knowledge editing to %s",
    async (scope) => {
      state.accessScope = scope;
      const { host, root } = await mount();
      await setValue(host.querySelector(".setup-search input")!, "management");
      await act(async () => button(host, "Search").click());
      expect(
        host.querySelector<HTMLButtonElement>(".setup-result-list button")!
          .disabled,
      ).toBe(true);
      await act(async () => button(host, "Knowledge bucket").click());
      expect(button(host, "Add knowledge")).toBeUndefined();
      expect(state.save).not.toHaveBeenCalled();
      await act(async () => root.unmount());
    },
  );

  it("preserves browser-filled siblings when NAICS search rerenders the profile", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    const city = host.querySelector<HTMLInputElement>(
      '[name="registeredCity"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(city, "Autofilled city");
    await setValue(host.querySelector(".setup-search input")!, "management");
    expect(city.value).toBe("Autofilled city");
    await act(async () => button(host, "Search").click());
    expect(city.value).toBe("Autofilled city");
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ registeredCity: "Autofilled city" }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("asks before discarding DOM-only autofill and retains it when cancelled", async () => {
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    const city = host.querySelector<HTMLInputElement>(
      '[name="registeredCity"]',
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(city, "Autofilled city");
    state.confirm.mockResolvedValueOnce(false);
    await act(async () => button(host, "Cancel").click());
    expect(state.confirm).toHaveBeenCalled();
    expect(city.value).toBe("Autofilled city");
    expect(button(host, "Save business context")).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("searches while typing and ignores an older NAICS response", async () => {
    vi.useFakeTimers();
    let finishOld!: (value: Array<{ code: string; title: string }>) => void;
    state.searchNaics.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { host, root } = await mount();
    const input = host.querySelector<HTMLInputElement>(".setup-search input")!;
    await setValue(input, "old activity");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(state.searchNaics).toHaveBeenLastCalledWith("old activity");
    await setValue(input, "management");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(host.textContent).toContain("Management consulting");
    await act(async () =>
      finishOld([{ code: "999999", title: "Stale activity" }]),
    );
    expect(host.textContent).not.toContain("Stale activity");
    await setValue(input, "");
    expect(host.querySelector(".setup-result-list button")).toBeNull();
    await act(async () => root.unmount());
  });

  it("requires explicit approval before selecting a connected NAICS replacement", async () => {
    state.brief = cleanSoloSetupBrief({
      ...state.brief,
      naicsCode: "111111",
      provenance: {
        naicsCode: { source: "connection_sourced", confidence: "confirmed" },
      },
    });
    const { host, root } = await mount();
    await setValue(host.querySelector(".setup-search input")!, "management");
    await act(async () => button(host, "Search").click());
    state.confirm.mockResolvedValueOnce(false);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(".setup-result-list button")!
        .click(),
    );
    expect(button(host, "Edit business context")).toBeTruthy();
    expect(state.save).not.toHaveBeenCalled();
    state.confirm.mockResolvedValueOnce(true);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(".setup-result-list button")!
        .click(),
    );
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ naicsCode: "541611" }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("does not adopt protected autofilled facts without an explicit source decision", async () => {
    state.brief = cleanSoloSetupBrief({
      ...state.brief,
      registeredCity: "Connected city",
      provenance: {
        registeredCity: {
          source: "connection_sourced",
          confidence: "confirmed",
        },
      },
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    const city = host.querySelector<HTMLInputElement>(
      '[name="registeredCity"]',
    )!;
    expect(city.disabled).toBe(true);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(city, "Injected autofill");
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ registeredCity: "Connected city" }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("finds a ZIP suggestion, applies it to the draft and sends it through save", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          "post code": "46208",
          "country abbreviation": "US",
          places: [
            { "place name": "Indianapolis", "state abbreviation": "IN" },
          ],
        }),
      }),
    );
    state.brief = cleanSoloSetupBrief({
      ...state.brief,
      registeredIsoCountry: "US",
      registeredPostalCode: "46208",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => button(host, "Use Indianapolis, IN").click());
    expect(
      host.querySelector<HTMLInputElement>('[name="registeredCity"]')!.value,
    ).toBe("Indianapolis");
    expect(
      host.querySelector<HTMLSelectElement>('[name="registeredRegion"]')!.value,
    ).toBe("IN");
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({
          registeredCity: "Indianapolis",
          registeredRegion: "IN",
        }),
      }),
    );
    await act(async () => root.unmount());
  });

  it("ignores a ZIP lookup after switching the country", async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    state.brief = cleanSoloSetupBrief({
      ...state.brief,
      registeredIsoCountry: "US",
      registeredPostalCode: "46208",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    const country = host.querySelector<HTMLSelectElement>(
      '[name="registeredIsoCountry"]',
    )!;
    await act(async () => {
      country.value = "CA";
      country.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () =>
      finish({
        ok: true,
        status: 200,
        json: async () => ({
          "post code": "46208",
          "country abbreviation": "US",
          places: [
            { "place name": "Indianapolis", "state abbreviation": "IN" },
          ],
        }),
      }),
    );
    expect(button(host, "Use Indianapolis, IN")).toBeUndefined();
    expect(
      host.querySelector<HTMLInputElement>('[name="registeredCity"]')!.value,
    ).toBe("");
    expect(host.querySelector('input[name="registeredRegion"]')).toBeTruthy();
    await act(async () => root.unmount());
  });

  it("keeps a new knowledge link through save failure and retry without duplicate records", async () => {
    state.save.mockResolvedValueOnce({
      ok: false,
      kind: "failed",
      error: "Could not save",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "Knowledge bucket").click());
    await act(async () => button(host, "Add knowledge").click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const inputs = dialog.querySelectorAll<HTMLInputElement>("input");
    await setValue(inputs[0], "Company website");
    await setValue(inputs[1], "https://example.com/company");
    await act(async () => button(dialog, "Keep in Setup draft").click());
    expect(
      host.querySelector<HTMLAnchorElement>(
        'a[href="https://example.com/company"]',
      )?.rel,
    ).toContain("noopener");
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => button(host, "Save business context").click());
    expect(host.textContent).toContain("Could not save");
    expect(button(host, "Save business context")).toBeTruthy();
    await act(async () => button(host, "Save business context").click());
    expect(state.save).toHaveBeenCalledTimes(2);
    for (const [payload] of state.save.mock.calls) {
      expect(payload.knowledgeSources).toHaveLength(1);
      expect(payload.knowledgeSources[0]).toMatchObject({
        title: "Company website",
        sourceUrl: "https://example.com/company",
      });
    }
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
  it("requires a fresh availability result for the exact edited managed-email name", async () => {
    state.registrationAvailable = true;
    const { host, root } = await mount();
    await act(async () => button(host, "People & email").click());
    await act(async () => button(host, "Check or change address").click());
    const input = document.body.querySelector<HTMLInputElement>(
      ".setup-email-composer input",
    )!;
    await setValue(input, "first-name");
    expect(button(document.body, "Register address").disabled).toBe(true);
    await act(async () => button(document.body, "Check availability").click());
    expect(state.checkEmail).toHaveBeenLastCalledWith("first-name");
    expect(button(document.body, "Register address").disabled).toBe(false);
    await setValue(input, "second-name");
    expect(button(document.body, "Register address").disabled).toBe(true);
    state.checkEmail.mockResolvedValueOnce({
      available: false,
      address: "second-name@mail.paigeagent.ai",
    });
    await act(async () => button(document.body, "Check availability").click());
    expect(button(document.body, "Register address").disabled).toBe(true);
    expect(state.registerEmail).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
  it("does not accept availability for a different returned address", async () => {
    state.registrationAvailable = true;
    state.checkEmail.mockResolvedValueOnce({
      available: true,
      address: "different-name@mail.paigeagent.ai",
    });
    const { host, root } = await mount();
    await act(async () => button(host, "People & email").click());
    await act(async () => button(host, "Check or change address").click());
    await setValue(
      document.body.querySelector<HTMLInputElement>(
        ".setup-email-composer input",
      )!,
      "requested-name",
    );
    await act(async () => button(document.body, "Check availability").click());
    expect(button(document.body, "Register address").disabled).toBe(true);
    await act(async () => root.unmount());
  });
  it("keeps a dirty brief intact across managed-email failure and successful retry", async () => {
    state.registrationAvailable = true;
    state.registerEmail.mockRejectedValueOnce(
      new Error("Couldn't register this address."),
    );
    const { host, root } = await mount();
    await act(async () => button(host, "Edit business context").click());
    await setValue(
      host.querySelector<HTMLInputElement>('input[name="publicName"]')!,
      "Unsaved business name",
    );
    await act(async () => button(host, "People & email").click());
    await act(async () => button(host, "Check or change address").click());
    await setValue(
      document.body.querySelector<HTMLInputElement>(
        ".setup-email-composer input",
      )!,
      "new-business",
    );
    await act(async () => button(document.body, "Check availability").click());
    await act(async () => button(document.body, "Register address").click());
    expect(document.body.textContent).toContain(
      "Couldn't register this address.",
    );
    expect(document.body.textContent).not.toContain(
      "is registered to this workspace",
    );
    await act(async () => button(document.body, "Check availability").click());
    await act(async () => button(document.body, "Register address").click());
    expect(state.registerEmail).toHaveBeenLastCalledWith("new-business");
    expect(document.body.textContent).toContain(
      "new-business@mail.paigeagent.ai is registered",
    );
    await act(async () => button(document.body, "← Back to Setup").click());
    await act(async () => button(host, "Business profile").click());
    expect(
      host.querySelector<HTMLInputElement>('input[name="publicName"]')!.value,
    ).toBe("Unsaved business name");
    expect(state.save).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
  it("freezes managed-email input and prevents drawer close during registration", async () => {
    state.registrationAvailable = true;
    let finish!: (value: unknown) => void;
    state.registerEmail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { host, root } = await mount();
    await act(async () => button(host, "People & email").click());
    await act(async () => button(host, "Check or change address").click());
    const input = document.body.querySelector<HTMLInputElement>(
      ".setup-email-composer input",
    )!;
    await setValue(input, "pending-name");
    await act(async () => button(document.body, "Check availability").click());
    await act(async () => button(document.body, "Register address").click());
    expect(input.disabled).toBe(true);
    expect(button(document.body, "Register address").disabled).toBe(true);
    await act(async () => button(document.body, "← Back to Setup").click());
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
    await act(async () =>
      finish({
        registered: true,
        registrationAvailable: true,
        available: true,
        address: "pending-name@mail.paigeagent.ai",
        localPart: "pending-name",
        domain: "mail.paigeagent.ai",
      }),
    );
    expect(state.registerEmail).toHaveBeenCalledOnce();
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
