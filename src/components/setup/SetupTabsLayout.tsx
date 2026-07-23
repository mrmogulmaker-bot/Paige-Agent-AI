// Path-nested layout for the Setup container (IA slice 1c-xi). MIRRORS
// ClientsTabsLayout: the parent route renders ONLY the sub-tab strip + <Outlet/>
// (no container-level PageHeader) — each child owns its own compact header, so the
// strip IS the container header and we never double-stack (§11 vertical space).
// Gates stay on each child route, never here — this layout is intentionally
// ungated (SetupSubTabs is itself gate-aware, so it hides the tabs a viewer can't
// reach). Eager-importable — small chrome, no heavy deps.
import { Outlet } from "react-router-dom";
import { SetupSubTabs } from "./SetupSubTabs";

export default function SetupTabsLayout() {
  // Cancel <main>'s p-3/4/6 so the strip is flush, then re-add that padding for the
  // PageShell children below. Every Setup child is a normal PageShell page (none is
  // the full-bleed chat case), so no isChat branch is needed.
  return (
    <div className="flex h-full min-h-0 flex-col -mx-3 -my-3 sm:-mx-4 sm:-my-4 md:-mx-6 md:-my-6">
      <SetupSubTabs />
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <Outlet />
      </div>
    </div>
  );
}
