// The projects-gallery data hook (Slice 2).
//
// A thin adapter the Studio HOME consumes: it re-fetches list_studio_sessions when the tenant or
// the filter VIEW changes, and flips a star optimistically through the seam. It holds NO
// Supabase — every call bottoms out in studio.ts (§10, the one callable seam), so the gallery
// and Paige read/write sessions the identical way. Failure-safe: a list error surfaces as a
// message the page can render, never an unhandled throw; an optimistic star that the server
// rejects rolls back and re-syncs.
import { useCallback, useEffect, useRef, useState } from "react";
import { isStudioError, listStudioSessions, setSessionStarred } from "./studio";
import type { StudioSessionCard, StudioSessionView } from "./studio-types";

export interface UseStudioSessions {
  sessions: StudioSessionCard[];
  loading: boolean;
  error: string | null;
  toggleStar: (id: string) => void;
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

  return { sessions, loading, error, toggleStar, refresh };
}
