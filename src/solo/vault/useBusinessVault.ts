import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import type { VaultSnapshot } from "./vault-contract";

type VaultRpcError = { message?: string } | null;
type VaultRpcClient = {
  rpc<T = unknown>(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T; error: VaultRpcError }>;
};
const vaultClient = supabase as unknown as VaultRpcClient;
const VAULT_ACCESS_DENIED_EVENT = "paige:vault-access-denied";

type VaultAccessLoss = "denied" | "error";

function broadcastVaultDenied(tenantId: string, reason: VaultAccessLoss) {
  window.dispatchEvent(
    new CustomEvent(VAULT_ACCESS_DENIED_EVENT, { detail: { tenantId, reason } }),
  );
}

export type VaultLoadState = "loading" | "allowed" | "denied" | "error";

export function canShowVaultNavigation(state: VaultLoadState) {
  return state === "allowed";
}

export function useVaultAccess() {
  const { activeTenantId } = useTenantContext();
  const [result, setResult] = useState<{
    tenantId: string | null;
    state: VaultLoadState;
  }>({ tenantId: activeTenantId, state: "loading" });
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setResult({ tenantId: activeTenantId, state: "loading" });
    if (!activeTenantId) return;
    const checkAccess = async () => {
      const request = ++requestRef.current;
      const { data, error } = await vaultClient.rpc<{
        allowed?: boolean;
      }>("business_vault_access_status");
      if (cancelled || request !== requestRef.current) return;
      const allowed = !error && data?.allowed === true;
      setResult({
        tenantId: activeTenantId,
        state: allowed ? "allowed" : error ? "error" : "denied",
      });
      if (!allowed) broadcastVaultDenied(activeTenantId, error ? "error" : "denied");
    };
    const onDenied = (event: Event) => {
      const detail = (event as CustomEvent<{
        tenantId?: string;
        reason?: VaultAccessLoss;
      }>).detail;
      if (detail?.tenantId === activeTenantId) {
        requestRef.current += 1;
        setResult({
          tenantId: activeTenantId,
          state: detail.reason === "error" ? "error" : "denied",
        });
      }
    };
    const onFocus = () => void checkAccess();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void checkAccess();
    };
    void checkAccess();
    const timer = window.setInterval(() => void checkAccess(), 15_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener(VAULT_ACCESS_DENIED_EVENT, onDenied);
    document.addEventListener("visibilitychange", onVisibility);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void checkAccess());
    return () => {
      cancelled = true;
      requestRef.current += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(VAULT_ACCESS_DENIED_EVENT, onDenied);
      document.removeEventListener("visibilitychange", onVisibility);
      authListener.subscription.unsubscribe();
    };
  }, [activeTenantId]);

  return result.tenantId === activeTenantId ? result.state : "loading";
}

