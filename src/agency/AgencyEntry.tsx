import { useEffect, useState } from "react";
import { Navigate, Routes, Route, useLocation } from "react-router-dom";
import AgencyLayout from "@/components/admin/AgencyLayout";
import AgencyApp from "@/agency/AgencyApp";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PageSkeleton } from "@/components/ui/page";
import { supabase } from "@/integrations/supabase/client";
import { workspaceRootForTenant, WORKSPACE_CHOOSER_PATH } from "@/lib/auth/workspaceEntry";
import { GOD_CONSOLE } from "@/lib/auth/operatorTarget";

/**
 * AgencyEntry — the `/agency/*` dispatcher (§65 R0-slice-2).
 *
 * Mounted at `/agency/*`, it routes by the first path segment so the NEW URL-driven
 * agency shell and the LEGACY board can coexist with ZERO collision (§58 — nothing
 * removed):
 *   • **numeric first segment** (`/agency/1924546/…`) → the new `AgencyApp`, mounted
 *     under a nested `:account/*` route so it receives `account` + the branch splat
 *     from `useParams()` and drives every tab as a real deep-linkable URL.
 *   • **anything else** (bare `/agency`, legacy `/agency/team`, …) → the existing
 *     `AgencyLayout` board, byte-unchanged (it keeps its own server-proven
 *     agency-manager eligibility gate).
 *
 * Because account numbers are always numeric (§65 R0), the two never overlap. The
 * numeric shell is only ever LINKED-to for eligible agency managers (the `/admin`
 * Gate-A redirect + the landing route), and every data read stays RLS-scoped (§9/§51),
 * so the address segment is an address, never a grant.
 */
export default function AgencyEntry() {
  const seg = useLocation().pathname.split("/")[2] || "";
  if (/^\d+$/.test(seg)) {
    return <ResolvedAgencyApp />;
  }
  return <AgencyLayout />;
}

type AgencyAuthorityVerdict =
  | { kind: "resolving" }
  | { kind: "allow" }
  | { kind: "redirect"; to: string }
  | { kind: "error" };

function ResolvedAgencyApp() {
  const location = useLocation();
  const requestedAccount = location.pathname.split("/")[2] ?? "";
  const {
    accountContextLoading,
    accountContextStatus,
    activeUserId,
    activeTenant,
    isPlatformStaff,
  } = useTenantContext();
  const [verdict, setVerdict] = useState<AgencyAuthorityVerdict>({ kind: "resolving" });

  useEffect(() => {
    if (accountContextLoading || accountContextStatus === "resolving") return;
    if (accountContextStatus === "signed_out" || !activeUserId) {
      setVerdict({ kind: "redirect", to: "/auth" });
      return;
    }
    if (accountContextStatus === "error") {
      setVerdict({ kind: "error" });
      return;
    }
    if (isPlatformStaff) {
      setVerdict({ kind: "redirect", to: GOD_CONSOLE });
      return;
    }

    let cancelled = false;
    setVerdict({ kind: "resolving" });
    void (async () => {
      const { data, error } = await supabase.rpc("agency_switch_context");
      if (cancelled) return;
      if (error) {
        setVerdict({ kind: "error" });
        return;
      }
      const context = data as {
        is_agency_manager?: boolean;
        agency_account_number?: number | string | null;
      } | null;
      const accountNumber = Number(context?.agency_account_number);
      if (context?.is_agency_manager !== true || !Number.isSafeInteger(accountNumber) || accountNumber <= 0) {
        setVerdict({ kind: "redirect", to: workspaceRootForTenant(activeTenant) ?? WORKSPACE_CHOOSER_PATH });
        return;
      }
      const canonicalAccount = String(accountNumber);
      setVerdict(requestedAccount === canonicalAccount
        ? { kind: "allow" }
        : { kind: "redirect", to: `/agency/${canonicalAccount}/command-center` });
    })();
    return () => { cancelled = true; };
  }, [accountContextLoading, accountContextStatus, activeTenant, activeUserId, isPlatformStaff, requestedAccount]);

  if (verdict.kind === "resolving") return <PageSkeleton />;
  if (verdict.kind === "redirect") return <Navigate to={verdict.to} replace />;
  if (verdict.kind === "error") {
    return <main role="alert" className="p-6">Paige couldn't verify your agency access. Try again.</main>;
  }
  return <Routes><Route path=":account/*" element={<AgencyApp mode="agency" />} /></Routes>;
}
