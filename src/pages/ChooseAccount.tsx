import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronRight, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { Button } from "@/components/ui/button";
import { useTenantContext, type TenantSummary } from "@/hooks/useTenantContext";
import { signInWithOAuth } from "@/integrations/auth/oauth";
import { supabase } from "@/integrations/supabase/client";
import { tenantAccountLabel } from "@/lib/auth/accountSelection";
import {
  clearWorkspaceScopedState,
  rememberWorkspaceEntered,
  workspaceRootForTenant,
} from "@/lib/auth/workspaceEntry";

type Membership = { tenant_id: string; role: string };
type Choice = { tenant: TenantSummary; role: string };

function roleLabel(role: string): string {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : role === "coach" ? "Team member" : role;
}

export default function ChooseAccount() {
  const navigate = useNavigate();
  const context = useTenantContext();
  const [email, setEmail] = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      navigate("/auth", { replace: true });
      return;
    }
    setEmail(auth.user.email ?? "Your Google account");
    const { data, error: membershipError } = await supabase
      .from("tenant_members")
      .select("tenant_id, role")
      .eq("user_id", auth.user.id)
      .eq("status", "active");
    if (membershipError) {
      setError("We couldn't load your Paige accounts. Your access has not changed.");
      setLoading(false);
      return;
    }
    setMemberships((data ?? []) as Membership[]);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { void load(); }, [load]);

  const choices = useMemo<Choice[]>(() => {
    const roles = new Map(memberships.map((membership) => [membership.tenant_id, membership.role]));
    return context.tenants
      .filter((tenant) => roles.has(tenant.id) && tenant.status === "active")
      .map((tenant) => ({ tenant, role: roles.get(tenant.id) ?? "member" }));
  }, [context.tenants, memberships]);

  // Nothing to choose, so do not ask. The destination is the person's own
  // workspace root when their tenant has one; `/admin` otherwise, which is where
  // a tenant whose shell canary is off renders inline anyway.
  //
  // Recording the entry BEFORE leaving is what makes the `/admin` fallback safe:
  // `/admin` now sends multi-context people here, and the two surfaces count
  // workspaces from different sources, so without the record a disagreement
  // between them would be an infinite redirect rather than a wrong number.
  useEffect(() => {
    if (loading || context.accountContextLoading || context.accountContextStatus !== "ready") return;
    if (!context.isPlatformStaff && choices.length >= 2) return;
    // Platform staff keep their existing landing exactly (§58): they move between
    // tenants through the audited operator seam, not this chooser, so they are
    // never sent into a tenant workspace root by it.
    const only = !context.isPlatformStaff && choices.length === 1 ? choices[0].tenant : null;
    if (only) {
      clearWorkspaceScopedState();
      rememberWorkspaceEntered(only.id);
    }
    navigate(workspaceRootForTenant(only) ?? "/admin", { replace: true });
  }, [choices, context.accountContextLoading, context.accountContextStatus, context.isPlatformStaff, loading, navigate]);

  const choose = async (choice: Choice) => {
    setError(null);
    setSwitchingTo(choice.tenant.id);
    const switched = await context.switchTenant(choice.tenant.id);
    if (!switched) {
      setSwitchingTo(null);
      setError("Paige couldn't open that account. Your current workspace is unchanged.");
      return;
    }
    // Drop the leaving workspace's identity/navigation state, then record the
    // choice, both BEFORE leaving: nothing from the previous account may render
    // under the new one, and the `/admin` door must not ask again for a workspace
    // this person has just explicitly picked.
    clearWorkspaceScopedState();
    rememberWorkspaceEntered(choice.tenant.id);
    // Enter the chosen workspace at ITS OWN root rather than routing back through
    // `/admin`, which is the door that resumes a parked context — except for a
    // tenant whose shell canary is off, whose shell only exists inline at `/admin`.
    // A full-page assign (not a client navigate) is kept deliberately: `switchTenant`
    // has just changed the server-side active context, and every provider should
    // re-resolve against it from scratch rather than carry the previous workspace's
    // caches across.
    window.location.assign(workspaceRootForTenant(choice.tenant) ?? "/admin");
  };

  const handleDifferentGoogleAccount = async () => {
    setError(null);
    setSwitchingTo("google");
    await supabase.auth.signOut();
    const result = await signInWithOAuth("google", `${window.location.origin}/auth`, { chooseAccount: true });
    if (result.error) {
      setSwitchingTo(null);
      setError("Google sign-in couldn't start. Try again.");
    }
  };

  const resolving = loading || context.accountContextLoading;

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#f4f0ff_0,#f8f8fb_38%,#eef0f5_100%)] px-4 py-8 text-slate-950 dark:bg-[radial-gradient(circle_at_top,#28203f_0,#15131b_42%,#0d0c10_100%)] dark:text-white sm:py-14">
      <section className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(30,22,55,.14)] backdrop-blur dark:border-white/10 dark:bg-[#17151d]/95 sm:p-9" aria-labelledby="account-picker-title">
        <div className="mb-8 flex items-center gap-3">
          <PaigeMark className="h-10 w-10" />
          <div>
            <div className="text-sm font-semibold">Paige Agent AI</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Secure workspace access</div>
          </div>
        </div>

        <h1 id="account-picker-title" className="text-3xl font-semibold tracking-tight">Where do you want to work?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Signed in as <strong className="font-semibold text-slate-900 dark:text-white">{email || "your Google account"}</strong>. Choose a Paige account to continue.
        </p>

        {error && (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/35 dark:text-red-200">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Retry
            </Button>
          </div>
        )}

        <div className="mt-7 space-y-3" aria-live="polite">
          {resolving ? (
            <div role="status" className="flex min-h-36 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your Paige accounts…
            </div>
          ) : choices.map((choice) => (
            <button
              type="button"
              key={choice.tenant.id}
              disabled={!!switchingTo}
              onClick={() => void choose(choice)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-400 hover:bg-violet-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-60 dark:border-white/10 dark:bg-white/[.03] dark:hover:border-violet-500 dark:hover:bg-violet-500/10"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Building2 className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-base">{choice.tenant.name}</strong>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {tenantAccountLabel(choice.tenant.account_type, choice.tenant.parent_tenant_id)} · {roleLabel(choice.role)}
                </span>
              </span>
              {switchingTo === choice.tenant.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5" />}
            </button>
          ))}
        </div>

        <Button type="button" variant="ghost" className="mt-6 w-full" disabled={!!switchingTo} onClick={() => void handleDifferentGoogleAccount()}>
          <LogOut className="mr-2 h-4 w-4" /> Use a different Google account
        </Button>
        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-4 w-4" /> You only see accounts where this email has active access.
        </p>
      </section>
    </main>
  );
}
