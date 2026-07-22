// Pathless layout for the Paige workspace group (IA slice 1c-vi). It wraps the
// EXISTING routes /admin/playbook · /admin/sub-agents · /admin/actions ·
// /admin/skills — a pathless <Route> adds NO url segment, so every one of those
// paths (and every deep-link / alias / CTA to them) resolves byte-identical; the
// four surfaces just now share one sub-tab strip. Gates stay on each child element
// (B5), never here — this layout is intentionally ungated.
import { Outlet, useLocation } from "react-router-dom";
import { PaigeSubTabs } from "./PaigeSubTabs";

export default function PaigeTabsLayout() {
  // The chat index is full-bleed and owns its own height; the three PageShell
  // pages expect the normal <main> padding, which this layout cancels below. So
  // re-add that padding for the non-chat routes only (repo precedent: AdminLayout.isStudio).
  const isChat = useLocation().pathname === "/admin/playbook";
  return (
    // Cancel <main>'s p-3/4/6 so the strip is flush and chat can fill — this is the
    // bleed PaigeWorkspace used to own itself (now one home, here).
    <div className="flex h-full min-h-0 flex-col -mx-3 -my-3 sm:-mx-4 sm:-my-4 md:-mx-6 md:-my-6">
      <PaigeSubTabs />
      <div className={isChat ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6"}>
        <Outlet />
      </div>
    </div>
  );
}
