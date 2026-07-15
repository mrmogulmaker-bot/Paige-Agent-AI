// Campaigns Hub — single home for outbound marketing & acquisition.
//
// ONE creation surface: the Studio (?tab=studio&mode=page|funnel|form|copy|image) — the
// consolidated Vibe Studio, which absorbed the old Content Studio's copy/image tools.
// Pages / Funnels / Forms are LIBRARIES: the saved work lives there (edit, duplicate,
// publish, recycle); their "New …" actions deep-link INTO the Studio.
//
// All data continues to flow live from Supabase (growth_* + tenant-campaigns bridge),
// keyed to the active tenant — coaches / admins / clients still see exactly what their
// RLS policies allow.
import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, LayoutGrid, GitBranch, FileText, Plug, Palette, Share2, Facebook, Youtube, Linkedin, Wand2 } from "lucide-react";
import { PageShell, PageHeader, EmptyState, StatePill } from "@/components/ui/page";
import { CampaignsOverviewStats } from "@/components/admin/campaigns/CampaignsOverviewStats";
import { isStudioMode, type StudioMode } from "@/components/admin/studio/studio-types";

const CampaignsOverview = lazy(() => import("@/pages/admin/CampaignsAdmin"));
const GrowthHub = lazy(() => import("@/pages/admin/GrowthHub"));
const BrandKitPanel = lazy(() =>
  import("@/components/admin/brand/BrandKitPanel").then((m) => ({ default: m.BrandKitPanel })),
);
// THE Studio: describe it, watch Paige's team build it in the real renderer, publish it.
const StudioShell = lazy(() =>
  import("@/components/admin/studio").then((m) => ({ default: m.StudioShell })),
);

const GROWTH_TABS = new Set(["pages", "funnels", "forms", "integrations"]);

export default function CampaignsHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") ?? "overview";
  // LEGACY ?tab=content → the consolidated Studio, landing on copy mode (the old Content
  // Studio's primary surface). Rendered as the studio tab in the SAME frame — no blank
  // flash, no 404 — while the effect below rewrites the URL.
  const tab = rawTab === "content" ? "studio" : rawTab;
  const isGrowth = GROWTH_TABS.has(tab);
  const isStudio = tab === "studio";

  // ?pageId= opens a specific page's draft in the Studio's page mode (set by "Edit in
  // Studio" on a page card). Only meaningful on the studio tab; setTab() clears it.
  const studioPageId = params.get("pageId") ?? undefined;

  const modeParam = params.get("mode");
  const mode: StudioMode = isStudioMode(modeParam)
    ? modeParam
    : rawTab === "content"
      ? "copy"
      : "page";

  useEffect(() => {
    if (rawTab !== "content") return;
    const p = new URLSearchParams(params);
    p.set("tab", "studio");
    p.set("mode", "copy");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawTab]);

  // Bumped after a Studio publish/save/create so the embedded Growth lists refetch and the
  // new asset shows up without a manual reload.
  const [growthRefresh, setGrowthRefresh] = useState(0);

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    // Studio sub-state belongs only to an active Studio session — never let it linger on
    // another tab and silently re-open work the operator has moved on from.
    if (next !== "studio") {
      p.delete("pageId");
      p.delete("mode");
    }
    setParams(p, { replace: false });
  };

  const setMode = (next: StudioMode) => {
    const p = new URLSearchParams(params);
    p.set("tab", "studio");
    p.set("mode", next);
    setParams(p, { replace: true });
  };

  return (
    <PageShell width="wide">
      {/* The Studio is a full-height workspace — the hero would push it below the fold. */}
      {!isStudio && (
        <PageHeader
          variant="hero"
          eyebrow="Growth & Acquisition"
          title="Campaigns"
          icon={Megaphone}
          description="Live campaigns, landing pages, funnels, forms, and external builder bridges — all wired into contacts, pipeline, and Paige workflows in real time."
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview"><Megaphone className="w-4 h-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="studio"><Wand2 className="w-4 h-4 mr-1.5" />Studio</TabsTrigger>
          <TabsTrigger value="brand"><Palette className="w-4 h-4 mr-1.5" />Brand Kit</TabsTrigger>
          <TabsTrigger value="social"><Share2 className="w-4 h-4 mr-1.5" />Social</TabsTrigger>
          <TabsTrigger value="pages"><LayoutGrid className="w-4 h-4 mr-1.5" />Pages</TabsTrigger>
          <TabsTrigger value="funnels"><GitBranch className="w-4 h-4 mr-1.5" />Funnels</TabsTrigger>
          <TabsTrigger value="forms"><FileText className="w-4 h-4 mr-1.5" />Forms</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="w-4 h-4 mr-1.5" />External Builders</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <CampaignsOverviewStats />
          <Suspense fallback={
            <div className="h-48 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
          }>
            <CampaignsOverview />
          </Suspense>
        </TabsContent>

        <TabsContent value="studio" className="mt-4">
          {/* Full-bleed immersive workspace: fixed height at lg+ (the frame scrolls its own
              rail + canvas), natural page flow below lg — no trapped inner scroll. */}
          <div className="lg:h-[calc(100dvh-11.5rem)] lg:min-h-[640px]">
            <Suspense fallback={
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
            }>
              <StudioShell
                embedded
                mode={mode}
                onModeChange={setMode}
                pageId={studioPageId}
                onPublished={() => {
                  // The page is live now — refresh the lists and drop the operator on the
                  // Pages library so they see it published in context.
                  setGrowthRefresh((n) => n + 1);
                  setTab("pages");
                }}
                onSaved={() => setGrowthRefresh((n) => n + 1)}
                onFunnelCreated={() => {
                  setGrowthRefresh((n) => n + 1);
                  setTab("funnels");
                }}
                onFormCreated={() => {
                  setGrowthRefresh((n) => n + 1);
                  setTab("forms");
                }}
              />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="brand" className="mt-4">
          <Suspense fallback={
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
              <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
              <div className="h-80 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
            </div>
          }>
            <BrandKitPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="social" className="mt-4">
          <EmptyState
            icon={Share2}
            tone="brand"
            title="Social accounts — coming soon"
            description="Connect Facebook, Instagram, YouTube, TikTok, and LinkedIn so Paige can publish on your behalf and, down the line, help manage your DMs — all under your own brand."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <StatePill state="roadmap">On the roadmap</StatePill>
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Facebook className="h-4 w-4" /><Youtube className="h-4 w-4" /><Linkedin className="h-4 w-4" />
                </span>
              </div>
            }
          />
        </TabsContent>

        {/* Growth libraries share GrowthHub's existing UI, which reads the same ?tab= param. */}
        {isGrowth && (
          <div className="mt-4">
            <Suspense fallback={
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-28 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40 motion-reduce:animate-none" />
                ))}
              </div>
            }>
              <GrowthHub embedded refreshNonce={growthRefresh} />
            </Suspense>
          </div>
        )}
      </Tabs>
    </PageShell>
  );
}
