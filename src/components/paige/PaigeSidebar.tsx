// The command-center right rail (cc-spec §2). Owns the flex-col overflow
// contract: the selector (top) and Customize button (floor) never scroll away;
// only the feed in the middle scrolls. Shared by the desktop <aside> and the
// mobile PaigeRailSheet — one implementation, no re-build.
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerSelector } from "./CustomerSelector";
import { CustomerMiniCard } from "./CustomerMiniCard";
import { LiveActionFeed } from "./LiveActionFeed";
import type { FocusedClient } from "./commandCenterTypes";
import type { ApprovalQueueRow } from "@/hooks/usePendingApprovals";

interface Props {
  focused: FocusedClient | null;
  onFocus: (client: FocusedClient) => void;
  onClear: () => void;
  onCustomize: () => void;
  approvals: ApprovalQueueRow[];
  approvalsLoading: boolean;
}

export function PaigeSidebar({ focused, onFocus, onClear, onCustomize, approvals, approvalsLoading }: Props) {
  return (
    <div className="flex h-full flex-col">
      {/* Customer selector — pinned top */}
      <div className="shrink-0 border-b p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Work a customer</p>
        {focused ? (
          <CustomerMiniCard client={focused} onClear={onClear} />
        ) : (
          <>
            <CustomerSelector onSelect={onFocus} />
            <p className="text-xs text-muted-foreground">Pick someone and Paige focuses on them.</p>
          </>
        )}
      </div>

      {/* Live action feed — the only scroll region */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        <LiveActionFeed approvals={approvals} approvalsLoading={approvalsLoading} focused={focused} />
      </div>

      {/* Customize Paige — pinned floor. Gold OUTLINE (S2), never solid. */}
      <div className="shrink-0 border-t p-3">
        <Button
          onClick={onCustomize}
          variant="outline"
          className="w-full border-accent/50 text-accent hover:bg-accent/10"
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" /> Customize Paige
        </Button>
      </div>
    </div>
  );
}
