// Setup › General (1c-xi) — the Operations home of the tenant-config consolidation.
// Absorbs the workspace, storefront, account-security, email, and notifications
// panels that used to live as tabs in the retiring AdminSettingsHub. Every panel
// is propless and self-manages its own dirty-state + Save — we just mount them.
// An inner segmented <Tabs> (the proven SetupLegal pattern) groups the panels so
// only one editor group shows at a time instead of one long scroll-wall (§11).
// §11 lean plain header, no hero; §16 department eyebrow ("Operations"); §9 every
// read stays RLS-tenant-scoped inside the panels (no client tenant_id here).
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarRange,
  Users2,
  LifeBuoy,
  Wrench,
  Landmark,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell, PageHeader, SectionCard } from "@/components/ui/page";
import { WorkspaceSettingsPanel } from "@/components/admin/WorkspaceSettingsPanel";
import { StorefrontPanel } from "@/components/admin/StorefrontPanel";
import { AccountSecurityPanel } from "@/components/settings/AccountSecurityPanel";
import { EmailDomainsPanel } from "@/components/admin/EmailDomainsPanel";
import { EmailTemplatesPanel } from "@/components/admin/settings/EmailTemplatesPanel";
import { NotificationsCommsPanel } from "@/components/admin/settings/NotificationsCommsPanel";
import { RoleGate } from "@/components/auth/RoleGate";
import { FundingGate } from "@/components/admin/FundingRoute";

function ToolLink({ to, icon: Icon, label, hint }: { to: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-4 shadow-card transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export default function SetupGeneral() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={Building2}
        eyebrow="Operations"
        title="General"
        description="Your workspace, storefront, account security, and how Paige sends email and notifications."
      />

      <Tabs defaultValue="workspace" className="space-y-4">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="more">More tools</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="space-y-8">
          <WorkspaceSettingsPanel />
          <StorefrontPanel />
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <EmailDomainsPanel />
          <EmailTemplatesPanel />
        </TabsContent>

        <TabsContent value="security">
          <AccountSecurityPanel />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsCommsPanel />
        </TabsContent>

        <TabsContent value="more">
          <SectionCard
            icon={ArrowRight}
            title="More practice tools"
            description="Other places you run your practice from — planning, referrals, and support."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <ToolLink to="/admin/planning" icon={CalendarRange} label="Planning" hint="Map out your quarter and priorities" />
              <ToolLink to="/admin/affiliates" icon={Users2} label="Referrals" hint="Your affiliate program and partners" />
              <RoleGate allow={["admin"]} fallback={<></>}>
                <ToolLink to="/admin/support" icon={LifeBuoy} label="Support" hint="Tickets and help for your practice" />
              </RoleGate>
              <RoleGate allow={["admin"]} fallback={<></>}>
                <ToolLink to="/admin/maintenance" icon={Wrench} label="Maintenance" hint="System health and upkeep" />
              </RoleGate>
              <FundingGate>
                <ToolLink to="/admin/brokers" icon={Landmark} label="Brokers" hint="Your lending partners and broker desk" />
              </FundingGate>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
