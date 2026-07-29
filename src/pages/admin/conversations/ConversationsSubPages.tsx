// Conversations sub-tab pages (Cowork #127 feature #3) — the sections that sit under the
// Conversations sub-tab strip alongside the inbox (the index child, ClientsConversations).
//
// Three are NET-NEW, sanctioned as crafted "coming soon" stubs behind net-new tabs: each is
// a real EmptyState (§11 — never a blank "coming soon" line), honest about what the section
// will do, coaching-generic (§2 — no finance), in Paige's mogul-founder voice (§3).
//
// Two REUSE existing homes (§18 — link/embed, never rebuild):
//   • Snippets  → embeds the live SnippetsTab (self-fetches tenant/scopes; no props needed),
//                 the SAME saved-replies surface used in the composer and Communications.
//   • Settings  → a pointer to Communications (/admin/communications), the messaging-settings
//                 home — never a second copy of CommunicationsAdmin.
import { Link } from "react-router-dom";
import { ListChecks, Link2, BarChart3, Settings2, ArrowUpRight, MessageSquareText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell, PageHeader, SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { SnippetsTab } from "@/components/admin/comms/SnippetsTab";

/** Shared frame for a net-new stub section — compact plain header + crafted EmptyState. */
function StubSection({
  icon, title, description, emptyTitle, emptyBody,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <PageShell width="default">
      <PageHeader variant="plain" icon={icon} title={title} description={description} />
      <SectionCard>
        <EmptyState icon={icon} tone="brand" title={emptyTitle} description={emptyBody} />
      </SectionCard>
    </PageShell>
  );
}

// ── NET-NEW stubs ───────────────────────────────────────────────────────────────────
export function ConversationsManualActions() {
  return (
    <StubSection
      icon={ListChecks}
      title="Manual Actions"
      description="The human tasks Paige queues up when a conversation needs your hand."
      emptyTitle="No actions waiting on you"
      emptyBody="When a thread needs a decision only you can make — a call to place, an approval to give, a promise to keep — Paige will line it up here so nothing slips."
    />
  );
}

export function ConversationsTriggerLinks() {
  return (
    <StubSection
      icon={Link2}
      title="Trigger Links"
      description="Trackable links that fire an automation the moment a client clicks."
      emptyTitle="No trigger links yet"
      emptyBody="Drop a trackable link in a message and Paige watches for the click — then moves the client forward, tags them, or kicks off the next step on its own. This is where you'll build and track them."
    />
  );
}

export function ConversationsAnalytics() {
  return (
    <StubSection
      icon={BarChart3}
      title="Analytics"
      description="How your messaging is actually landing — volume, response time, and reach."
      emptyTitle="No messaging metrics yet"
      emptyBody="Once conversations are flowing, Paige will show you what's working here: how fast you reply, which channels pull their weight, and where a client went quiet so you can win them back."
    />
  );
}

// ── REUSE: Snippets (embed the live surface) ──────────────────────────────────────────
export function ConversationsSnippets() {
  return (
    <PageShell width="default">
      <PageHeader
        variant="plain"
        icon={MessageSquareText}
        title="Snippets"
        description="Saved replies you and your team drop into a message with one keystroke."
      />
      <SnippetsTab />
    </PageShell>
  );
}

// ── REUSE: Settings (pointer to Communications) ───────────────────────────────────────
export function ConversationsSettings() {
  return (
    <PageShell width="default">
      <PageHeader
        variant="plain"
        icon={Settings2}
        title="Settings"
        description="Messaging and channel settings live in Communications."
      />
      <SectionCard>
        <EmptyState
          icon={Settings2}
          tone="brand"
          title="Manage messaging in Communications"
          description="Your channels, phone numbers, signatures, notifications, and consent all live on one settings home so nothing drifts out of sync. Head there to set them up."
          action={
            <Button asChild variant="outline">
              <Link to="/admin/communications">
                Open Communications
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          }
        />
      </SectionCard>
    </PageShell>
  );
}
