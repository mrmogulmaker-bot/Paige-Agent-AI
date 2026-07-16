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
import { lazy, Suspense } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { isStudioMode, type StudioMode } from "@/components/admin/studio/studio-types";

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
  // The seed brief the HOME composer passed on navigation — a fast-path seed only; the DURABLE
  // brief is the session's own seed_brief, which StudioShell reads from the row (blocking #4).
  const location = useLocation();
  const initialBrief = (location.state as { brief?: string } | null)?.brief;

  // ?mode= picks the output (page|funnel|form|copy|image); defaults to page. ?pageId= opens a
  // specific page's draft (deep-links WITHIN a session still work). Both mirror the exact
  // contract the Campaigns tab owned before — untouched by the session split.
  const modeParam = params.get("mode");
  const mode: StudioMode = isStudioMode(modeParam) ? modeParam : "page";
  const pageId = params.get("pageId") ?? undefined;

  const setMode = (next: StudioMode) => {
    const p = new URLSearchParams(params);
    p.set("mode", next);
    // A mode switch is not a new history entry — the operator is refining one session.
    setParams(p, { replace: true });
  };

  return (
    <Suspense fallback={<StudioSkeleton />}>
      <StudioShell
        sessionId={sessionId}
        initialBrief={initialBrief}
        mode={mode}
        onModeChange={setMode}
        pageId={pageId}
      />
    </Suspense>
  );
}
