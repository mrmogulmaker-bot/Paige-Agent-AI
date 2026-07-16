// The ACTIVE-session hook — the single source of truth for one open project (Slice 1).
//
// The multi-page Studio needs the loaded session in TWO places at once: the left rail (the
// project navigator — its artifacts + facets) and the stage (the overview grid / the artifact
// editor). If each loaded independently we'd get a flicker on open AND — worse — a SPLIT source
// of truth: add/rename/unlink an artifact on the stage and the rail's copy goes stale. So this
// hook is loaded ONCE, high in the tree (StudioLayout), and the SAME bundle is handed down to
// both the rail and the stage via <Outlet context>. Every mutation RPC RETURNs the updated row;
// callers pass it to `applyMeta` so the rail and stage never diverge (§13 — the UI never lies
// about server state). It holds NO Supabase — every read bottoms out in studio.ts (§10).
import { useCallback, useEffect, useRef, useState } from "react";
import { isStudioError, loadSession, type LoadedPageDraft } from "./studio";
import type {
  SessionArtifactRef,
  StudioArtifactType,
  StudioSessionMeta,
} from "./studio-types";

export interface ActiveStudioSession {
  /** The :sessionId being resolved (echoed so consumers don't re-read the param). */
  sessionId: string;
  tenantId: string | null;
  /** The full session row, or null until the first load resolves. */
  session: StudioSessionMeta | null;
  /** The project's artifact manifest — the rail list AND the overview grid read this ONE array. */
  artifacts: SessionArtifactRef[];
  /** The hydrated PRIMARY artifact when it is a page (the canvas resume payload); null otherwise. */
  primary: LoadedPageDraft | null;
  primaryType: StudioArtifactType | null;
  loading: boolean;
  /** Operator-facing message for a soft failure (rendered, never thrown). */
  error: string | null;
  /** True on a missing / cross-tenant session — the "couldn't find that project" hard gate. */
  notFound: boolean;
  /** Re-fetch from the server (after a mutation that didn't RETURN the row, or a manual retry). */
  refresh: () => void;
  /** Optimistically replace the cached session from a mutation's RETURNed row — the rail and the
   *  stage both re-render from it, so a rename/link/unlink shows instantly without a round-trip. */
  applyMeta: (meta: StudioSessionMeta) => void;
}

const EMPTY_ARTIFACTS: SessionArtifactRef[] = [];

/**
 * Load + own the active studio session. `enabled` is false on the dashboard (no :sessionId) and
 * on `/admin/studio/new`, so the rail doesn't try to resolve a non-session route.
 */
export function useActiveStudioSession(
  tenantId: string | null,
  sessionId: string | null,
  enabled = true,
): ActiveStudioSession {
  const [session, setSession] = useState<StudioSessionMeta | null>(null);
  const [primary, setPrimary] = useState<LoadedPageDraft | null>(null);
  const [primaryType, setPrimaryType] = useState<StudioArtifactType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [nonce, setNonce] = useState(0);
  const runIdRef = useRef(0);

  const active = enabled && !!tenantId && !!sessionId;

  useEffect(() => {
    if (!active || !tenantId || !sessionId) {
      // Off a project route (or before the tenant resolves) — clear so a stale session from a
      // previous project can never bleed into the next one.
      setSession(null);
      setPrimary(null);
      setPrimaryType(null);
      setLoading(false);
      setError(null);
      setNotFound(false);
      return;
    }
    const runId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    setNotFound(false);
    let live = true;
    loadSession({ tenantId, sessionId })
      .then((loaded) => {
        if (!live || runId !== runIdRef.current) return;
        setSession(loaded.session);
        setPrimary(loaded.primary);
        setPrimaryType(loaded.primaryType);
      })
      .catch((err) => {
        if (!live || runId !== runIdRef.current) return;
        setSession(null);
        setPrimary(null);
        setPrimaryType(null);
        // NOT_FOUND is the hard "this project isn't here" gate; anything else is a soft retry.
        if (isStudioError(err) && err.code === "NOT_FOUND") {
          setNotFound(true);
        } else {
          setError(
            isStudioError(err) ? err.message : "Couldn't open that project. Try again in a moment.",
          );
        }
      })
      .finally(() => {
        if (!live || runId !== runIdRef.current) return;
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [active, tenantId, sessionId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // A mutation RETURNed the fresh row — swap it in locally so the rail + stage both re-render
  // without a second fetch. Its artifact_refs become the new manifest everything reads.
  const applyMeta = useCallback((meta: StudioSessionMeta) => {
    setSession(meta);
    setNotFound(false);
    setError(null);
  }, []);

  return {
    sessionId: sessionId ?? "",
    tenantId,
    session,
    artifacts: session?.artifacts ?? EMPTY_ARTIFACTS,
    primary,
    primaryType,
    loading,
    error,
    notFound,
    refresh,
    applyMeta,
  };
}
