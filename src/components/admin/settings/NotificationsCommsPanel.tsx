// Notifications & Communications panel — extracted verbatim (§18 one home) from
// the private NotificationsCommsPanel in AdminSettingsHub so the Setup General
// sub-tab (1c-xi) can mount it directly. Behavior is unchanged: two crafted
// SectionCards summarizing email infrastructure and push/SMS, each with a
// link-out to the live surface. Propless and self-contained.
import { Link } from "react-router-dom";
import { Mail, Bell, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard, StatePill } from "@/components/ui/page";

export function NotificationsCommsPanel() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SectionCard
        icon={Mail}
        title="Email Infrastructure"
        description="Branded emails sent from paigeagent.ai via the queue dispatcher."
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <StatePill state="success">paigeagent.ai</StatePill>
            <StatePill state="pending">Queue: pgmq</StatePill>
          </div>
          <p className="text-xs text-muted-foreground">
            Auth emails and transactional sends share a retry-safe queue with
            automatic dead-lettering after 5 failed attempts.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/communications">
              Open communications log
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon={Bell}
        title="Push & SMS"
        description="Web push uses VAPID; SMS routes through Twilio with opt-out tracking."
      >
        <div className="space-y-3">
          <ul className="text-xs text-muted-foreground space-y-1.5">
            <li>• New client reply &rarr; push to the coach</li>
            <li>• At-risk client flagged &rarr; push (deduped 24h)</li>
            <li>• Booking confirmed &rarr; SMS + email</li>
            <li>• Onboarding step &rarr; transactional email</li>
          </ul>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/support">
              Open support center
              <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

export default NotificationsCommsPanel;
