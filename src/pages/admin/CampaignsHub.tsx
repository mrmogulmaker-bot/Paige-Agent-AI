// Campaigns Hub — single home for outbound marketing & acquisition.
// Folds the legacy "Growth OS" (Pages / Funnels / Forms / Submissions / External Sources)
// under Campaigns so the top-bar stays lean. All data continues to flow live from
// Supabase (growth_* + tenant-campaigns bridge), keyed to the active tenant — coaches /
// admins / clients still see exactly what their RLS policies allow.
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, LayoutGrid, GitBranch, FileText, Inbox, Plug, Sparkles, Palette, Share2, Facebook, Youtube, Linkedin, Wand2 } from "lucide-react";
import { PageShell, PageHeader, EmptyState, StatePill } from "@/components/ui/page";
import { CampaignsOverviewStats } from "@/components/admin/campaigns/CampaignsOverviewStats";

const CampaignsOverview = lazy(() => import("@/pages/admin/CampaignsAdmin"));
const GrowthHub = lazy(() => import("@/pages/admin/GrowthHub"));
const ContentStudio = lazy(() =>
  import("@/components/admin/content/ContentStudio").then((m) => ({ default: m.ContentStudio })),
);
const BrandKitPanel = lazy(() =>
  import("@/components/admin/brand/BrandKitPanel").then((m) => ({ default: m.BrandKitPanel })),
);
// The Vibe Studio: describe the page, watch Paige build it in the real renderer, publish it.
const StudioShell = lazy(() =>
  import("@/components/admin/studio").then((m) => ({ default: m.StudioShell })),
);

const GROWTH_TABS = new Set(["pages", "funnels", "forms", "integrations"]);


export default function CampaignsHub() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const isGrowth = GROWTH_TABS.has(tab);

  const setTab = (next: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: false });
  };

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Growth & Acquisition"
        title="Campaigns"
        icon={Megaphone}
        description="Live campaigns, landing pages, funnels, forms, and external builder bridges — all wired into contacts, pipeline, and Paige workflows in real time."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview"><Megaphone className="w-4 h-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="content"><Sparkles className="w-4 h-4 mr-1.5" />Content Studio</TabsTrigger>
          <TabsTrigger value="studio"><Wand2 className="w-4 h-4 mr-1.5" />Vibe Studio</TabsTrigger>
          <TabsTrigger value="brand"><Palette className="w-4 h-4 mr-1.5" />Brand Kit</TabsTrigger>
          <TabsTrigger value="social"><Share2 className="w-4 h-4 mr-1.5" />Social</TabsTrigger>
          <TabsTrigger value="pages"><LayoutGrid className="w-4 h-4 mr-1.5" />Pages</TabsTrigger>
          <TabsTrigger value="funnels"><GitBranch className="w-4 h-4 mr-1.5" />Funnels</TabsTrigger>
          <TabsTrigger value="forms"><FileText className="w-4 h-4 mr-1.5" />Forms</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="w-4 h-4 mr-1.5" />External Builders</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <CampaignsOverviewStats />
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading campaigns…</div>}>
            <CampaignsOverview />
          </Suspense>
        </TabsContent>

        <TabsContent value="content" className="mt-4">
          <Suspense fallback={
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
              <div className="h-72 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40" />
              <div className="h-72 animate-pulse rounded-[var(--radius)] border border-border bg-muted/40" />
            </div>
          }>
            <ContentStudio />
          </Suspense>
        </TabsContent>

        <TabsContent value="studio" className="mt-4">
          <Suspense fallback={
            <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
              <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
              <div className="h-96 animate-pulse rounded-xl border border-border bg-muted/40 motion-reduce:animate-none" />
            </div>
          }>
            <StudioShell embedded />
          </Suspense>
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


        {/* Growth tabs share GrowthHub's existing UI, which reads the same ?tab= param. */}
        {isGrowth && (
          <div className="mt-4">
            <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
              <GrowthHub embedded />
            </Suspense>
          </div>
        )}
      </Tabs>
    </PageShell>
  );
}
