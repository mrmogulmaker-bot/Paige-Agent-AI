import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function GmailIntegrationConfig() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Gmail (Founder Inbox)</h1>
        <p className="text-sm text-muted-foreground">Used for high-deliverability sends and founder direct comms.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">OAuth status <Badge variant="secondary" className="ml-2">Pending Lovable Google connection</Badge></CardTitle>
          <CardDescription>Connect Google via the Lovable integration UI (mogulmakeracademy@gmail.com). Once connected, the gmail-* edge functions will activate.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Available edge functions (will be wired after OAuth):</p>
          <ul className="list-disc list-inside space-y-1">
            <li><code>gmail-list-messages</code> — read by label or thread</li>
            <li><code>gmail-send-message</code> — deliverability-sensitive sends</li>
            <li><code>gmail-get-thread</code> — full thread context</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
