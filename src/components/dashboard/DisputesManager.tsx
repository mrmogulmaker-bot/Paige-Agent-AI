import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Clock, CheckCircle2, XCircle, User, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusConfig = {
  draft: { label: "Draft", icon: FileText, color: "bg-muted" },
  submitted: { label: "Submitted", icon: Clock, color: "bg-warning" },
  under_review: { label: "Under Review", icon: Clock, color: "bg-info" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "bg-success" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive" },
};

interface DisputesManagerProps {
  personalOnly?: boolean;
  businessOnly?: boolean;
}

function useDisputes() {
  return useQuery({
    queryKey: ["disputes"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("disputes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

function useNegativeItems() {
  return useQuery({
    queryKey: ["credit-negative-items"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("credit_negative_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

function NewDisputeDialog({ type, onCreated }: { type: "personal" | "business"; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [creditorName, setCreditorName] = useState("");
  const [bureau, setBureau] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [narrative, setNarrative] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: negativeItems } = useNegativeItems();

  // Pre-populate from selected negative item
  useEffect(() => {
    if (selectedItem && negativeItems) {
      const item = negativeItems.find((n: any) => n.id === selectedItem);
      if (item) {
        setCreditorName(item.creditor_name || "");
        setBureau(item.bureau || "");
        setReasonCode(item.notes || `Dispute: ${item.item_type}`);
        setNarrative(item.notes || "");
      }
    }
  }, [selectedItem, negativeItems]);

  const handleSubmit = async () => {
    if (!creditorName || !bureau || !reasonCode) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("disputes").insert({
        user_id: user.id,
        creditor_name: creditorName,
        bureau,
        reason_code: reasonCode,
        narrative: narrative || null,
        status: "draft",
      });

      if (error) throw error;

      toast.success("Dispute created successfully");
      setOpen(false);
      setCreditorName("");
      setBureau("");
      setReasonCode("");
      setNarrative("");
      setSelectedItem("");
      onCreated();
    } catch (err: any) {
      toast.error(err.message || "Failed to create dispute");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-gold hover:opacity-90">
          <Plus className="w-4 h-4 mr-2" />
          New {type === "personal" ? "Personal" : "Business"} Dispute
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New {type === "personal" ? "Personal" : "Business"} Dispute</DialogTitle>
          <DialogDescription>
            Create a new dispute record. You can select from existing negative items or enter details manually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Pre-populate from negative items */}
          {negativeItems && negativeItems.length > 0 && (
            <div className="space-y-2">
              <Label>Pre-fill from Negative Item (optional)</Label>
              <Select value={selectedItem} onValueChange={setSelectedItem}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a negative item..." />
                </SelectTrigger>
                <SelectContent>
                  {negativeItems.map((item: any) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.creditor_name} — {item.item_type} ({item.bureau})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="creditor">Account / Creditor Name *</Label>
            <Input
              id="creditor"
              value={creditorName}
              onChange={(e) => setCreditorName(e.target.value)}
              placeholder="e.g. Capital One"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bureau">Bureau *</Label>
            <Select value={bureau} onValueChange={setBureau}>
              <SelectTrigger>
                <SelectValue placeholder="Select bureau..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Experian">Experian</SelectItem>
                <SelectItem value="Equifax">Equifax</SelectItem>
                <SelectItem value="TransUnion">TransUnion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Dispute Reason / Basis *</Label>
            <Input
              id="reason"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              placeholder="e.g. Not my account, Incorrect balance"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="narrative">Additional Notes</Label>
            <Textarea
              id="narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Any additional details or FCRA/FDCPA statutory basis..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-gradient-gold hover:opacity-90">
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DisputesList = ({ disputes, type }: { disputes: any[]; type: string }) => (
  <div className="grid gap-4">
    {disputes.map((dispute) => {
      const statusKey = dispute.status as keyof typeof statusConfig;
      const status = statusConfig[statusKey] || statusConfig.draft;
      const StatusIcon = status.icon;

      return (
        <Card key={dispute.id} className="shadow-card hover:shadow-glow transition-shadow">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-xl">{dispute.creditor_name}</CardTitle>
                <CardDescription>Bureau: {dispute.bureau}</CardDescription>
              </div>
              <Badge className={status.color}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Reason</p>
                <p className="font-medium">{dispute.reason_code}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{dispute.created_at ? new Date(dispute.created_at).toLocaleDateString() : "—"}</p>
              </div>
              {dispute.due_date && (
                <div>
                  <p className="text-muted-foreground">Due Date</p>
                  <p className="font-medium">{new Date(dispute.due_date).toLocaleDateString()}</p>
                </div>
              )}
            </div>
            {dispute.narrative && (
              <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{dispute.narrative}</p>
            )}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm">View Details</Button>
              <Button variant="outline" size="sm">Generate Letter</Button>
            </div>
          </CardContent>
        </Card>
      );
    })}
    {disputes.length === 0 && (
      <Card className="shadow-card">
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No {type} disputes yet</h3>
          <p className="text-muted-foreground mb-4">
            Upload a credit report via Paige chat to auto-generate dispute drafts, or create one manually.
          </p>
        </CardContent>
      </Card>
    )}
  </div>
);

export function DisputesManager({ personalOnly, businessOnly }: DisputesManagerProps) {
  const queryClient = useQueryClient();
  const { data: disputes, isLoading } = useDisputes();

  const handleDisputeCreated = () => {
    queryClient.invalidateQueries({ queryKey: ["disputes"] });
  };

  const allDisputes = disputes || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (personalOnly) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <NewDisputeDialog type="personal" onCreated={handleDisputeCreated} />
        </div>
        <DisputesList disputes={allDisputes} type="personal" />
      </div>
    );
  }

  if (businessOnly) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <NewDisputeDialog type="business" onCreated={handleDisputeCreated} />
        </div>
        <DisputesList disputes={allDisputes} type="business" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Credit Disputes</h1>
        <p className="text-muted-foreground mt-2">Manage and track your personal and business credit disputes</p>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="personal" className="gap-2">
            <User className="w-4 h-4" />
            Personal Disputes
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="w-4 h-4" />
            Business Disputes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <NewDisputeDialog type="personal" onCreated={handleDisputeCreated} />
          </div>
          <DisputesList disputes={allDisputes} type="personal" />
        </TabsContent>

        <TabsContent value="business" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <NewDisputeDialog type="business" onCreated={handleDisputeCreated} />
          </div>
          <DisputesList disputes={allDisputes} type="business" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
