/**
 * AgencyLayout — the Agency Operator side (§9), a top-level shell PEER to the God
 * console, NOT nested under the tenant `/admin` menu.
 *
 * WHO IS THIS FOR (§9): the agency OPERATOR — someone who runs a *book* of
 * sub-accounts and resells platform capabilities down onto them. That is a
 * different audience from the tenant workspace (which runs ONE practice). So the
 * agency book gets its own place you *go up to* (`/agency`), reached through the
 * one global AccountSwitcher's "Agency view" row — never a tab inside a tenant.
 *
 * ELIGIBILITY IS SERVER-PROVEN (§13). We gate on the authenticated signals, NOT
 * `activeTenant.account_type` — because account_type flips to the CHILD's the
 * moment an operator enters a sub-account, which would wrongly lock them out of
 * their own agency side. The truth comes from:
 *   - agency_switch_context().is_agency_manager  (auth.uid()-keyed)
 *   - agency_list_my_subaccounts()               (empty for a non-agency caller)
 * A plain sub-account user or standalone tenant that hits `/agency` is redirected
 * to `/admin` — the UI matches RLS end-to-end.
 *
 * ONE SWITCHER (§6): the header carries the single canonical AccountSwitcher and
 * a persistent context banner ("Agency: {name}") so the operator always knows
 * which layer they're on. No TenantSwitcher here — that God-level "active tenant"
 * filter lives only in the God console header.
 *
 * Gold discipline (§11): gold is spent only on the act/approve/on moment. The
 * context banner and the switcher's current selection are non-gold; the active
 * nav treatment mirrors the God/tenant shells for one continuous system.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Building2, ChevronDown, Loader2, LogOut, Network, UserCog, Users, LayoutDashboard, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PageShell, PageHeader, EmptyState,
} from "@/components/ui/page";
import { AccountSwitcher } from "@/components/admin/AccountSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { performSignOut } from "@/lib/auth/signOut";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PLATFORM } from "@/lib/platform/identity";
import AgencyBoard from "@/pages/admin/AgencyBoard";
import { toast } from "sonner";

type LoginPref = "agency" | "last_account";

interface AgencyNav {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const AGENCY_NAV: AgencyNav[] = [
  { label: "Dashboard", href: "/agency", icon: LayoutDashboard },
  { label: "Team", href: "/agency/team", icon: UserCog },
];

/**
 * Where a returning agency operator lands on login. §10 Paige-callable: the write
 * goes through set_agency_login_default (auth.uid()-keyed), so this UI is one
 * caller of the seam and Paige is another — the preference never lives only in a
 * React component. §11: a real control, not a native <select>.
 */
function LoginDefaultControl({
  value,
  onChange,
}: {
  value: LoginPref;
  onChange: (next: LoginPref) => void;
}) {
  const [saving, setSaving] = useState(false);

  const set = useCallback(
    async (next: LoginPref) => {
      if (next === value || saving) return;
      setSaving(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.rpc("set_agency_login_default" as any, { _pref: next });
        if (error) throw error;
        onChange(next);
        toast.success(
          next === "agency"
            ? "Logins now land on your Agency side."
            : "Logins now resume your last account.",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save that preference.");
      } finally {
        setSaving(false);
      }
    },
    [value, saving, onChange],
  );

  const label = value === "agency" ? "Agency side" : "Last account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          aria-label="Choose where logins land"
          className="hidden md:inline-flex text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <LogIn className="w-4 h-4 mr-1.5" />}
          <span className="truncate text-xs">Login: {label}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Where logins land</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => set("agency")} className="flex-col items-start gap-0.5">
          <span className="text-sm">Agency side</span>
          <span className="text-[11px] text-muted-foreground">Open your book of sub-accounts first.</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => set("last_account")} className="flex-col items-start gap-0.5">
          <span className="text-sm">Last account</span>
          <span className="text-[11px] text-muted-foreground">Resume whatever account you were last in.</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Agency Team — nav slot present, surface not built yet (§11 crafted empty, no fake data). */
