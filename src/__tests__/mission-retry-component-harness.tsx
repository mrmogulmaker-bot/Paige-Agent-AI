import React, { act } from "react";
import { afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Test harness for PR-B (mission outcome-unknown truthfulness). Renders the
 * REAL PlanInMotion with a mocked useBusinessGamePlanMissions so the
 * component's request-key lifecycle and outcome rendering can be driven
 * end-to-end without the backend.
 */

const harness = vi.hoisted(() => ({
  mission: {
    items: [] as unknown[],
    status: "ready" as const,
    errorCode: null as string | null,
    refresh: vi.fn(async () => undefined),
    getDetail: vi.fn(async () => { throw new Error("not used"); }),
    mutate: vi.fn(),
  },
}));

vi.mock("../solo/data/useBusinessGamePlanMissions", async () => {
  const actual = await vi.importActual<typeof import("../solo/data/useBusinessGamePlanMissions")>("../solo/data/useBusinessGamePlanMissions");
  return { ...actual, useBusinessGamePlanMissions: () => harness.mission };
});

const { PlanInMotion } = await import("../solo/PlanInMotion");

let host: HTMLDivElement | null = null;
let root: Root | null = null;
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove(); host = null;
  harness.mission.mutate.mockReset();
  harness.mission.refresh.mockClear();
});

const setNativeValue = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

const fieldByLabel = (label: string) => {
  const fields = [...document.querySelectorAll("label.ov-field")];
  const match = fields.find((f) => f.querySelector("span")?.textContent === label);
  if (!match) throw new Error(`field not found: ${label} (have: ${fields.map((f) => f.querySelector("span")?.textContent).join(", ")})`);
  return match.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
};

const clickButton = async (text: string) => {
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!button) throw new Error(`button not found: ${text}`);
  // Click handlers fire async flows (validate → mutate → setState); drain
  // microtasks AND a macrotask turn inside act so post-mutation DOM is
  // settled before the caller asserts.
  await act(async () => {
    button.click();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

export async function renderPlan(workspaceId = "11111111-1111-4111-8111-111111111111") {
  host = document.createElement("div");
  document.body.appendChild(host);
  // Safe default so an unexpected extra mutate call never yields undefined;
  // individual tests override with mockResolvedValueOnce.
  harness.mission.mutate.mockResolvedValue({ ok: false, verified: false, railRecorded: false, outcomeUnknown: false, code: "MISSION_ACTION_FAILED" });
  root = createRoot(host);
  await act(async () => {
    root!.render(React.createElement(PlanInMotion, { workspaceId }));
  });
  return harness;
}

/** Open the create drawer and fill every required field. */
export async function fillCreateForm(overrides: Record<string, string> = {}) {
  await clickButton("Add play");
  const defaults: Record<string, string> = {
    "Title": "Referral engine",
    "Desired outcome": "Three retained clients",
    "Starting point": "Two warm referrals",
    "Approach": "Weekly outreach",
    "Success criteria": "Signed engagements",
    "How Paige may help - not a grant of authority": "Draft, then ask",
    ...overrides,
  };
  for (const [label, value] of Object.entries(defaults)) {
    await act(async () => { setNativeValue(fieldByLabel(label), value); });
  }
}

export async function setCreateField(label: string, value: string) {
  await act(async () => { setNativeValue(fieldByLabel(label), value); });
}

export async function save() {
  await clickButton("Save draft");
}

export async function checkAgain() {
  await clickButton("Check again");
}

export function lastRequestKey(): string | undefined {
  const calls = harness.mission.mutate.mock.calls as Array<[string, Record<string, unknown>]>;
  const last = calls[calls.length - 1];
  return last ? (last[1].request_key as string | undefined) : undefined;
}

export function reconcileBanner(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-mission-reconcile]");
}

export function checkAgainButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("[data-mission-reconcile] button");
}

export function errorText(): string | null {
  return document.querySelector<HTMLElement>(".ov-err:not(.pim-reconcile)")?.textContent ?? null;
}

export const mutateMock = harness.mission.mutate;

/** Everything the tests drive, in one handle. */
export const harnessApi = {
  mutate: harness.mission.mutate,
  renderPlan,
  fillCreateForm,
  setCreateField,
  save,
  checkAgain,
  lastRequestKey,
  reconcileBanner,
  checkAgainButton,
  errorText,
};
export type HarnessApi = typeof harnessApi;
void 0;

