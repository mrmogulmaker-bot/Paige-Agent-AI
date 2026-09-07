import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecureBrowserConnectedAccounts } from "./SecureBrowserConnectedAccounts";

const api = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: api.rpc } }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  api.rpc.mockReset();
  document.body.innerHTML = "";
});

describe("Vault Connected Accounts", () => {
  it("renders an authenticated empty state without a connect seam", async () => {
    api.rpc.mockResolvedValue({ data: [], error: null });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SecureBrowserConnectedAccounts />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.rpc).toHaveBeenCalledWith("list_secure_browser_connected_accounts");
    expect(host.textContent).toContain("No accounts connected");
    expect(host.textContent).toContain("Nothing has been authorized, opened, or retained");
    const connect = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.includes("Connect account"));
    expect(connect?.disabled).toBe(true);
    await act(async () => root.unmount());
  });

  it("fails closed when account metadata cannot be read", async () => {
    api.rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SecureBrowserConnectedAccounts />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(host.textContent).toContain("Connected Accounts unavailable");
    expect(host.textContent).toContain("No account details were returned");
    expect(host.textContent).toContain("Retry");
    await act(async () => root.unmount());
  });
});
