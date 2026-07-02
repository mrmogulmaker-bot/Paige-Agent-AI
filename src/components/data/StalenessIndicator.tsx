import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDataFreshness, formatRelativeTime } from "@/hooks/useDataFreshness";

interface Props {
  sourceKey: string;         // e.g. "stripe", "credit_provider", "ghl"
  sourceLabel: string;       // display label
  tenantId?: string | null;
  staleAfterSeconds?: number; // registry-driven TTL
}

/**
 * Ship #2.8 — "Last synced from [source] at [timestamp]" pill.
 * Cross-cutting invariant: any cached-from-external-system data must render this.
 */
export function StalenessIndicator({ sourceKey, sourceLabel, tenantId, staleAfterSeconds = 3600 }: Props) {
  const { state, loading } = useDataFreshness(sourceKey, tenantId);
  if (loading) return null;

  if (!state) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Clock className="h-3 w-3" /> {sourceLabel}: never synced
      </Badge>
    );
  }

  const ageSec = Math.floor((Date.now() - new Date(state.last_synced_at).getTime()) / 1000);
  const isStale = ageSec > staleAfterSeconds;
  const failed = state.last_sync_status !== "ok";
  const variant = failed ? "destructive" : isStale ? "outline" : "secondary";
  const Icon = failed ? AlertTriangle : isStale ? Clock : CheckCircle2;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={variant} className="gap-1 cursor-help">
            <Icon className="h-3 w-3" />
            Last synced from {sourceLabel}: {formatRelativeTime(state.last_synced_at)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div>Source: {sourceLabel}</div>
            <div>Status: {state.last_sync_status}</div>
            {state.record_count !== null && <div>Records: {state.record_count}</div>}
            {state.last_sync_error && <div className="text-destructive">Error: {state.last_sync_error}</div>}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
