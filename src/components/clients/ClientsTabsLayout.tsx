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

  // Cancel <main>'s p-3/4/6 so the strip is flush, then re-add one padding owner
  // around the child surface. The Conversations inbox owns its scrolling inside
  // the three panes, so its well must constrain height instead of becoming a
  // competing page-level scroller. Sibling client pages keep natural scrolling.
  return (
    <div className="flex h-full min-h-0 flex-col -mx-3 -my-3 sm:-mx-4 sm:-my-4 md:-mx-6 md:-my-6">
      <ClientsSubTabs />
      <div
        className={cn(
          "min-h-0 flex-1 p-3 sm:p-4",
          isConversationsInbox ? "overflow-hidden" : "overflow-y-auto md:p-6",
        )}
      >
        <Outlet />
      </div>
    </div>
  );
}
