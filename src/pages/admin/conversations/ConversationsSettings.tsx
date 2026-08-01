// Conversations > Settings — the tenant's messaging-CONFIGURATION home (§45 tier decompose, §18 one
// home). This is where a coach sets up the messaging side of their practice: phone numbers,
// business-texting registration, consent rules, signatures, and notifications.
//
// Every panel here self-resolves its own tenant/user scope server-side (RLS + current_user_tenant_id(),
// plus useUserRoles() for the personal-vs-shared split) — no props, no tenant threading. They were
// previously mounted under /admin/communications; that surface is now the operator ACTIVITY MONITOR
// (the dispatch/audit log). These config panels live ONLY here now (§18 — never a second copy).
//
// Saved replies (Snippets) are deliberately NOT here: they already have their own Conversations
// sub-tab (§18 — one home each). A single inline pointer at the foot closes the §36 discoverability
// loop without minting a second home.
//
// Deep-link: the old /admin/communications?tab=<config> links redirect here as ?panel=<key>, so the
// requested panel opens directly.
import { Link, useSearchParams } from "react-router-dom";
import { Settings2, ArrowRight } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ui/page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NumbersTab } from "@/components/admin/comms/NumbersTab";
import { A2PTab } from "@/components/admin/comms/A2PTab";
import { ConsentTab } from "@/components/admin/comms/ConsentTab";
import { SignaturesTab } from "@/components/admin/comms/SignaturesTab";
import { NotificationsTab } from "@/components/admin/comms/NotificationsTab";

// Machine-stable tab keys — used by the redirect from the old /admin/communications?tab= links
// (which land here as ?panel=<key>). Labels are coach-language (§36) — never the raw telecom acronym.
const PANEL_KEYS = ["numbers", "a2p", "consent", "signatures", "notifications"] as const;
type PanelKey = (typeof PANEL_KEYS)[number];

export function ConversationsSettings() {
  const [params] = useSearchParams();
  const requested = params.get("panel");
  const active: PanelKey = PANEL_KEYS.includes(requested as PanelKey)
    ? (requested as PanelKey)
    : "numbers";

  return (
    <PageShell width="default">
      <PageHeader
        variant="plain"
        icon={Settings2}
        title="Settings"
        description="Your phone numbers, business texting, consent, signatures, and notifications — one place so nothing drifts out of sync."
      />

      <Tabs defaultValue={active}>
        <TabsList>
          <TabsTrigger value="numbers">Numbers</TabsTrigger>
          <TabsTrigger value="a2p">Business Texting</TabsTrigger>
          <TabsTrigger value="consent">Consent &amp; opt-outs</TabsTrigger>
          <TabsTrigger value="signatures">Signatures</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="numbers">
          <NumbersTab />
        </TabsContent>
        <TabsContent value="a2p">
          <A2PTab />
        </TabsContent>
        <TabsContent value="consent">
          <ConsentTab />
        </TabsContent>
        <TabsContent value="signatures">
          <SignaturesTab />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>
      </Tabs>

      <p className="mt-4 text-sm text-muted-foreground">
        Looking for saved replies?{" "}
        <Link
          to="/admin/clients-hub/conversations/snippets"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          They live in the Snippets tab
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>
    </PageShell>
  );
}

export default ConversationsSettings;
