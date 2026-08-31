/**
 * What a workspace has approved Paige to run on a connected provider.
 *
 * Connecting a provider and approving a capability are separate decisions, and this is the
 * second one. It is deliberately not loaded with the connection: discovery is an outbound
 * request to the provider, so it happens when somebody asks to see the list, not every time
 * the panel opens.
 *
 * APPROVING PINS A CONTRACT. Each name is approved together with the fingerprint of the
 * input schema it had when it was shown — so an approval is to a specific contract, not to
 * a name a provider can later reshape. The fingerprints are carried back to the server,
 * which re-derives them from the provider anyway; the copy sent from here exists only so
 * the server can tell that the provider changed BETWEEN the person looking and the person
 * approving, and refuse rather than record consent to something nobody read.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readFunctionErrorBody } from "@/lib/integrations/connectError";
import { useTenantContext } from "@/hooks/useTenantContext";
import { createSettingsRequestGate } from "../settings-contract";
import type { McpProvider } from "./useMcpConnection";

export type DiscoveredCapability = {
  name: string;
  /** Provider-written text. Shown to a HUMAN choosing; never sent to a model. */
  description: string;
  schemaHash: string;
  approved: boolean;
};

export type CapabilitiesState = {
  /** null until somebody asks — discovery is an outbound call, not a page load. */
  tools: DiscoveredCapability[] | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

function readTools(value: unknown): DiscoveredCapability[] {
  const list = (value as { tools?: unknown })?.tools;
  if (!Array.isArray(list)) return [];
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof t.name === "string")
    .map((t) => ({
      name: String(t.name),
      description: typeof t.description === "string" ? t.description : "",
      schemaHash: typeof t.schema_hash === "string" ? t.schema_hash : "",
      approved: t.approved === true,
    }));
}

function describe(code: unknown, fallback: string): string {
  switch (code) {
    case "capabilities_changed":
      return "The provider changed while you were choosing, so nothing was approved. Look again.";
    case "not_connected":
      return "This workspace is not connected to that provider.";
    case "connection_disabled":
      return "That connection is turned off.";
    case "forbidden":
    case "MCP_FORBIDDEN":
      return "Only a workspace admin can approve capabilities.";
    case "tenant_changed":
      return "You switched workspaces while that was saving, so nothing was changed. Try again here.";
    case "discovery_failed":
      return "The provider could not be reached, so there is nothing to show.";
    default:
      return fallback;
  }
}

export function useMcpCapabilities(provider: McpProvider) {
  // Keyed to the active workspace, and gated, exactly like the connection hook beside it.
  //
  // Without this, switching workspaces while the panel stayed mounted left the FIRST
  // workspace's discovered tools on screen, and a discovery already in flight for it
  // would land afterwards and overwrite whatever the second one had. Two workspaces whose
  // providers expose the same tool names and the same schema hashes would then let an
  // Approve click apply a selection read for one of them to the other — a list of another
  // workspace's provider-authored names, still on screen, still actionable.
  const { activeTenantId } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<CapabilitiesState>({ tools: null, loading: false, saving: false, error: null });

  // A workspace change invalidates everything in flight and everything on screen. Done
  // before the next read rather than after it, so there is no moment where one
  // workspace's list is displayed under another's identity.
  useEffect(() => {
    gate.current.clear();
    setState({ tools: null, loading: false, saving: false, error: null });
  }, [activeTenantId]);

  const discover = useCallback(async () => {
    const token = gate.current.begin();
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const { data, error } = await supabase.functions.invoke("tenant-mcp-connect", {
      body: { provider, action: "discover", expected_tenant_id: activeTenantId },
    });
    if (!gate.current.isCurrent(token)) return;
    // On a non-2xx `data` is null and the body is on the error — reading it from `data`
    // alone made every mapping below unreachable on exactly the responses it was written
    // for, so the user saw the fallback line no matter what actually went wrong.
    const failure = (await readFunctionErrorBody(error, data))?.error as string | undefined;
    if (error || failure) {
      setState({ tools: null, loading: false, saving: false, error: describe(failure, "The list could not be loaded.") });
      return;
    }
    setState({ tools: readTools(data), loading: false, saving: false, error: null });
    // `activeTenantId` is a real dependency: the callback SENDS it, so a stale closure
    // would tell the server the request was started for a workspace the person has
    // already left — the exact confusion this expectation exists to refuse.
  }, [activeTenantId, provider]);

  /**
   * Replaces the approval set outright. Approving is a statement of the whole list, not an
   * addition to it — so unticking something withdraws it, and there is no way to end up
   * with an approval nobody can see in the list they just looked at.
   */
  const approve = useCallback(async (names: string[]): Promise<boolean> => {
    // Gated for the same reason `discover` is, and it was missed here because the two were
    // fixed one at a time. `expected_tenant_id` already confines the WRITE to the workspace
    // the request started in — but a response landing after a switch still ran this
    // callback, which maps the names it approved onto whatever tools are now on screen and
    // clears a draft the admin may have started for the workspace they moved to. The
    // database was right and the screen was wrong.
    const token = gate.current.begin();
    setState((prev) => ({ ...prev, saving: true, error: null }));
    const pins: Record<string, string> = {};
    for (const tool of state.tools ?? []) if (names.includes(tool.name) && tool.schemaHash) pins[tool.name] = tool.schemaHash;

    const { data, error } = await supabase.functions.invoke("tenant-mcp-connect", {
      body: { provider, action: "approve", capabilities: names, pins, expected_tenant_id: activeTenantId },
    });
    if (!gate.current.isCurrent(token)) return false;
    const failure = (await readFunctionErrorBody(error, data))?.error as string | undefined;
    if (error || failure) {
      setState((prev) => ({ ...prev, saving: false, error: describe(failure, "That did not save, and nothing was changed.") }));
      // A changed provider means the list on screen is stale; reloading it is the only
      // honest next step, and leaving the old list up would invite approving it again.
      if (failure === "capabilities_changed") void discover();
      return false;
    }
    setState((prev) => ({
      ...prev,
      saving: false,
      tools: (prev.tools ?? []).map((t) => ({ ...t, approved: names.includes(t.name) })),
    }));
    return true;
  }, [activeTenantId, discover, provider, state.tools]);

  return { ...state, discover, approve };
}
