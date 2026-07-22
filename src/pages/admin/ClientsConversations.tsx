// Conversations tab body for the Clients container (IA slice 1c-viii-c). The
// unified client inbox is not built yet — this is a crafted §11 EmptyState (NOT a
// return null, NOT raw text), coaching-generic (§2) and in mogul-founder voice (§3).
// When the real inbox ships it wires INTO this same container tab.
import { MessagesSquare } from "lucide-react";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";

export default function ClientsConversations() {
  return (
    <PageShell width="default">
      <PageHeader variant="plain" title="Conversations" />
      <EmptyState
        icon={MessagesSquare}
        tone="brand"
        title="Your unified inbox — coming soon."
        description="All your client conversations across SMS, WhatsApp, email, and DMs will live here — one thread per client, so nothing gets missed."
      />
    </PageShell>
  );
}
