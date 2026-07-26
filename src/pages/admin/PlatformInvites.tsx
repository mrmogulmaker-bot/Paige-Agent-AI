import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Sparkles, Ticket, Trash2 } from "lucide-react";
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
 * /admin/platform/invites — the operator's invite generator (B-Platform-v2, §9 God-level).
 *
 * A super-admin picks a plan (Solo / Agency), clicks Generate → create_platform_invite,
 * and gets a copyable paigeagent.ai/get-started?invite=<token> link to hand to a prospect.
 * The prospect consumes it on the public /get-started page; the checkout webhook provisions
 * a tenant they own. This surface is operator-only (guarded by PlatformStaffOnly in the
 * route) — no tenant ever sees it.
 *
 * §36 obvious with zero docs: one plan picker, one Generate act, the link right there with
 * a copy button, the live invites in a table below with a one-click revoke.
 * §11 gold ONLY on the Generate act; the copy/revoke are neutral; StatePill carries status.
 * §13 nothing rendered that the RPC didn't return.
 *
 * Slug note: mirrors the DB-true plan slugs after the 1-A rename (solo / agency). Enterprise
 * is contact-sales (custom price) and is intentionally NOT invite-generatable here.
 */

const PLAN_OPTIONS = [
  { slug: "solo", name: "Solo", price: "$149/mo" },
  { slug: "agency", name: "Agency", price: "$397/mo" },
] as const;

const TRIAL_DAYS = 30;

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

function inviteUrl(token: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://paigeagent.ai";
  return `${origin}/get-started?invite=${token}`;
}

function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Map an invite's lifecycle to a StatePill (never gold — gold is the Generate act). */
function statusPill(inv: PlatformInvite): { state: PillState; label: string } {
  if (inv.consumed_at || inv.status === "consumed") return { state: "off", label: "Consumed" };
  if (inv.status === "revoked") return { state: "error", label: "Revoked" };
  if (inv.status === "expired") return { state: "off", label: "Expired" };
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now())
    return { state: "off", label: "Expired" };
  return { state: "success", label: "Active" };
}

const COLUMNS: Column[] = [
  { key: "plan", header: "Plan" },
  { key: "trial", header: "Trial", numeric: true },
  { key: "created", header: "Created" },
  { key: "expires", header: "Expires" },
  { key: "status", header: "Status" },
  { key: "actions", header: "", className: "w-px" },
];

