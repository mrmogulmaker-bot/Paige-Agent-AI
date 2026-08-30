// Setup › Legal (1c-xi) — the Legal/Compliance home. An inner segmented Tabs
// switches between the tenant's Client Agreement (the signable terms) and the
// Templates library. Both mounted pages are propless and self-saving; each reads
// RLS-tenant-scoped (§9, no client tenant_id). §11 lean plain header, no hero.
import { Scale } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell, PageHeader } from "@/components/ui/page";
import AgreementAdmin from "@/pages/admin/AgreementAdmin";
import AgreementsAdmin from "@/pages/admin/AgreementsAdmin";

/** The two inner segments, so a deep link can only ever name a real one. */
const SEGMENTS = ["agreement", "templates"] as const;
type Segment = (typeof SEGMENTS)[number];

export default function SetupLegal() {
  // A2P refuses to prepare a registration without a legal business name and sends the
  // owner here to add one. That field lives on the Templates segment, so a link with no
  // segment landed them on Client Agreement — a control that does not reach the thing it
  // names. `?tab=` is validated against the real segments; anything else falls back.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active: Segment = SEGMENTS.includes(requested as Segment) ? (requested as Segment) : "agreement";

  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Scale}
        eyebrow="Legal & Compliance"
        title="Legal"
        description="Your client agreement and templates — your language, Paige fills the rest for every client."
      />

      <Tabs
        value={active}
        onValueChange={(v) => setParams(v === "agreement" ? {} : { tab: v }, { replace: true })}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="agreement">Client Agreement</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="agreement">
          <AgreementAdmin />
        </TabsContent>
        <TabsContent value="templates">
          <AgreementsAdmin />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
