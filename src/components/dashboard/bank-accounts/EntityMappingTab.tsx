import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, RefreshCcw, CheckCircle2, AlertCircle, Hash, MapPin, Briefcase } from "lucide-react";
import { toast } from "sonner";

export function EntityMappingTab() {
  const [syncing, setSyncing] = useState(false);

  // Mock data - replace with real data from business context
  const entityData = {
    legalName: "Acme Corporation LLC",
    ein: "XX-XXX1234",
    duns: "08-123-4567",
    naics: "541511 - Custom Computer Programming Services",
    formationDate: "2020-03-15",
    state: "Delaware",
    status: "Active",
    address: {
      street: "123 Business Blvd",
      city: "Wilmington",
      state: "DE",
      zip: "19801"
    }
  };

  const bureauConnections = [
    {
      id: "dnb",
      name: "Dun & Bradstreet",
      status: "connected",
      lastSync: new Date(Date.now() - 86400000 * 2),
      duns: "08-123-4567",
      paydex: 78
    },
    {
      id: "experian",
      name: "Experian Business",
      status: "connected",
      lastSync: new Date(Date.now() - 86400000 * 1),
      intelliscore: 72
    },
    {
      id: "equifax",
      name: "Equifax Business",
      status: "pending",
      lastSync: null,
      businessRiskScore: null
    }
  ];

  const handleSyncEntity = async () => {
    setSyncing(true);
    toast.info("Syncing entity data with credit bureaus...");
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setSyncing(false);
    toast.success("Entity data synced successfully");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-success/10 text-success">Connected</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Business Identity Card */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Building2 className="h-5 w-5 text-primary" />
                Business Identity
              </CardTitle>
              <CardDescription>
                Core entity information used for credit bureau reporting
              </CardDescription>
            </div>
            <Button 
              onClick={handleSyncEntity}
              disabled={syncing}
              className="bg-gradient-gold hover:shadow-glow"
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync Entity Data
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">Legal Name</p>
                  <p className="font-semibold text-lg">{entityData.legalName}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                <Hash className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">EIN</p>
                  <p className="font-mono font-semibold">{entityData.ein}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                <Hash className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">D-U-N-S Number</p>
                  <p className="font-mono font-semibold">{entityData.duns}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                <Briefcase className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">Primary Industry (NAICS)</p>
                  <p className="font-medium">{entityData.naics}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                <MapPin className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">Formation State</p>
                  <p className="font-semibold">{entityData.state}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Formed: {new Date(entityData.formationDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border/50">
                <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  <Badge className="bg-success/10 text-success">{entityData.status}</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Business Address */}
          <div className="p-4 rounded-lg bg-accent/5 border border-accent/20 mt-4">
            <p className="text-sm font-medium text-accent mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Principal Business Address
            </p>
            <p className="text-sm">
              {entityData.address.street}<br />
              {entityData.address.city}, {entityData.address.state} {entityData.address.zip}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bureau Connections */}
      <Card className="border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Credit Bureau Connections</CardTitle>
          <CardDescription>
            Entity mapping status across business credit bureaus
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bureauConnections.map((bureau) => (
            <div
              key={bureau.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 rounded-full bg-gradient-gold flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold">{bureau.name}</h4>
                    {getStatusBadge(bureau.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {bureau.lastSync
                      ? `Last synced: ${bureau.lastSync.toLocaleDateString()}`
                      : "Never synced"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {bureau.status === "connected" && (
                  <div className="text-right">
                    {bureau.duns && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">DUNS:</span>{" "}
                        <span className="font-mono font-medium">{bureau.duns}</span>
                      </div>
                    )}
                    {bureau.paydex !== undefined && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">PAYDEX:</span>{" "}
                        <span className="font-semibold text-primary">{bureau.paydex}</span>
                      </div>
                    )}
                    {bureau.intelliscore !== undefined && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Intelliscore:</span>{" "}
                        <span className="font-semibold text-primary">{bureau.intelliscore}</span>
                      </div>
                    )}
                  </div>
                )}
                {bureau.status === "pending" && (
                  <Button variant="outline" size="sm">
                    <AlertCircle className="mr-2 h-4 w-4" />
                    Connect
                  </Button>
                )}
                {bureau.status === "connected" && (
                  <Button variant="ghost" size="sm">
                    <RefreshCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Data Quality Alerts */}
      <Card className="border-border/50 shadow-card bg-gradient-to-br from-accent/5 to-gold/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Data Quality Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-success/20">
            <span className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Legal name matches across all bureaus
            </span>
            <Badge className="bg-success/10 text-success">Verified</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-success/20">
            <span className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              EIN verified with IRS database
            </span>
            <Badge className="bg-success/10 text-success">Verified</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-accent/20">
            <span className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-accent" />
              Address formatting varies across bureaus
            </span>
            <Button variant="ghost" size="sm">
              Review
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