export default function PlatformInvites() {
  const { toast } = useToast();

  const [planSlug, setPlanSlug] = useState<(typeof PLAN_OPTIONS)[number]["slug"]>("solo");
  const [generating, setGenerating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copiedFresh, setCopiedFresh] = useState(false);

  const [invites, setInvites] = useState<PlatformInvite[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data, error } = await supabase.rpc("list_platform_invites" as never);
      if (error) throw error;
      const rows = (Array.isArray(data) ? data : []) as PlatformInvite[];
      setInvites(rows);
    } catch {
      toast({
        title: "Couldn't load invites",
        description: "Refresh to try again — your live invites will reappear.",
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

  const generate = async () => {
    setGenerating(true);
    setCopiedFresh(false);
    try {
      const { data, error } = await supabase.rpc("create_platform_invite" as never, {
        _plan_slug: planSlug,
        _trial_period_days: TRIAL_DAYS,
      } as never);
      if (error) throw error;
      // create_platform_invite RETURNS text (a SCALAR token) — supabase-js hands it
      // back as a plain string. Read it directly; tolerate an array/object shape only
      // defensively so a future RETURNS TABLE change wouldn't silently break this.
      const raw = Array.isArray(data) ? data[0] : data;
      const newToken =
        typeof raw === "string"
          ? raw
          : raw && typeof raw === "object"
            ? (raw as { token?: string }).token
            : undefined;
      if (!newToken) throw new Error("no_token");
      setFreshToken(newToken);
      // Best-effort auto-copy so the operator can paste immediately (§36).
      try {
        await navigator.clipboard.writeText(inviteUrl(newToken));
        setCopiedFresh(true);
      } catch {
        /* clipboard optional — the field + copy button still work */
      }
      toast({ title: "Invite ready", description: "The link is copied and ready to send." });
      void loadInvites();
    } catch {
      toast({
        title: "Couldn't generate invite",
        description: "Something went wrong creating the link. Try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = async (token: string, markFresh = false) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      if (markFresh) setCopiedFresh(true);
      toast({ title: "Copied", description: "Invite link copied to your clipboard." });
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select the link and copy it manually.",
        variant: "destructive",
      });
    }
  };

  const revoke = async (inv: PlatformInvite) => {
    setRevoking(inv.token);
    try {
      const { error } = await supabase.rpc("revoke_platform_invite" as never, {
        _token: inv.token,
      } as never);
      if (error) throw error;
      if (freshToken === inv.token) setFreshToken(null);
      toast({ title: "Invite revoked", description: "That link no longer works." });
      void loadInvites();
    } catch {
      toast({
        title: "Couldn't revoke",
        description: "The invite is still active. Try again.",
        variant: "destructive",
      });
    } finally {
      setRevoking(null);
    }
  };

  const activePlanName = useMemo(
    () => PLAN_OPTIONS.find((p) => p.slug === planSlug)?.name ?? "",
    [planSlug],
  );

  const isEmpty = !loadingList && invites.length === 0;

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Ticket}
        eyebrow="Platform"
        title="Invites"
        description="Generate a private invite link for a prospect. They set up their own workspace on the plan you choose — trial included."
      />

      {/* Generator */}
      <SectionCard
        title="New invite"
        description="Pick a plan and generate a link to send. Each link works once."
        icon={Sparkles}
      >
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plan
            </div>
            <div className="flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((p) => {
                const selected = p.slug === planSlug;
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => setPlanSlug(p.slug)}
                    aria-pressed={selected}
                    className={[
                      "rounded-[var(--radius)] border px-4 py-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-muted/40",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-semibold text-foreground">
                        {p.name}
                      </span>
                      {selected && <Check className="h-4 w-4 text-primary" aria-hidden />}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">{p.price}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="gold" onClick={generate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-4 w-4" aria-hidden />
                  Generate invite
                </>
              )}
            </Button>
            <span className="text-sm text-muted-foreground">
              {activePlanName} · {TRIAL_DAYS}-day trial
            </span>
          </div>

          {freshToken && (
            <div className="rounded-[var(--radius)] border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Share this link
                </span>
                <StatePill state="success">Ready</StatePill>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={inviteUrl(freshToken)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full flex-1 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  aria-label="Invite link"
                />
                <Button
                  variant="outline"
                  onClick={() => copyLink(freshToken, true)}
                  className="shrink-0"
                >
                  {copiedFresh ? (
                    <>
                      <Check className="mr-1 h-4 w-4" aria-hidden />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-4 w-4" aria-hidden />
                      Copy link
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Live invites */}
      <div className="space-y-3">
        <h2 className="font-display text-base font-semibold text-foreground">Live invites</h2>
        <DataTableShell
          columns={COLUMNS}
          loading={loadingList}
          isEmpty={isEmpty}
          empty={
            <EmptyState
              icon={Ticket}
              title="No invites yet"
              description="Generate your first invite above and it will show up here."
            />
          }
        >
          {invites.map((inv) => {
            const pill = statusPill(inv);
            const canRevoke = pill.label === "Active";
            const rowKey = inv.id || inv.token;
            return (
              <TableRow key={rowKey}>
                <TableCell className="font-medium text-foreground">
                  {inv.plan_name ||
                    PLAN_OPTIONS.find((p) => p.slug === inv.plan_slug)?.name ||
                    inv.plan_slug ||
                    "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {inv.trial_period_days != null ? `${inv.trial_period_days}d` : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(inv.created_at)}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(inv.expires_at)}</TableCell>
                <TableCell>
                  <StatePill state={pill.state}>{pill.label}</StatePill>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(inv.token)}
                      aria-label="Copy invite link"
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                    </Button>
                    {canRevoke && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revoke(inv)}
                        disabled={revoking === inv.token}
                        aria-label="Revoke invite"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {revoking === inv.token ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </DataTableShell>
      </div>
    </PageShell>
  );
}
