/**
 * Data-boundary stub for the Settings › Integrations harness mount.
 *
 * MOCKS THE PROVIDER, NEVER THE CONTRACT (harness README). The shipped
 * `SoloIntegrationsView`, the shipped `useN8nConnection` and the shipped CSS are
 * all under measurement — only the Supabase transport is replaced, and it answers
 * with the exact shapes the real RPCs return, including their raised errors.
 *
 * THE ROWS ARE VISIBLY SYNTHETIC ON PURPOSE. The instance address reads
 * "harness" so a frame can never be mistaken for a tenant's real configuration
 * (§13/§63). This is GEOMETRY and INTERACTION evidence only. It proves layout,
 * scroll ownership, focus and state rendering. It proves NOTHING about a real
 * provider connection and must never be reported as having done so.
 *
 * No API key value appears anywhere in this file. `api_key_last4` is what the
 * real seam returns; the key itself is unreadable by construction.
 *
 * `?data=` selects the state under measurement:
 *   empty (default) · connected · broken · readonly · error
 */
export type StubState = "empty" | "connected" | "broken" | "readonly" | "error";

function state(): StubState {
  const value = new URLSearchParams(window.location.search).get("data");
  return (value as StubState) || "empty";
}

function n8nRow() {
  switch (state()) {
    case "connected":
      return { configured: true, status: "connected", label: "Harness instance",
        base_url: "https://harness.app.n8n.cloud", api_key_last4: "9f2a",
        last_sync_at: "2026-08-31T03:00:00Z", workflow_count: 7 };
    case "broken":
      return { configured: true, status: "error", label: "Harness instance",
        base_url: "https://harness.app.n8n.cloud", api_key_last4: "9f2a",
        last_sync_at: "2026-08-29T03:00:00Z", workflow_count: 7 };
    case "readonly":
      return { configured: true, status: "connected", label: "Harness instance",
        base_url: "https://harness.app.n8n.cloud", api_key_last4: "9f2a", workflow_count: 3 };
    default:
      return { configured: false, status: "unconfigured" };
  }
}

export const supabase = {
  rpc: (name: string, args?: Record<string, unknown>) => {
    if (state() === "error" && name.startsWith("get_")) {
      return Promise.resolve({ data: null, error: { message: "harness: read failed" } });
    }
    if (name === "get_tenant_n8n_connection") return Promise.resolve({ data: n8nRow(), error: null });
    if (name === "get_tenant_mcp_connection") {
      return Promise.resolve({ data: { configured: false, status: "unconfigured" }, error: null });
    }
    if (name === "is_current_user_tenant_admin") {
      return Promise.resolve({ data: state() !== "readonly", error: null });
    }
    if (name === "set_tenant_n8n_connection") {
      // Mirrors the real seam's own https guard so the error state is a genuine
      // render of the mapped message, not a hand-placed string.
      const url = String(args?._base_url ?? "");
      if (!/^https:\/\//i.test(url)) {
        return Promise.resolve({ data: null, error: { message: "N8N_INSECURE_URL: instance URL must be https://" } });
      }
      return Promise.resolve({ data: { ok: true }, error: null });
    }
    if (name === "clear_tenant_n8n_connection") return Promise.resolve({ data: null, error: null });
    return Promise.resolve({ data: null, error: null });
  },
};

export default { supabase };
