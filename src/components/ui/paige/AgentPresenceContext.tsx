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
 * Resolve the initial expanded state from persisted prefs (spec §8.1). Reads the
 * remembered collapsed flag; if the user is still inside their first N sessions the
 * rail opens regardless (onboarding + intuitiveness, §36). Runs once at mount.
 */
function resolveInitialExpanded(): boolean {
  const priorCount = Number(safeGet(SESSION_COUNT_KEY) ?? "0") || 0;
  // Count THIS session once (guarded by the ref in the provider so StrictMode's
  // double-invoke can't double-count).
  const withinOnboarding = priorCount < OPEN_FOR_FIRST_N_SESSIONS;
  if (withinOnboarding) return true;
  // Past onboarding → honor the remembered choice; default collapsed (non-intrusive, §11).
  return safeGet(COLLAPSED_KEY) === "false";
}

export function AgentPresenceProvider({ children }: { children: ReactNode }) {
  const [railExpanded, setRailExpanded] = useState<boolean>(resolveInitialExpanded);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const countedRef = useRef(false);

  // Count this session exactly once (spec §8.1 onboarding window). StrictMode
  // mounts twice in dev — the ref makes the increment idempotent per real session.
  useEffect(() => {
    if (countedRef.current) return;
    countedRef.current = true;
    const priorCount = Number(safeGet(SESSION_COUNT_KEY) ?? "0") || 0;
    safeSet(SESSION_COUNT_KEY, String(priorCount + 1));
  }, []);

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

  // Universal ⌘K / Ctrl+K launcher (spec §5, §36). Ignored when the user is typing
  // into a field UNLESS they hold the modifier — the modifier is the whole point of a
  // global shortcut, so ⌘K fires even from inside an input. Escape is owned by the
  // launcher's own dialog, not here.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setLauncherOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
