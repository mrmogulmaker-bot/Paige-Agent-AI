// Pathless layout for the Conversations container (Cowork #127 feature #3). A pathless
// <Route> adds NO url segment, so the index child resolves BYTE-IDENTICAL to today's
// /admin/clients-hub/conversations — every existing link/caller still lands on the inbox
// (§37). It renders ONLY the sub-tab strip + <Outlet/> (no PageHeader — the inbox and each
// stub own their own header, §11/§27), so we never double-stack.
//
// This sits INSIDE ClientsTabsLayout's already-padded content well. The inbox constrains
// this entire chain and delegates scrolling to its three pane bodies; sibling conversation
// tools keep natural page scrolling. This preserves one viewport owner and avoids nested
// scroll containers or brittle viewport-height subtraction.
import { Outlet, useLocation } from "react-router-dom";
import { ConversationsSubTabs } from "./ConversationsSubTabs";
import { cn } from "@/lib/utils";

export default function ConversationsTabsLayout() {
  const { pathname } = useLocation();
  const isInbox = pathname === "/admin/clients-hub/conversations";

  return (
    <div className={cn("flex h-full min-h-0 flex-col", isInbox && "overflow-hidden")}>
      <ConversationsSubTabs />
      <div className={cn("min-h-0 flex-1", isInbox ? "overflow-hidden" : "overflow-y-auto")}>
        <Outlet />
      </div>
    </div>
  );
}
