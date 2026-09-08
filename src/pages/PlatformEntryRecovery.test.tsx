import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthListener = (event: string, session: { user: { id: string } } | null) => void;

const harness = vi.hoisted(() => ({
  authListener: null as AuthListener | null,
  rpc: vi.fn(),
  refresh: vi.fn(async () => undefined),
  toasts: [] as Array<{ title?: string; description?: string }>,
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ refresh: harness.refresh }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: (value: { title?: string; description?: string }) => harness.toasts.push(value) }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn((listener: AuthListener) => {
        harness.authListener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      getUser: vi.fn(async () => ({ data: { user: { id: "staff-1" } }, error: null })),
      signInWithPassword: vi.fn(async () => {
        window.setTimeout(() => harness.authListener?.("SIGNED_IN", { user: { id: "staff-1" } }), 0);
        return { error: null };
      }),
      signUp: vi.fn(),
    },
    rpc: (...args: unknown[]) => harness.rpc(...args),
    from: vi.fn(() => {
      const result = { data: [], error: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        limit: vi.fn(() => query),
        maybeSingle: vi.fn(async () => result),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    }),
  },
}));

import JoinPlatform from "./JoinPlatform";
import OperatorLogin from "./OperatorLogin";

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("HTMLInputElement value setter unavailable");
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonNamed(host: HTMLElement, name: RegExp): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => name.test(candidate.textContent ?? ""));
  if (!button) throw new Error(`Button not found: ${name}`);
  return button;
}

async function submitCredentials(host: HTMLElement) {
  const email = host.querySelector('input[type="email"]') as HTMLInputElement;
  const password = host.querySelector('input[type="password"]') as HTMLInputElement;
  setInput(email, "operator@example.invalid");
  setInput(password, "not-a-real-password");
  await act(async () => {
    host.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  });
}

describe("Platform entry recovery", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    harness.authListener = null;
    harness.rpc.mockReset();
    harness.refresh.mockClear();
    harness.toasts.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("keeps Operator sign-in recoverable when the authority request rejects", async () => {
    harness.rpc.mockRejectedValue(new Error("authority unavailable"));
    await act(async () => {
      root.render(<MemoryRouter><OperatorLogin /></MemoryRouter>);
    });

    await submitCredentials(host);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("sign-in is still active");
    expect(buttonNamed(host, /Retry account check/i).disabled).toBe(false);
    expect((host.querySelector('input[type="email"]') as HTMLInputElement).disabled).toBe(false);
    expect((host.querySelector('input[type="password"]') as HTMLInputElement).disabled).toBe(false);
  });

  it("re-enables Join Platform credentials when invite acceptance is refused", async () => {
    harness.rpc.mockImplementation(async (name: string) => name === "accept_platform_invite"
      ? { data: null, error: { message: "Invite expired" } }
      : { data: false, error: null });
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/join-platform?token=synthetic-token"]}><JoinPlatform /></MemoryRouter>);
    });
    act(() => buttonNamed(host, /Already have an account/i).click());

    await submitCredentials(host);

    expect(harness.toasts.some((toast) => toast.title === "Couldn't accept invite")).toBe(true);
    expect((host.querySelector('input[type="email"]') as HTMLInputElement).disabled).toBe(false);
    expect((host.querySelector('input[type="password"]') as HTMLInputElement).disabled).toBe(false);
    expect(buttonNamed(host, /^Sign in$/i).disabled).toBe(false);
  });

  it("keeps returning staff recovery operable when authority routing rejects", async () => {
    harness.rpc.mockRejectedValue(new Error("authority unavailable"));
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/join-platform"]}><JoinPlatform /></MemoryRouter>);
    });

    await submitCredentials(host);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain("sign-in is still active");
    expect(buttonNamed(host, /Retry account check/i).disabled).toBe(false);
    expect((host.querySelector('input[type="email"]') as HTMLInputElement).disabled).toBe(false);
  });
});
