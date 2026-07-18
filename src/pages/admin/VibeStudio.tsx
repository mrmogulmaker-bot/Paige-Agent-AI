// Vibe Studio — the platform's own full-page, conversational creation surface.
//
// This is the SAME StudioShell that used to live boxed inside Campaigns (?tab=studio); §18
// says one capability, one home, so the Campaigns tab now REDIRECTS here and this route is the
// single mount. Mounted NON-embedded, StudioShell renders its own immersive full-height frame
// (PageShell width="full"), and AdminLayout drops its content padding on /admin/studio so the
// workspace runs edge-to-edge like Lovable / GHL's AI Studio — not a panel trapped in the app.
//
// StudioShell is controlled on `mode` (the parent owns the ?mode= param so every output stays
// deep-linkable), so this page owns that URL state exactly the way CampaignsHub did — nothing
// about the builder itself changed, only where it lives. The sessions/projects home (Recently
// viewed / My / Starred / Templates) + resume-a-session land in the next slice; today this is
// the promotion: its own top-level, full-page room.
import { lazy, Suspense, useCallback, useMemo } from "react";
import { useLocation, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { isStudioMode, type SessionArtifactKind, type StudioMode } from "@/components/admin/studio/studio-types";
import type { ActiveStudioSession } from "@/components/admin/studio/useActiveStudioSession";

// #290 — ?open=<kind>:<id> asks the shell to reopen a SAVED artifact from the project rail onto the
// #292 canvas. Validated so a hand-typed junk param is simply ignored (undefined), never a throw.
const OPEN_KINDS = new Set<SessionArtifactKind>(["page", "form", "funnel", "content"]);
function parseOpenRef(raw: string | null): { kind: SessionArtifactKind; id: string } | undefined {
  if (!raw) return undefined;
  const i = raw.indexOf(":");
  if (i <= 0) return undefined;
  const kind = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (!id || !OPEN_KINDS.has(kind as SessionArtifactKind)) return undefined;
  return { kind: kind as SessionArtifactKind, id };
}

// Same lazy split the hub used — the heavy Studio bundle only loads on this route.
const StudioShell = lazy(() =>
  import("@/components/admin/studio").then((m) => ({ default: m.StudioShell })),
);

function StudioSkeleton() {
  // Themed skeleton (never a live-but-inert composer, and never a bare "Loading…"): mirrors
  // StudioFrame's masthead strip + rail + drafting well so the surface doesn't flatten then pop.
  return (
    <div className="dark flex h-full min-h-[620px] flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="h-14 shrink-0 border-b border-border bg-card" />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="border-b border-border p-4 lg:w-[380px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
        </div>
        <div className="flex-1 bg-muted/30 p-4 md:p-6">
          <div className="h-full min-h-[16rem] animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}

export default function VibeStudio() {
  const [params, setParams] = useSearchParams();
  // The builder is opened FOR a session (Slice 2): /admin/studio/:sessionId. StudioShell touches
  // recency on mount and hydrates the session's primary artifact (§10/§19).
  const { sessionId } = useParams();
  // The shared active-session bundle StudioLayout loaded (Slice 1b). We hand its `applyMeta` to
  // the shell so every artifact the shell links/renames flows straight back to the rail's project
  // navigator — one source of truth, no split (see useActiveStudioSession's doc).
  const activeSession = useOutletContext<ActiveStudioSession | null>();
  // The seed brief the HOME composer passed on navigation — a fast-path seed only; the DURABLE
  // brief is the session's own seed_brief, which StudioShell reads from the row (blocking #4).
  const location = useLocation();
  const navState = location.state as { brief?: string; autostart?: boolean } | null;
  const initialBrief = navState?.brief;
  // The Home composer already "sent" the brief (Defect 1): when this is set the shell auto-fires
  // the build on arrival instead of waiting for a second submit. Absent on a deep-link/resume
  // (no nav state), so a cold entry never auto-builds.
  const autostart = navState?.autostart ?? false;

  // ?mode= picks the output (page|funnel|form|copy|image); defaults to page. ?pageId= opens a
  // specific page's draft (deep-links WITHIN a session still work). Both mirror the exact
  // contract the Campaigns tab owned before — untouched by the session split.
  const modeParam = params.get("mode");
  const mode: StudioMode = isStudioMode(modeParam) ? modeParam : "page";
  const pageId = params.get("pageId") ?? undefined;
  // Memoize on the primitive string so the shell's reopen resolver doesn't re-run every render (#290).
  const openParam = params.get("open");
  const openRef = useMemo(() => parseOpenRef(openParam), [openParam]);

  const setMode = (next: StudioMode) => {
    const p = new URLSearchParams(params);
    p.set("mode", next);
    // A mode switch is not a new history entry — the operator is refining one session.
    setParams(p, { replace: true });
  };

  // ?open is a one-shot COMMAND (#290): the shell consumes it — after it resolves the artifact onto
  // the canvas, and again if a fresh chat build supersedes it — so the URL never lies about "what's
  // open" once the canvas moves on. Clearing here (VibeStudio owns the URL) keeps the shell the sole
  // owner of canvas state (§18) — it only reads openRef and reports back that it's done with it.
  const onReopenConsumed = useCallback(() => {
    if (!params.has("open")) return;
    const p = new URLSearchParams(params);
    p.delete("open");
    setParams(p, { replace: true });
  }, [params, setParams]);

  return (
    <Suspense fallback={<StudioSkeleton />}>
      <StudioShell
        sessionId={sessionId}
        initialBrief={initialBrief}
        autostart={autostart}
        mode={mode}
        onModeChange={setMode}
        pageId={pageId}
        openRef={openRef}
        onReopenConsumed={onReopenConsumed}
        onManifestChange={activeSession?.applyMeta}
      />
    </Suspense>
  );
}
