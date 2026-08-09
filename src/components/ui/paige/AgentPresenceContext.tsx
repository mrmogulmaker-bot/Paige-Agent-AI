import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Agent-presence state (Wave 4 Slice 4a.1).
 *
 * ONE shared home for the right-rail expanded/collapsed state, the ⌘K launcher
 * open state, and the universal keyboard handler — so the rail, the launcher, and
 * the host shell (which reserves the gutter) all read the same state (§18 one home).
 *
 * COLLAPSE DEFAULT (spec §8.1 — owner-approved): docked OPEN for a user's first 3
 * sessions, then remembers the collapsed state after. This slice persists to
 * localStorage as the honest, shippable-today store; the durable seam is the
 * `paige_rail_collapsed` (bool) + session-count (int) profile-pref columns (spec
 * owed-work #6) — a later slice swaps the storage impl behind THIS same context
 * with no consumer change. Storage reads/writes fail-soft (private mode / disabled
 * storage never throws into render).
 *
 * ONBOARDING-OPEN IS GATED ON A REAL CHAT BODY (`hasChatBody`, §36/§13): docking the
 * rail OPEN onto an empty placeholder is a dead-end — there is nothing to converse
 * with yet. So the first-N-sessions auto-open (and the session counter that drives
 * it) only engage once the host passes `hasChatBody` (the shared Paige chat wires in
 * a later slice). Until then the rail defaults COLLAPSED and the presence tab is the
 * first-run invitation; the user's own explicit expand is still remembered/honored.
 *
 * ⌘K IS GATED ON `launcherEnabled` (§21): the launcher only renders on non-Studio
 * surfaces, so the global ⌘K keybinding is registered only where it can actually open
 * something. On Studio (`launcherEnabled={false}`) ⌘K is a no-op passthrough — never
 * preventDefault-swallowed into state that renders nothing (and a future Studio ⌘K is
 * left unblocked).
 */

const COLLAPSED_KEY = "paige.agentRail.collapsed";
const SESSION_COUNT_KEY = "paige.agentRail.sessionCount";
/** Docked OPEN for this many of a user's first sessions (spec §8.1). */
const OPEN_FOR_FIRST_N_SESSIONS = 3;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / disabled storage — state still lives in memory this session */
  }
}

interface AgentPresenceState {
  /** Rail expanded (chat visible) vs collapsed (thin presence tab). */
  railExpanded: boolean;
  expandRail: () => void;
  collapseRail: () => void;
  toggleRail: () => void;
  /** ⌘K launcher visibility. */
  launcherOpen: boolean;
  openLauncher: () => void;
  closeLauncher: () => void;
  setLauncherOpen: (open: boolean) => void;
}

const AgentPresenceContext = createContext<AgentPresenceState | null>(null);

/**
 * Resolve the initial expanded state from persisted prefs (spec §8.1). The onboarding
 * auto-open (first N sessions) only applies when `hasChatBody` is true — opening onto
 * an empty placeholder is a dead-end (§36/§13), so until the chat body is wired the
 * rail defaults COLLAPSED and only the user's own explicit prior expand is honored.
 * Runs once at mount.
 */
function resolveInitialExpanded(hasChatBody: boolean): boolean {
  // The user's explicit prior choice (only ever set "false" by expand/toggle).
  const remembered = safeGet(COLLAPSED_KEY) === "false";
  if (hasChatBody) {
    const priorCount = Number(safeGet(SESSION_COUNT_KEY) ?? "0") || 0;
    // Inside the onboarding window → dock OPEN regardless (intuitiveness, §36).
    if (priorCount < OPEN_FOR_FIRST_N_SESSIONS) return true;
  }
  // Past onboarding (or no chat body yet) → honor the remembered choice; default
  // collapsed (non-intrusive first-run invitation, §11).
  return remembered;
}

export function AgentPresenceProvider({
  children,
  /** False on surfaces where the launcher never renders (Studio, §21) → ⌘K passes through. */
  launcherEnabled = true,
  /**
   * True once a real Paige chat body mounts in the rail. Gates the onboarding
   * docked-open (and its session counter) so the rail never opens onto an empty
   * placeholder (§36/§13). Wires in a later slice; default false = collapsed today.
   */
  hasChatBody = false,
}: {
  children: ReactNode;
  launcherEnabled?: boolean;
  hasChatBody?: boolean;
}) {
  const [railExpanded, setRailExpanded] = useState<boolean>(() =>
    resolveInitialExpanded(hasChatBody),
  );
  const [launcherOpen, setLauncherOpen] = useState(false);
  const countedRef = useRef(false);

  // Count this session exactly once (spec §8.1 onboarding window) — but ONLY once a
  // chat body exists, so the first-N-sessions window isn't burned on empty-placeholder
  // sessions before the conversation lands (§36). StrictMode mounts twice in dev — the
  // ref makes the increment idempotent per real session.
  useEffect(() => {
    if (!hasChatBody) return;
    if (countedRef.current) return;
    countedRef.current = true;
    const priorCount = Number(safeGet(SESSION_COUNT_KEY) ?? "0") || 0;
    safeSet(SESSION_COUNT_KEY, String(priorCount + 1));
  }, [hasChatBody]);

  const expandRail = useCallback(() => {
    setRailExpanded(true);
    safeSet(COLLAPSED_KEY, "false");
  }, []);

  const collapseRail = useCallback(() => {
    setRailExpanded(false);
    safeSet(COLLAPSED_KEY, "true");
  }, []);

  const toggleRail = useCallback(() => {
    setRailExpanded((prev) => {
      const next = !prev;
      safeSet(COLLAPSED_KEY, next ? "false" : "true");
      return next;
    });
  }, []);

  const openLauncher = useCallback(() => setLauncherOpen(true), []);
  const closeLauncher = useCallback(() => setLauncherOpen(false), []);

  // Universal ⌘K / Ctrl+K launcher (spec §5, §36) — the ONE global owner of ⌘K on the
  // platform (§18; IntegrationsHub's rival listener was removed so only this fires).
  // Ignored when the user is typing into a field UNLESS they hold the modifier — the
  // modifier is the whole point of a global shortcut, so ⌘K fires even from inside an
  // input. Escape is owned by the launcher's own dialog, not here. Registered ONLY when
  // `launcherEnabled` — on Studio the handler isn't attached, so ⌘K passes through
  // untouched instead of preventDefault-swallowing into state that renders nothing (§21).
  useEffect(() => {
    if (!launcherEnabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setLauncherOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [launcherEnabled]);

  const value = useMemo<AgentPresenceState>(
    () => ({
      railExpanded,
      expandRail,
      collapseRail,
      toggleRail,
      launcherOpen,
      openLauncher,
      closeLauncher,
      setLauncherOpen,
    }),
    [railExpanded, expandRail, collapseRail, toggleRail, launcherOpen, openLauncher, closeLauncher],
  );

  return <AgentPresenceContext.Provider value={value}>{children}</AgentPresenceContext.Provider>;
}

/**
 * Read the shared agent-presence state. MUST be used under
 * {@link AgentPresenceProvider}. Throwing surfaces a mis-mount immediately rather
 * than handing back an isolated default that silently desyncs the gutter from the rail.
 */
export function useAgentPresence(): AgentPresenceState {
  const ctx = useContext(AgentPresenceContext);
  if (!ctx) {
    throw new Error("useAgentPresence must be used within an <AgentPresenceProvider>.");
  }
  return ctx;
}
