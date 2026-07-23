// Setup › Billing (1c-xi) — the Finance home. NET-NEW and honest (§13): billing
// self-service arrives with Money Spine; until then subscriptions are handled
// manually, so this surface says exactly that and offers a single route to
// support. NO fake data, NO funding/credit default (§2). §11 lean plain header,
// no hero.
import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { PageShell, PageHeader, SectionCard, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";

export default function SetupBilling() {
  return (
    <PageShell width="wide">
      <PageHeader
        variant="plain"
        icon={CreditCard}
        eyebrow="Finance"
        title="Billing"
        description="Your subscription and payment details — Paige keeps an eye on them so you don't have to."
      />

      <SectionCard>
        <EmptyState
          icon={CreditCard}
          tone="brand"
          title="Billing"
          description="Billing management arrives with Money Spine. Your subscription is managed manually for now — reach out to support for changes."
          action={
            <Button asChild variant="outline">
              <Link to="/admin/support">Contact support</Link>
            </Button>
          }
        />
      </SectionCard>
    </PageShell>
  );
}
