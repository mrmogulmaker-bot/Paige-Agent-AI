// Pathless layout for the Conversations container (Cowork #127 feature #3). A pathless
// <Route> adds NO url segment, so the index child resolves BYTE-IDENTICAL to today's
// /admin/clients-hub/conversations — every existing link/caller still lands on the inbox
// (§37). It renders ONLY the sub-tab strip + <Outlet/> (no PageHeader — the inbox and each
// stub own their own header, §11/§27), so we never double-stack.
//
// This sits INSIDE ClientsTabsLayout's ALREADY-PADDED overflow-y-auto well, so it must NOT
// re-pad or re-add negative margins (that would double the padding). It only splits that
// well into [strip | scroll region]. The inbox (index child) returns <PageShell width="full"
// fill> and resolves h-full against the flex-1 region below — the #146 height chain holds
// (composer pinned at the true bottom, no void, internal scroll). Stubs/Snippets scroll in
// the region if long.
import { Outlet } from "react-router-dom";
import { ConversationsSubTabs } from "./ConversationsSubTabs";

export default function ConversationsTabsLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationsSubTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
