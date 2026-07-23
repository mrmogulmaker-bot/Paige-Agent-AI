// Campaigns Hub — single home for outbound marketing & acquisition.
//
// The Vibe Studio (the conversational page/funnel/form/image builder) was PROMOTED to
// its own full-page route at /admin/studio (§18: one capability, one home). This hub no
// longer mounts it — any legacy ?tab=studio / ?tab=content link, and every library "New …"
// action, REDIRECTS to /admin/studio carrying mode + pageId through.
// Pages / Funnels / Forms remain LIBRARIES here: the saved work lives there (edit, duplicate,
// publish, recycle); their "New …" actions open the Studio on its own route.
//
// All data continues to flow live from Supabase (growth_* + tenant-campaigns bridge),
// keyed to the active tenant — coaches / admins / clients still see exactly what their
// RLS policies allow.
import { lazy, Suspense, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, LayoutGrid, GitBranch, FileText, Plug, Palette, Share2, Facebook, Youtube, Linkedin, ExternalLink } from "lucide-react";
import { PageShell, PageHeader, EmptyState, SectionCard, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { CampaignsOverviewStats } from "@/components/admin/campaigns/CampaignsOverviewStats";
import { isStudioMode, type StudioMode } from "@/components/admin/studio/studio-types";

const CampaignsOverview = lazy(() => import("@/pages/admin/CampaignsAdmin"));
const GrowthHub = lazy(() => import("@/pages/admin/GrowthHub"));
const GROWTH_TABS = new Set(["pages", "funnels", "forms", "integrations"]);

export default function CampaignsHub() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get("tab") ?? "overview";
  // LEGACY ?tab=content → the consolidated Studio, landing on image mode (the surviving Content
  // Studio creative surface, which carries the library button so legacy content users keep
  // library access). Rendered as the studio tab in the SAME frame — no blank flash, no 404 —
  // while the redirect below rewrites the URL. (Copy is no longer a Studio mode — §18/§21.)
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
      ? "image"
      : "page";

  // The embedded Growth libraries refetch on mount; the Studio now lives on its own route
  // (/admin/studio), so there is no in-hub publish to bump this — kept as a stable nonce.
  const [growthRefresh] = useState(0);

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

  // §18 — the Studio has ONE home now (/admin/studio). Any ?tab=studio (including the legacy
  // ?tab=content and every "New / Edit in Studio" deep-link from the libraries) redirects there,
  // carrying mode + pageId through so nothing that pointed at the old in-hub tab breaks.
  if (isStudio) {
    const sp = new URLSearchParams();
    sp.set("mode", mode);
    if (studioPageId) sp.set("pageId", studioPageId);
    return <Navigate to={`/admin/studio?${sp.toString()}`} replace />;
  }

  return (
    <PageShell width="wide">
      {/* The Studio is a full-height workspace — the hero would push it below the fold. */}
      {!isStudio && (
        <PageHeader
          variant="plain"
          eyebrow="Growth & Acquisition"
          title="Campaigns"
          icon={Megaphone}
          description="Live campaigns, landing pages, funnels, forms, and external builder bridges — all wired into contacts, pipeline, and Paige workflows in real time."
        />
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview"><Megaphone className="w-4 h-4 mr-1.5" />Overview</TabsTrigger>
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

        {/* Brand is canonical in Setup › Brand (§18 one home). Campaigns keeps the
            tab as a signpost so the muscle-memory link resolves, not a second editor. */}
        <TabsContent value="brand" className="mt-4">
          <SectionCard
            icon={Palette}
            title="Manage your brand in Setup"
            description="Your logo, colors, and voice now live in one place — Setup › Brand — so every page, email, and asset Paige builds is drawn from the same source."
          >
            <Button asChild>
              <Link to="/admin/setup/brand">
                Go to Brand
                <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
              </Link>
            </Button>
          </SectionCard>
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
