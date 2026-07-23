// Setup › Legal (1c-xi) — the Legal/Compliance home. An inner segmented Tabs
// switches between the tenant's Client Agreement (the signable terms) and the
// Templates library. Both mounted pages are propless and self-saving; each reads
// RLS-tenant-scoped (§9, no client tenant_id). §11 lean plain header, no hero.
import { Scale } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell, PageHeader } from "@/components/ui/page";
import AgreementAdmin from "@/pages/admin/AgreementAdmin";
import AgreementsAdmin from "@/pages/admin/AgreementsAdmin";

export default function SetupLegal() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Scale}
        eyebrow="Legal & Compliance"
        title="Legal"
        description="Your client agreement and templates — your language, Paige fills the rest for every client."
      />

      <Tabs defaultValue="agreement" className="space-y-4">
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
