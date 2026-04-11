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
import { Plus, FileText, Clock, CheckCircle2, XCircle, User, Building2, Loader2, Eye, Download, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusConfig = {
  draft: { label: "Draft", icon: FileText, color: "bg-muted" },
  in_progress: { label: "In Progress", icon: Clock, color: "bg-warning" },
  submitted: { label: "Submitted", icon: Clock, color: "bg-warning" },
  under_review: { label: "Under Review", icon: Clock, color: "bg-info" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "bg-success" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive" },
};

interface DisputesManagerProps {
  personalOnly?: boolean;
  businessOnly?: boolean;
  clientId?: string; // For internal client mode
}

// FCRA/FDCPA statutory language by account type
function getStatutoryLanguage(reasonCode: string, itemType?: string): string {
  const generic = ["validation dispute", "follow-up on existing dispute", "dispute:", "auto-generated"];
  const lower = (reasonCode || "").toLowerCase();
  const isGeneric = generic.some(g => lower.includes(g)) || lower.length < 30;

  if (!isGeneric) return reasonCode;

  const type = (itemType || reasonCode || "").toLowerCase();
  if (type.includes("charge") || type.includes("charge-off") || type.includes("charge_off")) {
    return "Requesting verification of accuracy and completeness of this account pursuant to FCRA Section 611. Please provide the original account agreement, payment history, and method of verification.";
  }
  if (type.includes("collection")) {
    return "Requesting full validation of this debt pursuant to FDCPA Section 809(b). Please provide verification of the original creditor, original balance, date of first delinquency, and your authority to collect this debt.";
  }
  if (type.includes("discrepan") || type.includes("cross-bureau") || type.includes("inconsistent")) {
    return "This account is being reported inconsistently across credit bureaus in violation of FCRA Section 623(a)(1) accuracy requirements. Requesting immediate correction of the inaccurate information and method of verification.";
  }
  // Default FCRA 611 language
  return "Requesting verification of accuracy and completeness of this account pursuant to FCRA Section 611. Please provide the original account agreement, complete payment history, and method of verification used.";
}

function useDisputes(clientId?: string) {
  return useQuery({
    queryKey: ["disputes", clientId || "self"],
    queryFn: async () => {
      if (clientId) {
        const { data, error } = await supabase
          .from("disputes")
          .select("*")
          .eq("client_id", clientId as any)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as any[]) || [];
      }
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

function useNegativeItems(clientId?: string) {
  return useQuery({
    queryKey: ["credit-negative-items", clientId || "self"],
    queryFn: async () => {
      if (clientId) {
        const { data, error } = await supabase
          .from("credit_negative_items")
          .select("*")
          .eq("client_id", clientId as any)
          .eq("status", "active")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as any[]) || [];
      }
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

// ========== View Details Dialog ==========
function DisputeDetailsDialog({ dispute, open, onOpenChange }: { dispute: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [letters, setLetters] = useState<any[]>([]);

  useEffect(() => {
    if (open && dispute) {
      supabase
        .from("dispute_letters")
        .select("*")
        .eq("business_name", dispute.creditor_name)
        .eq("user_id", dispute.user_id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setLetters(data || []));
    }
  }, [open, dispute]);

  if (!dispute) return null;

  const statusKey = dispute.status as keyof typeof statusConfig;
  const status = statusConfig[statusKey] || statusConfig.draft;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Dispute Details</DialogTitle>
          <DialogDescription>Full dispute record for {dispute.creditor_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Creditor Name</Label>
              <p className="font-medium">{dispute.creditor_name}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Bureau</Label>
              <p className="font-medium">{dispute.bureau}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Account Number</Label>
              <p className="font-medium">{dispute.account_number_masked || "N/A"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Badge className={status.color}>{status.label}</Badge>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Date Created</Label>
              <p className="font-medium">{dispute.created_at ? new Date(dispute.created_at).toLocaleDateString() : "—"}</p>
            </div>
            {dispute.due_date && (
              <div>
                <Label className="text-xs text-muted-foreground">Due Date</Label>
                <p className="font-medium">{new Date(dispute.due_date).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Dispute Basis</Label>
            <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{dispute.reason_code}</p>
          </div>
          {dispute.narrative && (
            <div>
              <Label className="text-xs text-muted-foreground">Notes / Narrative</Label>
              <p className="text-sm mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap">{dispute.narrative}</p>
            </div>
          )}
          {dispute.resolution_note && (
            <div>
              <Label className="text-xs text-muted-foreground">Resolution Note</Label>
              <p className="text-sm mt-1 p-3 bg-muted rounded-lg">{dispute.resolution_note}</p>
            </div>
          )}

          {letters.length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground">Generated Letters ({letters.length})</Label>
              <div className="space-y-2 mt-2">
                {letters.map((l: any) => (
                  <Card key={l.id} className="p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                      <Badge variant="outline" className="text-xs">{l.status}</Badge>
                    </div>
                    <p className="text-xs line-clamp-3 font-mono">{l.letter_content?.substring(0, 200)}...</p>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== Generate Letter Dialog ==========
function GenerateLetterDialog({
  dispute,
  open,
  onOpenChange,
  onLetterGenerated,
}: {
  dispute: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLetterGenerated: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [letter, setLetter] = useState("");
  const [error, setError] = useState("");

  const disputeBasis = getStatutoryLanguage(
    dispute?.reason_code || "",
    dispute?.narrative
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError("");
    setLetter("");

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-dispute-letter", {
        body: {
          bureauData: {
            name: dispute.bureau || "Unknown",
            totalAccounts: 0,
            derogatoryItems: 1,
            delinquentItems: 0,
          },
          issueType: `${dispute.creditor_name} — ${disputeBasis}`,
        },
      });

      if (fnError) {
        setError(fnError.message || "Edge function error");
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }

      if (data?.letter) {
        setLetter(data.letter);

        // Save letter to dispute_letters table
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("dispute_letters").insert({
          user_id: dispute.user_id || user?.id || "",
          dispute_type: dispute.reason_code?.substring(0, 50) || "FCRA Dispute",
          business_name: dispute.creditor_name,
          account_number: dispute.account_number_masked || null,
          letter_content: data.letter,
          status: "draft",
        });

        // Update dispute status to in_progress and update reason_code with statutory language
        await supabase
          .from("disputes")
          .update({
            status: "submitted",
            reason_code: disputeBasis,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", dispute.id);

        onLetterGenerated();
        toast.success("Dispute letter generated and saved");
      }
    } catch (err: any) {
      setError(err.message || "Unexpected error");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(letter);
    toast.success("Letter copied to clipboard");
  };

  const downloadAsTxt = () => {
    const blob = new Blob([letter], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispute-letter-${dispute.creditor_name?.replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success("Letter downloaded");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Dispute Letter</DialogTitle>
          <DialogDescription>
            FCRA-compliant letter for {dispute?.creditor_name} ({dispute?.bureau})
          </DialogDescription>
        </DialogHeader>

        {!letter && !isGenerating && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground">Dispute Basis (Statutory Language)</Label>
              <p className="text-sm mt-1">{disputeBasis}</p>
            </div>
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                <strong>Error:</strong> {error}
              </div>
            )}
            <Button onClick={handleGenerate} className="w-full bg-gradient-gold hover:opacity-90">
              Generate FCRA Dispute Letter
            </Button>
          </div>
        )}

        {isGenerating && (
          <div className="flex flex-col items-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Generating dispute letter with proper statutory language...</p>
          </div>
        )}

        {letter && (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <Button onClick={copyToClipboard} variant="outline" size="sm">
                <Copy className="w-4 h-4 mr-1" /> Copy
              </Button>
              <Button onClick={downloadAsTxt} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-1" /> Download
              </Button>
            </div>
            <Textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              className="min-h-[350px] font-mono text-sm"
            />
            <Badge variant="outline" className="text-xs">
              You can edit the letter above before downloading
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ========== New Dispute Dialog ==========
function NewDisputeDialog({ type, onCreated, clientId }: { type: "personal" | "business"; onCreated: () => void; clientId?: string }) {
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [creditorName, setCreditorName] = useState("");
  const [bureau, setBureau] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [narrative, setNarrative] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: negativeItems } = useNegativeItems(clientId);

  useEffect(() => {
    if (selectedItem && negativeItems) {
      const item = negativeItems.find((n: any) => n.id === selectedItem);
      if (item) {
        setCreditorName(item.creditor_name || "");
        setBureau(item.bureau || "");
        setReasonCode(getStatutoryLanguage(item.notes || `Dispute: ${item.item_type}`, item.item_type));
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

      const insertData: any = {
        user_id: user.id,
        creditor_name: creditorName,
        bureau,
        reason_code: reasonCode,
        narrative: narrative || null,
        status: "draft",
      };
      if (clientId) {
        insertData.client_id = clientId;
      }

      const { error } = await supabase.from("disputes").insert(insertData);
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
            <Input id="creditor" value={creditorName} onChange={(e) => setCreditorName(e.target.value)} placeholder="e.g. Capital One" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bureau">Bureau *</Label>
            <Select value={bureau} onValueChange={setBureau}>
              <SelectTrigger><SelectValue placeholder="Select bureau..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Experian">Experian</SelectItem>
                <SelectItem value="Equifax">Equifax</SelectItem>
                <SelectItem value="TransUnion">TransUnion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Dispute Reason / Basis *</Label>
            <Textarea id="reason" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="FCRA/FDCPA statutory basis..." rows={3} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="narrative">Additional Notes</Label>
            <Textarea id="narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Any additional details..." rows={2} />
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

// ========== Disputes List ==========
const DisputesList = ({ disputes, type, onRefresh }: { disputes: any[]; type: string; onRefresh: () => void }) => {
  const [detailsDispute, setDetailsDispute] = useState<any>(null);
  const [letterDispute, setLetterDispute] = useState<any>(null);

  return (
    <>
      <DisputeDetailsDialog dispute={detailsDispute} open={!!detailsDispute} onOpenChange={(v) => !v && setDetailsDispute(null)} />
      <GenerateLetterDialog dispute={letterDispute} open={!!letterDispute} onOpenChange={(v) => !v && setLetterDispute(null)} onLetterGenerated={onRefresh} />

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
                    <p className="font-medium line-clamp-2">{dispute.reason_code}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{dispute.created_at ? new Date(dispute.created_at).toLocaleDateString() : "—"}</p>
                  </div>
                  {dispute.account_number_masked && (
                    <div>
                      <p className="text-muted-foreground">Account #</p>
                      <p className="font-medium">{dispute.account_number_masked}</p>
                    </div>
                  )}
                </div>
                {dispute.narrative && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{dispute.narrative}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDetailsDispute(dispute)}>
                    <Eye className="w-3 h-3 mr-1" /> View Details
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLetterDispute(dispute)}>
                    <FileText className="w-3 h-3 mr-1" /> Generate Letter
                  </Button>
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
    </>
  );
};

export function DisputesManager({ personalOnly, businessOnly, clientId }: DisputesManagerProps) {
  const queryClient = useQueryClient();
  const { data: disputes, isLoading } = useDisputes(clientId);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["disputes", clientId || "self"] });
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
          <NewDisputeDialog type="personal" onCreated={handleRefresh} clientId={clientId} />
        </div>
        <DisputesList disputes={allDisputes} type="personal" onRefresh={handleRefresh} />
      </div>
    );
  }

  if (businessOnly) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <NewDisputeDialog type="business" onCreated={handleRefresh} clientId={clientId} />
        </div>
        <DisputesList disputes={allDisputes} type="business" onRefresh={handleRefresh} />
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
            <NewDisputeDialog type="personal" onCreated={handleRefresh} clientId={clientId} />
          </div>
          <DisputesList disputes={allDisputes} type="personal" onRefresh={handleRefresh} />
        </TabsContent>

        <TabsContent value="business" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <NewDisputeDialog type="business" onCreated={handleRefresh} clientId={clientId} />
          </div>
          <DisputesList disputes={allDisputes} type="business" onRefresh={handleRefresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