function AgencyTeam({ agencyName }: { agencyName: string | null }) {
  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Paige · Agency"
        title="Agency team"
        description={`Decide who may manage ${agencyName ?? "your agency"}'s book of sub-accounts.`}
      />
      <EmptyState
        icon={UserCog}
        tone="brand"
        title="Agency roles are coming"
        description="Soon you'll invite and scope the people who help run your book — separate from any one sub-account's own team. For now, you manage every sub-account yourself."
      />
    </PageShell>
  );
}

export default function AgencyLayout() {
  const location = useLocation();

  const [checking, setChecking] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [loginPref, setLoginPref] = useState<LoginPref>("agency");
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Prove agency-operator eligibility server-side (§13). is_agency_manager is the
  // authoritative signal; a non-empty roster is the belt-and-suspenders OR. Never
  // account_type (it flips to the child's on entry).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id ?? null;
        const [ctxRes, rosterRes, profileRes] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.rpc("agency_switch_context" as any),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.rpc("agency_list_my_subaccounts" as any),
          uid
            ? supabase.from("profiles").select("agency_login_default").eq("user_id", uid).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const ctx = (ctxRes.data as { is_agency_manager?: boolean; agency_name?: string } | null) ?? null;
        const roster = Array.isArray(rosterRes.data) ? rosterRes.data : [];
        const isMgr = ctx?.is_agency_manager === true || roster.length > 0;
        const pref = (profileRes.data as { agency_login_default?: string } | null)?.agency_login_default;
        if (mounted) {
          setEligible(isMgr);
          setAgencyName(ctx?.agency_name ?? null);
          setLoginPref(pref === "last_account" ? "last_account" : "agency");
        }
      } catch {
        if (mounted) setEligible(false);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await performSignOut("/");
  }, [isSigningOut]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Checking access…</div>
      </div>
    );
  }

  // Not an agency operator → this side isn't theirs. Send them back to their
  // workspace; /admin re-checks auth and routes appropriately.
  if (!eligible) return <Navigate to="/admin" replace />;

  const isActive = (href: string) =>
    href === "/agency" ? location.pathname === "/agency" : location.pathname.startsWith(href);

  return (
    <div className="h-dvh flex flex-col bg-background overflow-hidden">
      <header className="shrink-0 z-40 bg-primary text-primary-foreground border-b border-sidebar-border">
        {/* Row 1: brand + utilities */}
        <div className="flex items-center justify-between gap-3 px-3 md:px-6 h-14">
          <Link to="/agency" className="flex items-center gap-2 min-w-0">
            <PaigeMark className="h-8 w-8 flex-shrink-0" />
            <span className="font-bold text-sm tracking-tight truncate">{PLATFORM.adminName}</span>
            <Badge
              variant="outline"
              className="hidden sm:inline-flex ml-2 text-[10px] font-medium uppercase tracking-wide border-accent/40 text-accent bg-transparent"
            >
              Agency
            </Badge>
          </Link>

          <div className="flex items-center gap-1">
            <LoginDefaultControl value={loginPref} onChange={setLoginPref} />
            {/* The ONE global switcher (§6). No TenantSwitcher on the agency side. */}
            <AccountSwitcher />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              disabled={isSigningOut}
              aria-label="Sign out"
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: agency nav */}
        <div className="flex items-center gap-1 px-3 md:px-6 h-11 overflow-x-auto scrollbar-none border-t border-sidebar-border/60">
          {AGENCY_NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} to={item.href}>
                <div
                  className={`relative flex items-center gap-2 px-3 h-11 text-sm whitespace-nowrap transition-colors ${
                    active
                      ? "text-accent font-medium"
                      : "text-primary-foreground/70 hover:text-primary-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-t-full" />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Persistent context banner — which layer + which account (non-gold, §11). */}
      <div className="shrink-0 flex items-center gap-2 px-3 md:px-6 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground">
        <Network className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">
          Agency: <span className="font-medium text-foreground">{agencyName ?? "Your agency"}</span>
        </span>
        <span className="mx-1 opacity-40">·</span>
        <span className="truncate">Running your book of sub-accounts</span>
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Routes>
          <Route index element={<AgencyBoard />} />
          <Route path="team" element={<AgencyTeam agencyName={agencyName} />} />
          <Route path="*" element={<Navigate to="/agency" replace />} />
        </Routes>
      </main>
    </div>
  );
}
