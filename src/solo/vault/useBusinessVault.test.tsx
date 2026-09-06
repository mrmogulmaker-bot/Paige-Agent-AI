// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  tenantId: "tenant-a",
  rpc: vi.fn(),
  invoke: vi.fn(),
  authChanged: null as null | (() => void),
  latest: null as null | { state: string; error: string | null },
}));

vi.mock("@/hooks/useTenantContext", () => ({
  useTenantContext: () => ({ activeTenantId: harness.tenantId }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: harness.rpc,
    functions: { invoke: harness.invoke },
    auth: {
      onAuthStateChange: (callback: () => void) => {
        harness.authChanged = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  harness.rpc.mockReset();
  harness.invoke.mockReset();
  harness.tenantId = "tenant-a";
  harness.latest = null;
  harness.authChanged = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Business Vault authorization load", () => {
  it("passes a real abort signal and bounded timeout to manual upload", async () => {
    harness.rpc
      .mockResolvedValueOnce({ data: { allowed: true, can_archive: true }, error: null })
      .mockResolvedValueOnce({ data: { available: false }, error: null })
      .mockResolvedValueOnce({
        data: { records: [], obligations: [], contracts: [], facts: [] },
        error: null,
      });
    harness.invoke.mockResolvedValueOnce({ data: null, error: { message: "aborted" } });
    const { useBusinessVault } = await import("./useBusinessVault");
    let uploadAction:
      | ((body: FormData, signal?: AbortSignal) => Promise<unknown>)
      | null = null;
    function Probe() {
      uploadAction = useBusinessVault().upload;
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    const controller = new AbortController();
    controller.abort();
    await expect(uploadAction?.(new FormData(), controller.signal)).rejects.toThrow("aborted");
    expect(harness.invoke).toHaveBeenCalledWith(
      "business-vault-upload",
      expect.objectContaining({ signal: controller.signal, timeout: 120_000 }),
    );
  });

  it("hides navigation synchronously when switching away from an allowed tenant", async () => {
    harness.rpc
      .mockResolvedValueOnce({ data: { allowed: true }, error: null })
      .mockImplementationOnce(() => new Promise(() => undefined));
    const { useVaultAccess } = await import("./useBusinessVault");
    const seen: string[] = [];
    function Probe() {
      seen.push(useVaultAccess());
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    expect(seen.at(-1)).toBe("allowed");

    harness.tenantId = "tenant-b";
    await act(async () => root.render(<Probe />));
    expect(seen.at(-1)).toBe("loading");
  });

  it("shows navigation only after the server confirms access", async () => {
    const { canShowVaultNavigation } = await import("./useBusinessVault");
    expect(canShowVaultNavigation("loading")).toBe(false);
    expect(canShowVaultNavigation("denied")).toBe(false);
    expect(canShowVaultNavigation("error")).toBe(false);
    expect(canShowVaultNavigation("allowed")).toBe(true);
  });

  it("removes Vault navigation after same-tenant authorization is revoked", async () => {
    harness.rpc
      .mockResolvedValueOnce({ data: { allowed: true }, error: null })
      .mockResolvedValueOnce({ data: { allowed: false }, error: null });
    const { useVaultAccess } = await import("./useBusinessVault");
    let latest = "loading";
    function Probe() {
      latest = useVaultAccess();
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    expect(latest).toBe("allowed");
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => Promise.resolve());
    expect(latest).toBe("denied");
  });

  it("does not request a snapshot after an explicit role denial", async () => {
    harness.rpc.mockResolvedValueOnce({ data: { allowed: false }, error: null });
    const { useBusinessVault } = await import("./useBusinessVault");
    function Probe() {
      const vault = useBusinessVault();
      harness.latest = { state: vault.state, error: vault.error };
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith("business_vault_access_status");
    expect(harness.latest?.state).toBe("denied");
  });

  it("reports an authorization transport failure without requesting metadata", async () => {
    harness.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "expired session" },
    });
    const { useBusinessVault } = await import("./useBusinessVault");
    function Probe() {
      const vault = useBusinessVault();
      harness.latest = { state: vault.state, error: vault.error };
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.latest?.state).toBe("error");
    expect(harness.latest?.error).toContain("authorization could not be confirmed");
  });

  it("clears cached metadata when a focused session loses Vault authorization", async () => {
    harness.rpc
      .mockResolvedValueOnce({ data: { allowed: true, can_archive: true }, error: null })
      .mockResolvedValueOnce({ data: { available: false }, error: null })
      .mockResolvedValueOnce({ data: { records: [{ id: "record-a" }], obligations: [], contracts: [], facts: [] }, error: null })
      .mockResolvedValueOnce({ data: { allowed: false }, error: null });
    const { useBusinessVault } = await import("./useBusinessVault");
    let latest: { state: string; hasSnapshot: boolean } | null = null;
    function Probe() {
      const vault = useBusinessVault();
      latest = { state: vault.state, hasSnapshot: vault.snapshot !== null };
      return null;
    }
    await act(async () => root.render(<Probe />));
    await act(async () => Promise.resolve());
    expect(latest).toEqual({ state: "allowed", hasSnapshot: true });
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => Promise.resolve());
    expect(latest).toEqual({ state: "denied", hasSnapshot: false });
  });
});
