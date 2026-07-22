import { useEffect, useState } from "react";
import type { CommandCenterView } from "@/lib/roleViews/commandCenterRegistry";

// Persist the Command Center My/Team/Business view per user, mirroring the proven
// RoleLensContext localStorage shape (lazy-init → snap-to-valid → write-on-change).
// Pure UI preference; RLS + the tenant-scoped RPCs still enforce real access.
//
// storageKey defaults to the Command Center key so every existing caller is
// byte-for-byte unchanged; a second surface (e.g. the Clients container, 1c-viii-c)
// passes its own key so the two don't stomp each other's persisted choice.
const DEFAULT_STORAGE_KEY = "paige_command_center_view";

export function useCommandCenterView(
  available: CommandCenterView[],
  fallback: CommandCenterView,
  storageKey: string = DEFAULT_STORAGE_KEY,
) {
  const [view, setViewState] = useState<CommandCenterView>(() => {
    try {
      const saved = localStorage.getItem(storageKey) as CommandCenterView | null;
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
    try { localStorage.setItem(storageKey, next); } catch { /* non-fatal */ }
  };

  return { view, setView, canSwitch: available.length > 1 };
}
