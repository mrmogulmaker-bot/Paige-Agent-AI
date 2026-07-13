/**
 * AccountSwitcher — agency-owner-only sub-account picker (§9).
 *
 * Mirrors GHL's "Switch to Agency View" / sub-account picker: an agency
 * owner/admin flips between their AGENCY view and any of their SUB-ACCOUNTS to
 * run that sub-account's affairs in-platform, then flips back.
 *
 * HARD RULE (§9): ONLY an agency owner/admin ever sees this control. A plain
 * sub-account user, or a standalone tenant, has no agency view and no switcher —
 * they render null. Eligibility is proven server-side: `agency_list_my_subaccounts`
 * is auth.uid()-keyed and returns rows ONLY for a caller who owns/admins an
 * Agency/Enterprise tenant (a sub-account user gets an empty set — nothing to
 * leak, nothing to show). We never trust a client-supplied identity; the RPC's
 * own parentage guard is the authority (§13).
 *
 * The actual switch runs through the parentage-gated RPCs (§10 Paige-callable
 * seam; this UI is one caller):
 *   - agency_enter_subaccount(_child) → membership + active_tenant_id = child
 *   - agency_exit_subaccount()        → active_tenant_id = primary agency
 * After the RPC resolves we HARD-navigate to /admin so every per-instance
 * `useTenantContext` re-reads the new scope (see switchNotice.ts for why).
 *
 * Gold discipline (§11): the current selection is marked with a MUTED check —
 * never gold. Gold is reserved for the act/approve/on moment.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import { consumeSwitchNotice, stashSwitchNotice } from "@/lib/agency/switchNotice";

interface ManagedSub {
  id: string;
  slug: string;
  name: string;
  account_type: string;
  status: string;
}

/** Map an RPC failure to a human, mogul-direct line (§3). */
function switchError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === "42501") return "You can't manage that account.";
  return e instanceof Error && e.message ? e.message : "Couldn't switch accounts.";
}

export function AccountSwitcher() {
  const { loading: ctxLoading, isPlatformStaff, activeTenantId, activeTenant } = useTenantContext();

  const [subs, setSubs] = useState<ManagedSub[]>([]);
  // The agency's own name, so the "Agency view" row can name the account you'd
  // return to even while scoped INSIDE a child (activeTenant is the child then).
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [switching, setSwitching] = useState(false);
  const mounted = useRef(true);

  // Fire any toast handed across the last switch's hard reload (one-shot).
  useEffect(() => {
    const note = consumeSwitchNotice();
    if (note) toast.success(note);
  }, []);

  // Prove agency-manager eligibility server-side. Platform staff run the God
  // console, not an agency book — they never get this control (§9).
  useEffect(() => {
    mounted.current = true;
    if (ctxLoading || isPlatformStaff) {
      setReady(true);
      return;
    }
    (async () => {
      try {
        // Roster of this agency's children + the agency's home context (its name),
        // both auth.uid()-keyed and server-gated. The context call is what lets us
        // label the return-to-agency row while scoped inside a child.
        const [roster, ctx] = await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.rpc("agency_list_my_subaccounts" as any),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase.rpc("agency_switch_context" as any),
        ]);
        if (roster.error) throw roster.error;
        const rows = (Array.isArray(roster.data) ? roster.data : []) as ManagedSub[];
        const name = (ctx.data as { agency_name?: string } | null)?.agency_name ?? null;
        if (mounted.current) {
          setSubs(rows);
          setAgencyName(name);
        }
      } catch {
        // A non-agency caller (or a transient error) simply shows no switcher.
        if (mounted.current) setSubs([]);
      } finally {
        if (mounted.current) setReady(true);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [ctxLoading, isPlatformStaff]);

  const enterChild = useCallback(async (child: ManagedSub) => {
    setSwitching(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc("agency_enter_subaccount" as any, { _child: child.id });
      if (error) throw error;
      stashSwitchNotice(`Now managing ${child.name}.`);
      window.location.assign("/admin");
    } catch (e) {
      toast.error(switchError(e));
      setSwitching(false);
    }
  }, []);

  // "Agency view" goes UP to the agency operator side (`/agency`, §9), not the
  // tenant workspace. If we're currently scoped INSIDE a child, exit that context
  // first (reset active_tenant_id to the primary agency) so the agency side reads
  // the right scope; then hard-navigate so every per-instance tenant context
  // re-reads from scratch (switchNotice.ts). Already in agency view → straight to
  // /agency.
  const goToAgency = useCallback(async (insideChild: boolean) => {
    if (!insideChild) {
      window.location.assign("/agency");
      return;
    }
    setSwitching(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.rpc("agency_exit_subaccount" as any);
      if (error) throw error;
      stashSwitchNotice("Back to agency view.");
      window.location.assign("/agency");
    } catch (e) {
      toast.error(switchError(e));
      setSwitching(false);
    }
  }, []);

  // Gate: only an agency owner/admin ever sees this. Platform staff and callers
  // with no managed sub-accounts render nothing (§9).
  if (!ready || isPlatformStaff || subs.length === 0) return null;

  // Are we currently INSIDE one of our sub-accounts, or in agency view?
  const insideChild = subs.find((s) => s.id === activeTenantId) ?? null;
  const inAgencyView = !insideChild;
  const label = insideChild ? `Managing ${insideChild.name}` : "Agency view";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={switching}
          aria-label="Switch between your agency and its sub-accounts"
          className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-sidebar-accent/50 max-w-[200px]"
        >
          {switching ? (
            <Loader2 className="w-4 h-4 mr-1.5 flex-shrink-0 animate-spin" />
          ) : insideChild ? (
            <Building2 className="w-4 h-4 mr-1.5 flex-shrink-0" />
          ) : (
            <Network className="w-4 h-4 mr-1.5 flex-shrink-0" />
          )}
          <span className="truncate text-xs">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70 flex-shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch account</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Agency view — the agency itself. Current selection = muted check (never gold, §11). */}
        <DropdownMenuItem
          onClick={() => goToAgency(!!insideChild)}
          disabled={switching}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Network className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-sm">Agency view</div>
              <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                {inAgencyView && activeTenant ? activeTenant.name : (agencyName ?? "Your agency")}
              </div>
            </div>
          </div>
          {inAgencyView && <Check className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sub-accounts
        </DropdownMenuLabel>

        {subs.map((s) => {
          const isCurrent = s.id === activeTenantId;
          return (
            <DropdownMenuItem
              key={s.id}
              onClick={() => { if (!isCurrent) enterChild(s); }}
              disabled={switching}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-sm">{s.name}</div>
                  <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                    /{s.slug} · {s.status}
                  </div>
                </div>
              </div>
              {isCurrent && <Check className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
