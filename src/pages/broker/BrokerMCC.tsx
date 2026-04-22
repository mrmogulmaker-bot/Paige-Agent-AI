// Broker Workspace → MCC Services tab.
// Brokers submit "done-for-you" service requests for their clients (entity setup,
// business credit build, funding prep, etc). The mcc-submit-request edge function
// inserts the row, posts a webhook to MCC ops, and emails MCC_NOTIFICATION_EMAIL.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useBrokerContext } from "@/hooks/useBrokerContext";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Plus } from "lucide-react";

const SERVICES = [
  { value: "entity_setup", label: "Entity setup (LLC / Corp / EIN)" },
  { value: "business_credit_build", label: "Business credit build" },
  { value: "funding_prep", label: "Funding prep & application" },
  { value: "dispute_handling", label: "Dispute handling" },
  { value: "tradeline_strategy", label: "Tradeline strategy" },
  { value: "compliance_review", label: "Compliance review" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "standard", label: "Standard" },
  { value: "rush", label: "Rush" },
];

const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.value, s.label]));

interface ClientOption {
  id: string;
  client_first_name: string;
  client_last_name: string;
  client_email: string;
}

interface Request {
  id: string;
  service_type: string;
  priority: string;
  status: string;
  notes: string;
  created_at: string;
  webhook_dispatched_at: string | null;
  client: ClientOption | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  pending: "secondary",
  submitted: "default",
  in_progress: "default",
  completed: "outline",
  cancelled: "outline",
};

const BrokerMCC = () => {
  const { activeBrokerId } = useBrokerContext();
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // Form state
  const [clientId, setClientId] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [priority, setPriority] = useState("standard");
  const [notes, setNotes] = useState("");

  const refresh = async () => {
    if (!activeBrokerId) return;
    setLoading(true);
    const [clientsRes, reqRes] = await Promise.all([
      supabase
        .from("broker_client_relationships")
        .select("id, client_first_name, client_last_name, client_email")
        .eq("broker_id", activeBrokerId)
        .eq("is_active", true)
        .order("added_at", { ascending: false }),
      supabase
        .from("mcc_service_requests")
        .select(
          "id, service_type, priority, status, notes, created_at, webhook_dispatched_at, client:broker_client_relationships(id, client_first_name, client_last_name, client_email)",
        )
        .eq("broker_id", activeBrokerId)
        .order("created_at", { ascending: false }),
    ]);
    if (clientsRes.error) {
      toast({ title: "Failed to load clients", description: clientsRes.error.message, variant: "destructive" });
    } else {
      setClients(clientsRes.data ?? []);
    }
    if (reqRes.error) {
      toast({ title: "Failed to load requests", description: reqRes.error.message, variant: "destructive" });
    } else {
      setRequests((reqRes.data as any) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrokerId]);

  const reset = () => {
    setClientId("");
    setServiceType("");
    setPriority("standard");
    setNotes("");
  };

  const submit = async () => {
    if (!clientId || !serviceType || !notes.trim()) {
      toast({ title: "Missing fields", description: "Pick a client, a service, and add notes.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("mcc-submit-request", {
        body: {
          clientRelationshipId: clientId,
          serviceType,
          priority,
          notes,
        },
      });
      if (error) throw error;
      toast({ title: "Request submitted", description: "MCC ops has been notified." });
      reset();
      setOpen(false);
      await refresh();
    } catch (err: any) {
      toast({ title: "Submission failed", description: err.message ?? "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MCC Services</h1>
          <p className="text-sm text-muted-foreground">
            Done-for-you back-office work for your clients — entity setup, business credit build,
            funding prep, and more.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={clients.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              New request
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New MCC service request</DialogTitle>
              <DialogDescription>
                Our ops team picks this up and works directly with your client.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="client">Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger id="client"><SelectValue placeholder="Pick a client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.client_first_name} {c.client_last_name} — {c.client_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="service">Service</Label>
                  <Select value={serviceType} onValueChange={setServiceType}>
                    <SelectTrigger id="service"><SelectValue placeholder="Pick a service" /></SelectTrigger>
                    <SelectContent>
                      {SERVICES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="priority"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">What do you need done?</Label>
                <Textarea
                  id="notes"
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Background, current status, deadlines, contacts, etc."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {clients.length === 0 && !loading && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            Add a client first under <strong>Clients</strong> to submit MCC requests.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Active & past requests
          </CardTitle>
          <CardDescription>
            Status updates here as MCC ops acknowledges, works, and completes each request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No requests yet.
            </p>
          ) : (
            <ul className="divide-y">
              {requests.map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {SERVICE_LABEL[r.service_type] ?? r.service_type}
                        </span>
                        <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"} className="capitalize text-xs">
                          {r.status.replace("_", " ")}
                        </Badge>
                        {r.priority === "rush" && (
                          <Badge variant="destructive" className="text-xs">Rush</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {r.client?.client_first_name} {r.client?.client_last_name} · {new Date(r.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm mt-2 line-clamp-2 text-muted-foreground">{r.notes}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BrokerMCC;
