import { useEffect, useState } from "react";
import type { CommandCenterView } from "@/lib/roleViews/commandCenterRegistry";

// Persist the Command Center My/Team/Business view per user, mirroring the proven
// RoleLensContext localStorage shape (lazy-init → snap-to-valid → write-on-change).
// Pure UI preference; RLS + the tenant-scoped RPCs still enforce real access.
const STORAGE_KEY = "paige_command_center_view";

export function useCommandCenterView(available: CommandCenterView[], fallback: CommandCenterView) {
  const [view, setViewState] = useState<CommandCenterView>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as CommandCenterView | null;
      // Only accept a saved value the current persona can actually switch to —
      // avoids a one-frame mislabeled chip when a stale value (e.g. "team") is
      // no longer available.
      if (saved && available.includes(saved)) return saved;
    } catch { /* storage unavailable — fall through */ }
    return fallback;
  });

  // Snap to a valid view when the persona's available set changes.
  useEffect(() => {
    if (available.length === 0) return;
    if (!available.includes(view)) setViewState(available[0]);
  }, [available, view]);

  const setView = (next: CommandCenterView) => {
    setViewState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* non-fatal */ }
  };

  return { view, setView, canSwitch: available.length > 1 };
}
