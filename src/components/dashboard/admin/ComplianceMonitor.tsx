import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Shield, FileCheck, AlertTriangle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function ComplianceMonitor() {
  const [consentEvents, setConsentEvents] = useState<any[]>([]);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [piiAccessLogs, setPiiAccessLogs] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalConsents: 0,
    activeCheckpoints: 0,
    pendingDeletions: 0,
    recentPiiAccess: 0,
  });

  useEffect(() => {
    fetchComplianceData();
  }, []);

  const fetchComplianceData = async () => {
    try {
      // Fetch consent events
      const { data: consents } = await supabase
        .from("consent_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      // Fetch checkpoints
      const { data: checks } = await supabase
        .from("compliance_checkpoints")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      // Fetch deletion requests
      const { data: deletions } = await supabase
        .from("data_deletion_requests")
        .select("*")
        .order("requested_at", { ascending: false })
        .limit(50);

      // Fetch all unique user IDs
      const allUserIds = [
        ...(consents?.map(c => c.user_id) || []),
        ...(checks?.map(c => c.user_id) || []),
        ...(deletions?.map(d => d.user_id) || []),
      ];
      const uniqueUserIds = [...new Set(allUserIds)];

      // Fetch profiles for all users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", uniqueUserIds);

      // Map profiles to data
      const consentsWithProfiles = consents?.map(c => ({
        ...c,
        profiles: profiles?.find(p => p.user_id === c.user_id),
      }));

      const checksWithProfiles = checks?.map(c => ({
        ...c,
        profiles: profiles?.find(p => p.user_id === c.user_id),
      }));

      const deletionsWithProfiles = deletions?.map(d => ({
        ...d,
        profiles: profiles?.find(p => p.user_id === d.user_id),
      }));

      setConsentEvents(consentsWithProfiles || []);
      setCheckpoints(checksWithProfiles || []);
      setDeletionRequests(deletionsWithProfiles || []);

      // Fetch PII access logs
      const { data: piiLogs } = await supabase
        .from("pii_access_log")
        .select("*")
        .order("accessed_at", { ascending: false })
        .limit(50);

      setPiiAccessLogs(piiLogs || []);

      // Calculate stats
      setStats({
        totalConsents: consents?.filter(c => c.granted).length || 0,
        activeCheckpoints: checks?.filter(c => c.status === "pending").length || 0,
        pendingDeletions: deletions?.filter(d => d.status === "pending").length || 0,
        recentPiiAccess: piiLogs?.filter(l => 
          new Date(l.accessed_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length || 0,
      });
    } catch (error) {
      console.error("Error fetching compliance data:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Consents</CardTitle>
            <FileCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalConsents}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Checkpoints</CardTitle>
            <Shield className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeCheckpoints}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Deletion Requests</CardTitle>
            <Trash2 className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingDeletions}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PII Access (24h)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentPiiAccess}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Views */}
      <Tabs defaultValue="consents">
        <TabsList>
          <TabsTrigger value="consents">Consent Events</TabsTrigger>
          <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
          <TabsTrigger value="deletions">Deletion Requests</TabsTrigger>
          <TabsTrigger value="pii">PII Access</TabsTrigger>
        </TabsList>

        <TabsContent value="consents">
          <Card>
            <CardHeader>
              <CardTitle>Consent Events</CardTitle>
              <CardDescription>User consent tracking for compliance</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consentEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.profiles?.full_name || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.consent_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={event.granted ? "default" : "destructive"}>
                          {event.granted ? "Granted" : "Denied"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        v{event.disclosure_version}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checkpoints">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Checkpoints</CardTitle>
              <CardDescription>Validation checkpoints for credit operations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checkpoints.map((checkpoint) => (
                    <TableRow key={checkpoint.id}>
                      <TableCell>{checkpoint.profiles?.full_name || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{checkpoint.checkpoint_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            checkpoint.status === "passed" ? "default" :
                            checkpoint.status === "failed" ? "destructive" : "secondary"
                          }
                        >
                          {checkpoint.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{checkpoint.api_endpoint}</TableCell>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(new Date(checkpoint.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deletions">
          <Card>
            <CardHeader>
              <CardTitle>Data Deletion Requests</CardTitle>
              <CardDescription>GDPR and user data deletion requests</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deletionRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{request.profiles?.full_name || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            request.status === "completed" ? "default" :
                            request.status === "pending" ? "secondary" : "outline"
                          }
                        >
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(new Date(request.requested_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {request.completed_at 
                          ? formatDistanceToNow(new Date(request.completed_at), { addSuffix: true })
                          : "-"
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pii">
          <Card>
            <CardHeader>
              <CardTitle>PII Access Logs</CardTitle>
              <CardDescription>Sensitive data access tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Accessed User</TableHead>
                    <TableHead>Accessor</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Fields</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {piiAccessLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">{log.accessed_user_id.substring(0, 8)}...</TableCell>
                      <TableCell className="text-sm">{log.accessor_user_id.substring(0, 8)}...</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.table_name}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">
                        {log.field_names?.join(", ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.access_type === "read" ? "secondary" : "default"}>
                          {log.access_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(new Date(log.accessed_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
