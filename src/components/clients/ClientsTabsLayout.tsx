// Pathless layout for the Clients container (IA slice 1c-viii-c). MIRRORS
// PaigeTabsLayout: a pathless <Route> adds NO url segment, so every child path
// (/admin/clients-hub, .../pipeline, .../conversations, .../delivery, .../portal)
// resolves byte-identical; the five surfaces just now share one sub-tab strip.
// Gates stay on each child element, never here — this layout is intentionally
// ungated. It renders ONLY the strip + <Outlet/> (no "Clients" PageHeader): each
// child owns its own header, so the strip IS the compact container header and we
// never double-stack (§11/§27 vertical space).
import { Outlet, useLocation } from "react-router-dom";
import { ClientsSubTabs } from "./ClientsSubTabs";
import { cn } from "@/lib/utils";

export default function ClientsTabsLayout() {
  const { pathname } = useLocation();
  const isConversationsInbox = pathname === "/admin/clients-hub/conversations";

  // AdminLayout gives this hub the unpadded, constrained viewport well. This is
  // now the single padding owner: no negative margins, no shifted 100%-height box,
  // and no lost pixels at the bottom. The inbox delegates scrolling to its panes;
  // sibling client pages retain natural document scrolling inside this region.
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ClientsSubTabs />
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col p-3 sm:p-4",
          isConversationsInbox ? "overflow-hidden" : "overflow-y-auto md:p-6",
        )}
      >
        <Outlet />
      </div>
    </div>
  );
}
