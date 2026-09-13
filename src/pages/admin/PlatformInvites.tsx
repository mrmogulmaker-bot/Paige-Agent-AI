import { useCallback, useEffect, useState } from "react";
import { Loader2, Ticket, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  PageShell,
  PageHeader,
  SectionCard,
  DataTableShell,
  EmptyState,
  StatePill,
  type Column,
  type PillState,
} from "@/components/ui/page";
import { TableCell, TableRow } from "@/components/ui/table";

/**
 * /admin/platform/invites — legacy prospect invite containment.
 *
 * New plan invitations are paused while Solo Beta is the only public enrollment
 * path. Existing records remain visible for audit and revocation, without a
 * copyable customer link or a misleading active state. The separate platform
 * staff invitation contract is not owned by this surface.
 */

type PlatformInvite = {
  id?: string;
  token: string;
  plan_slug?: string;
  plan_name?: string;
  trial_period_days?: number;
  created_at?: string;
  expires_at?: string;
  consumed_at?: string | null;
  consumed_by?: string | null;
  status?: string;
};

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusPill(invite: PlatformInvite): { state: PillState; label: string } {
  if (invite.consumed_at || invite.status === "consumed") return { state: "off", label: "Consumed" };
  if (invite.status === "revoked") return { state: "error", label: "Revoked" };
  if (invite.status === "expired") return { state: "off", label: "Expired" };
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { state: "off", label: "Expired" };
  }
  return { state: "off", label: "Enrollment paused" };
}

const COLUMNS: Column[] = [
  { key: "plan", header: "Prior plan" },
  { key: "trial", header: "Prior trial", numeric: true },
  { key: "created", header: "Created" },
  { key: "expires", header: "Expires" },
  { key: "status", header: "Status" },
  { key: "actions", header: "", className: "w-px" },
];

export default function PlatformInvites() {
  const { toast } = useToast();
  const [invites, setInvites] = useState<PlatformInvite[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data, error } = (await supabase.rpc("list_platform_invites" as never)) as {
        data: PlatformInvite[] | null;
        error: unknown;
      };
      if (error) throw error;
      setInvites(Array.isArray(data) ? data : []);
    } catch {
      toast({
        title: "Couldn't load legacy invites",
        description: "Refresh to try again. No enrollment action is available from this page.",
        variant: "destructive",
      });
      setInvites([]);
    } finally {
      setLoadingList(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const revoke = async (invite: PlatformInvite) => {
    setRevoking(invite.token);
    try {
      const { error } = await supabase.rpc("revoke_platform_invite" as never, {
        _token: invite.token,
      } as never);
      if (error) throw error;
      toast({ title: "Invite revoked", description: "That legacy token can no longer be used." });
      void loadInvites();
    } catch {
      toast({
        title: "Couldn't revoke",
        description: "The record was not changed. Refresh or try again.",
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Ticket}
        eyebrow="Platform"
        title="Invites"
        description="Prospect plan invitations are paused while Paige Solo Beta is the only public enrollment path."
      />

      <SectionCard
        title="Solo-only enrollment is in effect"
        description="New customers enroll through the fixed Solo Beta offer: a 30-day trial, then $74.50/month unless canceled before the first paid renewal. Agency and other plan invitations are not available."
        icon={Ticket}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Existing invite records remain below only so they can be audited or revoked. They are not customer enrollment links.
        </p>
      </SectionCard>

      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground">Legacy invite records</h2>
        <DataTableShell
          columns={COLUMNS}
          loading={loadingList}
          isEmpty={!loadingList && invites.length === 0}
          empty={
            <EmptyState
              icon={Ticket}
              title="No legacy invites"
              description="There are no prior customer-plan invitation records to manage."
            />
          }
        >
          {invites.map((invite) => {
            const pill = statusPill(invite);
            const canRevoke = pill.label === "Enrollment paused";
            return (
              <TableRow key={invite.id || invite.token}>
                <TableCell className="font-medium text-foreground">
                  {invite.plan_name || invite.plan_slug || "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {invite.trial_period_days != null ? `${invite.trial_period_days}d` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(invite.created_at)}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(invite.expires_at)}</TableCell>
                <TableCell><StatePill state={pill.state}>{pill.label}</StatePill></TableCell>
                <TableCell>
                  {canRevoke && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke(invite)}
                      disabled={revoking === invite.token}
                      aria-label="Revoke legacy invite"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      {revoking === invite.token
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        : <Trash2 className="h-4 w-4" aria-hidden />}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </DataTableShell>
      </div>
    </PageShell>
  );
}
