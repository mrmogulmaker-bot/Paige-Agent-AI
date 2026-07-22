// Pathless layout for the Clients container (IA slice 1c-viii-c). MIRRORS
// PaigeTabsLayout: a pathless <Route> adds NO url segment, so every child path
// (/admin/clients-hub, .../pipeline, .../conversations, .../delivery, .../portal)
// resolves byte-identical; the five surfaces just now share one sub-tab strip.
// Gates stay on each child element, never here — this layout is intentionally
// ungated. It renders ONLY the strip + <Outlet/> (no "Clients" PageHeader): each
// child owns its own header, so the strip IS the compact container header and we
// never double-stack (§11/§27 vertical space).
import { Outlet } from "react-router-dom";
import { ClientsSubTabs } from "./ClientsSubTabs";

export default function ClientsTabsLayout() {
  // Cancel <main>'s p-3/4/6 so the strip is flush, then re-add that padding for the
  // PageShell children below. All five children are normal PageShell pages (none is
  // the full-bleed chat case), so no isChat branch is needed.
  return (
    <div className="flex h-full min-h-0 flex-col -mx-3 -my-3 sm:-mx-4 sm:-my-4 md:-mx-6 md:-my-6">
      <ClientsSubTabs />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}
