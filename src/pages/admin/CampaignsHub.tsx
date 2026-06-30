// Campaigns Hub — single home for outbound marketing & acquisition.
// Folds the legacy "Growth OS" (Pages / Funnels / Forms / Submissions / External Sources)
// under Campaigns so the top-bar stays lean. All data continues to flow live from
// Supabase (growth_* + mma-campaigns bridge), keyed to the active tenant — coaches /
// admins / clients still see exactly what their RLS policies allow.
import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Megaphone, LayoutGrid, GitBranch, FileText, Inbox, Plug } from "lucide-react";
import { CampaignsOverviewStats } from "@/components/admin/campaigns/CampaignsOverviewStats";

const CampaignsOverview = lazy(() => import("@/pages/admin/CampaignsAdmin"));
const GrowthHub = lazy(() => import("@/pages/admin/GrowthHub"));

const GROWTH_TABS = new Set(["pages", "funnels", "forms", "submissions", "integrations"]);


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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="w-6 h-6" /> Campaigns
        </h1>
        <p className="text-muted-foreground text-sm">
          Outbound marketing &amp; acquisition — live campaigns, landing pages, funnels, forms,
          submissions, and external builder bridges. All wired into contacts, pipeline, and Paige
          workflows in real time.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview"><Megaphone className="w-4 h-4 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="pages"><LayoutGrid className="w-4 h-4 mr-1.5" />Pages</TabsTrigger>
          <TabsTrigger value="funnels"><GitBranch className="w-4 h-4 mr-1.5" />Funnels</TabsTrigger>
          <TabsTrigger value="forms"><FileText className="w-4 h-4 mr-1.5" />Forms</TabsTrigger>
          <TabsTrigger value="submissions"><Inbox className="w-4 h-4 mr-1.5" />Submissions</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="w-4 h-4 mr-1.5" />External Builders</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading campaigns…</div>}>
            <CampaignsOverview />
          </Suspense>
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
    </div>
  );
}
