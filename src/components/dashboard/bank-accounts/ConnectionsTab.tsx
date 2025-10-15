import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link2, RefreshCcw, AlertCircle, CheckCircle2, XCircle, Clock, Unlink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Connection {
  id: string;
  institutionId: string;
  institutionName: string;
  accountCount: number;
  status: "connected" | "expired" | "error";
  consentExpiresAt: Date;
  lastWebhook: Date;
  itemId: string;
}

interface WebhookEvent {
  id: string;
  type: string;
  code: string;
  itemId: string;
  timestamp: Date;
  processed: boolean;
  error?: string;
}

export function ConnectionsTab() {
  const [connections, setConnections] = useState<Connection[]>([
    {
      id: "1",
      institutionId: "ins_3",
      institutionName: "Chase Bank",
      accountCount: 2,
      status: "connected",
      consentExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      lastWebhook: new Date(),
      itemId: "item_abc123",
    },
  ]);

  const [webhookLogs, setWebhookLogs] = useState<WebhookEvent[]>([
    {
      id: "1",
      type: "TRANSACTIONS",
      code: "DEFAULT_UPDATE",
      itemId: "item_abc123",
      timestamp: new Date(),
      processed: true,
    },
    {
      id: "2",
      type: "TRANSACTIONS",
      code: "INITIAL_UPDATE",
      itemId: "item_abc123",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      processed: true,
    },
    {
      id: "3",
      type: "ITEM",
      code: "PENDING_EXPIRATION",
      itemId: "item_abc123",
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      processed: true,
    },
  ]);

  const handleConnectBank = () => {
    toast.info("Opening Plaid Link...");
    // This would trigger the actual Plaid Link
  };

  const handleRelinkBank = (connectionId: string) => {
    toast.info("Re-linking bank connection...");
    // This would re-open Plaid Link in update mode
  };

  const handleDisconnect = (connectionId: string) => {
    setConnections(connections.filter(c => c.id !== connectionId));
    toast.success("Bank connection removed");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case "expired":
        return <Clock className="h-5 w-5 text-warning" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-success/10 text-success">Connected</Badge>;
      case "expired":
        return <Badge className="bg-warning/10 text-warning">Expired</Badge>;
      case "error":
        return <Badge className="bg-destructive/10 text-destructive">Error</Badge>;
      default:
        return null;
    }
  };

  const getDaysUntilExpiry = (expiryDate: Date) => {
    const days = Math.floor((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    return days;
  };

  return (
    <div className="space-y-6">
      {/* Connect/Relink Actions */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-primary/5 to-accent/5">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-accent" />
            Plaid Link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect or re-link your bank accounts securely through Plaid
          </p>
          <div className="flex gap-3">
            <Button onClick={handleConnectBank} className="bg-gradient-gold hover:shadow-glow">
              <Link2 className="mr-2 h-4 w-4" />
              Connect New Account
            </Button>
            <Button variant="outline">
              <RefreshCcw className="mr-2 h-4 w-4" />
              Re-link Existing
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Connections */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Active Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {connections.map((connection) => {
              const daysUntilExpiry = getDaysUntilExpiry(connection.consentExpiresAt);
              const isExpiringSoon = daysUntilExpiry < 30;

              return (
                <div
                  key={connection.id}
                  className="p-4 rounded-lg border-2 border-border/50 hover:border-accent/30 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3 flex-1">
                      <div className="mt-1">
                        {getStatusIcon(connection.status)}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h4 className="font-semibold">{connection.institutionName}</h4>
                          {getStatusBadge(connection.status)}
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Accounts</p>
                            <p className="font-medium">{connection.accountCount}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Item ID</p>
                            <p className="font-mono text-xs">{connection.itemId}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Last Webhook</p>
                            <p className="font-medium">
                              {formatDistanceToNow(connection.lastWebhook, { addSuffix: true })}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Consent Expires</p>
                            <p className={`font-medium ${isExpiringSoon ? 'text-warning' : ''}`}>
                              {daysUntilExpiry} days
                            </p>
                          </div>
                        </div>

                        {isExpiringSoon && (
                          <Alert className="border-warning/30">
                            <AlertCircle className="h-4 w-4 text-warning" />
                            <AlertDescription className="text-sm">
                              Your consent expires in {daysUntilExpiry} days. Re-link to maintain access.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRelinkBank(connection.id)}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnect(connection.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Webhook Status Log */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Webhook Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead>Type</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Item ID</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhookLogs.map((event) => (
                  <TableRow key={event.id} className="border-border/50">
                    <TableCell>
                      <Badge variant="outline">{event.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{event.code}</TableCell>
                    <TableCell className="font-mono text-xs">{event.itemId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(event.timestamp, { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      {event.processed ? (
                        <Badge className="bg-success/10 text-success gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Processed
                        </Badge>
                      ) : event.error ? (
                        <Badge className="bg-destructive/10 text-destructive gap-1">
                          <XCircle className="h-3 w-3" />
                          Error
                        </Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Types Reference */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-accent/5 to-gold/5">
        <CardContent className="pt-6 text-sm space-y-3">
          <p className="font-medium">Common Webhook Events:</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-card border border-accent/20">
              <p className="font-semibold text-xs mb-1">DEFAULT_UPDATE</p>
              <p className="text-xs text-muted-foreground">New transactions available to sync</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-gold/20">
              <p className="font-semibold text-xs mb-1">PENDING_EXPIRATION</p>
              <p className="text-xs text-muted-foreground">User consent expiring soon</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-destructive/20">
              <p className="font-semibold text-xs mb-1">ERROR</p>
              <p className="text-xs text-muted-foreground">Connection needs user attention</p>
            </div>
            <div className="p-3 rounded-lg bg-card border border-success/20">
              <p className="font-semibold text-xs mb-1">INITIAL_UPDATE</p>
              <p className="text-xs text-muted-foreground">Historical transactions loaded</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
