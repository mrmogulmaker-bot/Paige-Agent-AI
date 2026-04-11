import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface SyncStatus {
  success: boolean;
  scores_synced?: { equifax?: number | null; experian?: number | null; transunion?: number | null };
  negative_items_synced?: number;
  positive_accounts_synced?: number;
  disputes_created?: number;
  credit_factors_recalculated?: boolean;
  funding_readiness_recalculated?: boolean;
  error?: string;
  step?: string;
}

interface SyncStatusPanelProps {
  syncStatus: SyncStatus | null;
  isLoading?: boolean;
}

export function SyncStatusPanel({ syncStatus, isLoading }: SyncStatusPanelProps) {
  if (isLoading) {
    return (
      <div className="bg-muted/30 border border-border rounded-lg p-3 mt-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Syncing credit data to your profile...</span>
        </div>
      </div>
    );
  }

  if (!syncStatus) return null;

  const scores = syncStatus.scores_synced;
  const items = [
    {
      label: `Scores synced${scores ? ` — EQ: ${scores.equifax || '—'} | EX: ${scores.experian || '—'} | TU: ${scores.transunion || '—'}` : ''}`,
      ok: syncStatus.success && !!scores,
    },
    {
      label: `Negative items synced (${syncStatus.negative_items_synced || 0})`,
      ok: syncStatus.success,
    },
    {
      label: `Positive accounts synced (${syncStatus.positive_accounts_synced || 0})`,
      ok: syncStatus.success,
    },
    {
      label: `Disputes created (${syncStatus.disputes_created || 0})`,
      ok: syncStatus.success,
    },
    {
      label: "Credit factors recalculated",
      ok: syncStatus.credit_factors_recalculated === true,
    },
    {
      label: "Funding readiness updated",
      ok: syncStatus.funding_readiness_recalculated === true,
    },
  ];

  return (
    <div className={`border rounded-lg p-3 mt-2 ${syncStatus.success ? 'bg-fundability-excellent/5 border-fundability-excellent/30' : 'bg-destructive/5 border-destructive/30'}`}>
      <div className="text-xs font-semibold mb-2 text-foreground">
        {syncStatus.success ? '✅ Profile Sync Complete' : '⚠️ Sync Incomplete'}
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {item.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-fundability-excellent flex-shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
            )}
            <span className={item.ok ? 'text-foreground' : 'text-destructive'}>{item.label}</span>
          </div>
        ))}
      </div>
      {syncStatus.error && (
        <div className="mt-2 text-xs text-destructive">
          Error: {syncStatus.error} {syncStatus.step ? `(step: ${syncStatus.step})` : ''}
        </div>
      )}
    </div>
  );
}
