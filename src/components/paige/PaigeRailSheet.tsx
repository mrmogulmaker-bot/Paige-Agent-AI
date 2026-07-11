// Mobile bottom-sheet wrapper around the SAME PaigeSidebar (cc-spec §1.5). Opened
// from the in-flow dock (never a fixed element — S5). No re-implementation of the
// rail — it hosts the identical component the desktop <aside> renders.
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PaigeSidebar } from "./PaigeSidebar";
import type { FocusedClient } from "./commandCenterTypes";
import type { ApprovalQueueRow } from "@/hooks/usePendingApprovals";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  focused: FocusedClient | null;
  onFocus: (client: FocusedClient) => void;
  onClear: () => void;
  onCustomize: () => void;
  approvals: ApprovalQueueRow[];
  approvalsLoading: boolean;
}

export function PaigeRailSheet({ open, onOpenChange, ...rail }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm">Your desk</SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          <PaigeSidebar {...rail} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
