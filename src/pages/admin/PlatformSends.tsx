/**
 * Platform → Sends & Tier (God).
 *
 * The observability payoff of the Tier Rail Spine (Phase C): every outbound
 * invite/email across the fleet, each stamped with the tier it went out AS —
 * answering the operator's question directly: "is this going out as a client, a
 * tenant, a sub-account, or an agency?"
 *
 * §9 isolation: rows come ONLY from operator_tier_send_feed(), which scopes by the
 * caller's own tier server-side (god → all sends; agency → its own + subaccounts;
 * tenant → its own). §11: built on the shared primitives; tier reads as a quiet
 * label, never gold — gold is reserved for act/approve/on. §2: tier vocabulary is
 * god/agency/tenant/subaccount/client only; no backend table names are shown.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send, Radio } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  PageShell, PageHeader, DataTableShell, EmptyState, Toolbar, FilterChip, type Column,
} from "@/components/ui/page";

type SendRow = {
  source_table: string;
  send_id: string;
  origin_account_id: string | null;
  origin_tier: string | null;
  actor_tier: string | null;
  target_tier: string | null;
  kind_or_role: string | null;
  recipient_email: string | null;
  status: string | null;
  created_at: string;
};

// Operator-facing channel labels — never the backend table name (§2/§11).
const CHANNEL_LABEL: Record<string, string> = {
  tenant_invite_tokens: "Invite link",
  invitations: "Staff invite",
  platform_invites: "Platform invite",
  email_send_log: "Email",
};

const TIER_LABEL: Record<string, string> = {
  god: "Operator",
  agency: "Agency",
  tenant: "Tenant",
  subaccount: "Sub-account",
  client: "Client",
};

const TIER_FILTERS = ["all", "client", "tenant", "subaccount", "agency", "god"] as const;
type TierFilter = (typeof TIER_FILTERS)[number];

function TierTag({ tier, fallback = "—" }: { tier: string | null; fallback?: string }) {
  if (!tier) return <span className="text-xs uppercase tracking-wide text-muted-foreground">{fallback}</span>;
  return (
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {TIER_LABEL[tier] ?? "Other"}
    </span>
  );
}

export default function PlatformSends() {
  const [tier, setTier] = useState<TierFilter>("all");

  const feedQ = useQuery({
    queryKey: ["operator_tier_send_feed", tier],
    queryFn: async (): Promise<SendRow[]> => {
      const { data, error } = await supabase.rpc(
        "operator_tier_send_feed" as never,
        { _tier: tier === "all" ? null : tier } as never,
      );
      if (error) throw error;
      return (data ?? []) as SendRow[];
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const rows = feedQ.data ?? [];

  const columns: Column[] = [
    { key: "channel", header: "Channel" },
    { key: "origin", header: "From (origin)" },
    { key: "actor", header: "Sent as" },
    { key: "target", header: "To (tier)" },
    { key: "recipient", header: "Recipient" },
    { key: "status", header: "Status" },
    { key: "when", header: "When" },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Send}
        title="Sends & Tier"
        description="Every invite and email going out across the fleet — and the tier it went out as. Client-portal sends, tenant sends, sub-account sends, and agency sends, told apart."
      />

      <Toolbar>
        <div className="flex flex-wrap gap-2">
          {TIER_FILTERS.map((t) => (
            <FilterChip
              key={t}
              active={tier === t}
              onClick={() => setTier(t)}
            >
              {t === "all" ? "All tiers" : TIER_LABEL[t]}
            </FilterChip>
          ))}
        </div>
      </Toolbar>

      <DataTableShell
        columns={columns}
        loading={feedQ.isLoading}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState
            icon={Radio}
            title={tier === "all" ? "No sends yet" : `No ${TIER_LABEL[tier]?.toLowerCase()} sends`}
            description="Every invite or email that goes out is stamped with its origin tier and lands here. Nothing has gone out in this window yet."
          />
        }
      >
        {rows.map((r) => (
          <TableRow key={`${r.source_table}-${r.send_id}`}>
            <TableCell className="font-medium">{CHANNEL_LABEL[r.source_table] ?? "Send"}</TableCell>
            <TableCell><TierTag tier={r.origin_tier ?? r.actor_tier} fallback="System" /></TableCell>
            <TableCell><TierTag tier={r.actor_tier} fallback="System" /></TableCell>
            <TableCell><TierTag tier={r.target_tier} /></TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.recipient_email ?? "—"}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.status ?? "—"}</TableCell>
            <TableCell className="text-sm tabular-nums text-muted-foreground">
              {r.created_at ? formatDistanceToNow(new Date(r.created_at), { addSuffix: true }) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </DataTableShell>

      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Most recent {rows.length}{rows.length >= 500 ? " (capped at 500)" : ""} sends from the last 30 days.
          System/platform emails (no tenant of origin) show as “System”.
        </p>
      )}
    </PageShell>
  );
}
