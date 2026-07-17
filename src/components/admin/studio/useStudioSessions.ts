// The projects-gallery data hook (Slice 2).
//
// A thin adapter the Studio HOME consumes: it re-fetches list_studio_sessions when the tenant or
// the filter VIEW changes, and flips a star optimistically through the seam. It holds NO
// Supabase — every call bottoms out in studio.ts (§10, the one callable seam), so the gallery
// and Paige read/write sessions the identical way. Failure-safe: a list error surfaces as a
// message the page can render, never an unhandled throw; an optimistic star that the server
// rejects rolls back and re-syncs.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isStudioError,
  listStudioSessions,
  renameStudioSession,
  setSessionStarred,
  setSessionStatus,
} from "./studio";
import type { StudioSessionCard, StudioSessionView } from "./studio-types";

export interface UseStudioSessions {
  sessions: StudioSessionCard[];
  loading: boolean;
  error: string | null;
  toggleStar: (id: string) => void;
  /** Rename a project. Optimistic; the promise REJECTS on failure (after rolling the title
   *  back) so the caller can surface the real error (§13). */
  rename: (id: string, title: string) => Promise<void>;
  /** Delete a project — RECOVERABLE (archives it; it drops out of every gallery view and can be
   *  restored). Optimistic remove; the promise REJECTS on failure after restoring the card at its
   *  original position, so the gallery never lies that it's gone (§13). */
  remove: (id: string) => Promise<void>;
  refresh: () => void;
}

export function useStudioSessions(
  tenantId: string | null,
  view: StudioSessionView,
): UseStudioSessions {
  const [sessions, setSessions] = useState<StudioSessionCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped by refresh() and every view/tenant change; guards against a stale in-flight response
  // painting over a newer one when the operator flips filters quickly.
  const [nonce, setNonce] = useState(0);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!tenantId) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    const runId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    let live = true;
    listStudioSessions({ tenantId, view })
      .then((rows) => {
        if (!live || runId !== runIdRef.current) return;
        setSessions(rows);
      })
      .catch((err) => {
        if (!live || runId !== runIdRef.current) return;
        setSessions([]);
        setError(
          isStudioError(err) ? err.message : "Couldn't load your projects. Try again in a moment.",
        );
      })
      .finally(() => {
        if (!live || runId !== runIdRef.current) return;
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [tenantId, view, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const toggleStar = useCallback(
    (id: string) => {
      if (!tenantId) return;
      const current = sessions.find((s) => s.id === id);
      if (!current) return;
      const next = !current.starred;
      // Optimistic: flip locally now, reconcile (or roll back) once the server answers.
      setSessions((list) => list.map((s) => (s.id === id ? { ...s, starred: next } : s)));
      void setSessionStarred({ tenantId, sessionId: id, starred: next })
        .then((meta) => {
          // In the "starred" view a just-un-starred card no longer belongs in the grid — drop it
          // in place so the view stays truthful without waiting for a manual refresh.
          if (view === "starred" && !meta.starred) {
            setSessions((list) => list.filter((s) => s.id !== id));
            return;
          }
          setSessions((list) => list.map((s) => (s.id === id ? { ...s, starred: meta.starred } : s)));
        })
        .catch(() => {
          // Roll the optimistic flip back — never leave the star lying about server state (§13).
          setSessions((list) => list.map((s) => (s.id === id ? { ...s, starred: current.starred } : s)));
        });
    },
    [tenantId, sessions, view],
  );

  const rename = useCallback(
    async (id: string, title: string): Promise<void> => {
      if (!tenantId) return;
      const clean = title.trim();
      if (!clean) return;
      const current = sessions.find((s) => s.id === id);
      if (!current || current.title === clean) return;
      const previous = current.title;
      // Optimistic: show the new name now, reconcile from the server row (or roll back) after.
      setSessions((list) => list.map((s) => (s.id === id ? { ...s, title: clean } : s)));
      try {
        const meta = await renameStudioSession({ tenantId, sessionId: id, title: clean });
        setSessions((list) => list.map((s) => (s.id === id ? { ...s, title: meta.title } : s)));
      } catch (err) {
        setSessions((list) => list.map((s) => (s.id === id ? { ...s, title: previous } : s)));
        throw err;
      }
    },
    [tenantId, sessions],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!tenantId) return;
      const index = sessions.findIndex((s) => s.id === id);
      if (index === -1) return;
      const removed = sessions[index];
      // Optimistic: drop the card now; the row is only archived on the server, so nothing is lost
      // even if the reconcile races. Restore it at its original slot if the server rejects (§13).
      setSessions((list) => list.filter((s) => s.id !== id));
      try {
        await setSessionStatus({ tenantId, sessionId: id, status: "archived" });
      } catch (err) {
        setSessions((list) => {
          if (list.some((s) => s.id === id)) return list; // a refresh already re-added it
          const next = [...list];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
        throw err;
      }
    },
    [tenantId, sessions],
  );

  return { sessions, loading, error, toggleStar, rename, remove, refresh };
}