export function useBusinessVault() {
  const { activeTenantId } = useTenantContext();
  const tenantRef = useRef(activeTenantId);
  const [state, setState] = useState<VaultLoadState>("loading");
  const [snapshot, setSnapshot] = useState<VaultSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canArchive, setCanArchive] = useState(false);
  const [uploadAvailable, setUploadAvailable] = useState(false);
  const stateRef = useRef<VaultLoadState>("loading");
  const requestRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setSnapshot(null);
    setError(null);
    setCanArchive(false);
    setUploadAvailable(false);
    setState("loading");
    if (!activeTenantId) return;

    const access = await vaultClient.rpc<{
      allowed?: boolean;
      can_archive?: boolean;
    }>("business_vault_access_status");
    if (request !== requestRef.current) return;
    if (access.error) {
      setError(
        "Vault authorization could not be confirmed. No record details were returned.",
      );
      setState("error");
      broadcastVaultDenied(activeTenantId, "error");
      return;
    }
    if (access.data?.allowed !== true) {
      setState("denied");
      broadcastVaultDenied(activeTenantId, "denied");
      return;
    }
    setCanArchive(access.data?.can_archive === true);

    const capability = await vaultClient.rpc<{ available?: boolean }>(
      "business_vault_inspection_capability",
    );
    if (request !== requestRef.current) return;
    setUploadAvailable(!capability.error && capability.data?.available === true);

    const result = await vaultClient.rpc<VaultSnapshot>(
      "business_vault_snapshot",
    );
    if (request !== requestRef.current) return;
    if (result.error) {
      setError(
        "The Vault could not be loaded. No record details were returned.",
      );
      setState("error");
      return;
    }
    setSnapshot(result.data as VaultSnapshot);
    setState("allowed");
  }, [activeTenantId]);

  useEffect(() => {
    tenantRef.current = activeTenantId;
    void load();
    return () => {
      requestRef.current += 1;
    };
  }, [activeTenantId, load]);

  useEffect(() => {
    let cancelled = false;
    const revalidateAccess = async () => {
      if (!activeTenantId) return;
      const access = await vaultClient.rpc<{ allowed?: boolean }>(
        "business_vault_access_status",
      );
      if (cancelled || tenantRef.current !== activeTenantId) return;
      if (access.error || access.data?.allowed !== true) {
        broadcastVaultDenied(activeTenantId, access.error ? "error" : "denied");
        return;
      }
      if (stateRef.current !== "allowed") void load();
    };
    const onDenied = (event: Event) => {
      const detail = (event as CustomEvent<{
        tenantId?: string;
        reason?: VaultAccessLoss;
      }>).detail;
      if (detail?.tenantId !== activeTenantId) return;
      requestRef.current += 1;
      setSnapshot(null);
      setCanArchive(false);
      setUploadAvailable(false);
      const isError = detail.reason === "error";
      setError(
        isError
          ? "Vault authorization could not be confirmed. No record details were returned."
          : null,
      );
      setState(isError ? "error" : "denied");
    };
    const onFocus = () => void revalidateAccess();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void revalidateAccess();
    };
    const timer = window.setInterval(() => void revalidateAccess(), 15_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener(VAULT_ACCESS_DENIED_EVENT, onDenied);
    document.addEventListener("visibilitychange", onVisibility);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void revalidateAccess();
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(VAULT_ACCESS_DENIED_EVENT, onDenied);
      document.removeEventListener("visibilitychange", onVisibility);
      authListener.subscription.unsubscribe();
    };
  }, [activeTenantId, load]);

  const upload = useCallback(
    async (body: FormData, signal?: AbortSignal) => {
      const startedFor = tenantRef.current;
      if (!startedFor) throw new Error("No active workspace");
      body.set("expected_tenant", startedFor);
      const result = await supabase.functions.invoke("business-vault-upload", {
        body,
        signal,
        timeout: 120_000,
      });
      if (result.error)
        throw new Error(result.error.message || "Upload failed");
      if (signal?.aborted) {
        await load();
        throw new Error("Upload cancellation outcome requires review");
      }
      if (tenantRef.current !== startedFor)
        throw new Error("Workspace changed before upload confirmation");
      await load();
      return result.data;
    },
    [load],
  );

  const mutate = useCallback(
    async (rpc: string, args: Record<string, unknown>) => {
      const startedFor = tenantRef.current;
      if (!startedFor) throw new Error("No active workspace");
      const result = await vaultClient.rpc(rpc, {
        ...args,
        p_expected_tenant: startedFor,
      });
      if (result.error)
        throw new Error(
          result.error.message || "The change could not be saved",
        );
      if (tenantRef.current !== startedFor)
        throw new Error("Workspace changed before confirmation");
      await load();
      return result.data;
    },
    [load],
  );

  return {
    state,
    snapshot,
    error,
    canArchive,
    uploadAvailable,
    reload: load,
    upload,
    saveContract: (input: Record<string, unknown>) =>
      mutate("business_vault_save_contract", { p_input: input }),
    saveObligation: (input: Record<string, unknown>) =>
      mutate("business_vault_save_obligation", { p_input: input }),
    archiveRecord: (recordId: string) =>
      mutate("business_vault_archive_record", { p_record_id: recordId }),
    proposeFact: (input: Record<string, unknown>) =>
      mutate("business_vault_propose_fact", { p_input: input }),
    reviewFact: (
      factId: string,
      decision: "approved" | "rejected" | "revoked",
    ) =>
      mutate("business_vault_review_fact", {
        p_fact_id: factId,
        p_decision: decision,
      }),
  };
}
