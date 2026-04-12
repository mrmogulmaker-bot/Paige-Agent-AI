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
import { Plus, FileText, Clock, CheckCircle2, XCircle, User, Building2, Loader2, Eye, Download, Copy, Mail, AlertTriangle, Send } from "lucide-react";
import { DisputeOutcomeDialog } from "./DisputeOutcomeDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AccountTypeBadge, normalizeAccountType, getStatutoryLanguageByType } from "./disputes/AccountTypeBadge";
import { PersonalInfoAudit } from "./disputes/PersonalInfoAudit";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  draft: { label: "Draft", icon: FileText, color: "bg-muted" },
  in_progress: { label: "In Progress", icon: Clock, color: "bg-warning" },
  submitted: { label: "Submitted", icon: Clock, color: "bg-warning" },
  "round_1_submitted": { label: "Round 1 Submitted", icon: Send, color: "bg-primary/20" },
  "round_2_submitted": { label: "Round 2 Submitted", icon: Send, color: "bg-accent/20" },
  under_review: { label: "Under Review", icon: Clock, color: "bg-info" },
  resolved: { label: "Resolved", icon: CheckCircle2, color: "bg-success" },
  rejected: { label: "Rejected", icon: XCircle, color: "bg-destructive" },
};

interface DisputesManagerProps {
  personalOnly?: boolean;
  businessOnly?: boolean;
  clientId?: string;
}

// FCRA/FDCPA statutory language by account type — now delegates to centralized mapping
function getStatutoryLanguage(reasonCode: string, itemType?: string): string {
  const generic = ["validation dispute", "follow-up on existing dispute", "dispute:", "auto-generated"];
  const lower = (reasonCode || "").toLowerCase();
  const isGeneric = generic.some(g => lower.includes(g)) || lower.length < 30;
  if (!isGeneric) return reasonCode;

  const acctType = normalizeAccountType(itemType || reasonCode, null, null);
  return getStatutoryLanguageByType(acctType);
}

function useDisputes(clientId?: string) {
  return useQuery({
    queryKey: ["disputes", clientId || "self"],
    queryFn: async () => {
      if (clientId) {
        const { data, error } = await supabase.from("disputes").select("*").eq("client_id", clientId as any).order("created_at", { ascending: false });
        if (error) throw error;
        return (data as any[]) || [];
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.from("disputes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
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
        const { data, error } = await supabase.from("credit_negative_items").select("*").eq("client_id", clientId as any).eq("status", "active").order("created_at", { ascending: false });
        if (error) throw error;
        return (data as any[]) || [];
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase.from("credit_negative_items").select("*").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

// Get client display info for letter generation
import { useClientDisplayInfo } from "@/lib/getClientDisplayInfo";

function useDisputeClientInfo(clientId?: string) {
  // For internal clients, use clientId; for auth users, resolve userId at runtime
  const internalInfo = useClientDisplayInfo({ clientId });
  const selfInfo = useClientDisplayInfo({ userId: clientId ? undefined : "__self__" });

  // For auth-user mode, we need to resolve the actual user id
  const authUserInfo = useQuery({
    queryKey: ["profile-info-for-letters-v2"],
    enabled: !clientId,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { getClientDisplayInfo } = await import("@/lib/getClientDisplayInfo");
      return getClientDisplayInfo({ userId: user.id });
    },
  });

  if (clientId) {
    const info = internalInfo.data;
    return {
      data: info ? {
        name: info.full_name,
        address: info.formatted_address,
        hasAddress: info.address_complete,
        displayInfo: info,
      } : null,
      isLoading: internalInfo.isLoading,
    };
  }

  const info = authUserInfo.data;
  return {
    data: info ? {
      name: info.full_name,
      address: info.formatted_address,
      hasAddress: info.address_complete,
      displayInfo: info,
    } : null,
    isLoading: authUserInfo.isLoading,
  };
}

// ========== Bureau addresses ==========
const BUREAU_ADDRESSES: Record<string, { name: string; address: string }> = {
  equifax: { name: "Equifax Information Services LLC", address: "P.O. Box 740256, Atlanta, GA 30374" },
  experian: { name: "Experian", address: "P.O. Box 4500, Allen, TX 75013" },
  transunion: { name: "TransUnion Consumer Solutions", address: "P.O. Box 2000, Chester, PA 19016" },
};

// ========== View Details Dialog ==========
function DisputeDetailsDialog({ dispute, open, onOpenChange }: { dispute: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [letters, setLetters] = useState<any[]>([]);

  useEffect(() => {
    if (open && dispute) {
      supabase.from("dispute_letters").select("*")
        .eq("business_name", dispute.creditor_name)
        .eq("user_id", dispute.user_id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setLetters(data || []));
    }
  }, [open, dispute]);

  if (!dispute) return null;
  const statusKey = dispute.status as string;
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
            <div><Label className="text-xs text-muted-foreground">Creditor Name</Label><p className="font-medium">{dispute.creditor_name}</p></div>
            <div><Label className="text-xs text-muted-foreground">Bureau</Label><p className="font-medium">{dispute.bureau}</p></div>
            <div><Label className="text-xs text-muted-foreground">Account Number</Label><p className="font-medium">{dispute.account_number_masked || "N/A"}</p></div>
            <div><Label className="text-xs text-muted-foreground">Status</Label><Badge className={status.color}>{status.label}</Badge></div>
            <div><Label className="text-xs text-muted-foreground">Date Created</Label><p className="font-medium">{dispute.created_at ? new Date(dispute.created_at).toLocaleDateString() : "—"}</p></div>
            {dispute.dispute_round && <div><Label className="text-xs text-muted-foreground">Round</Label><p className="font-medium">Round {dispute.dispute_round}</p></div>}
          </div>
          <div><Label className="text-xs text-muted-foreground">Dispute Basis</Label><p className="text-sm mt-1 p-3 bg-muted rounded-lg">{dispute.reason_code}</p></div>
          {dispute.narrative && <div><Label className="text-xs text-muted-foreground">Notes / Narrative</Label><p className="text-sm mt-1 p-3 bg-muted rounded-lg whitespace-pre-wrap">{dispute.narrative}</p></div>}
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

// ========== Generate Single Letter Dialog (secondary) ==========
function GenerateLetterDialog({ dispute, open, onOpenChange, onLetterGenerated }: { dispute: any; open: boolean; onOpenChange: (v: boolean) => void; onLetterGenerated: () => void }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [letter, setLetter] = useState("");
  const [error, setError] = useState("");

  const disputeBasis = getStatutoryLanguage(dispute?.reason_code || "", dispute?.narrative);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError("");
    setLetter("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-dispute-letter", {
        body: { bureauData: { name: dispute.bureau || "Unknown", totalAccounts: 0, derogatoryItems: 1, delinquentItems: 0 }, issueType: `${dispute.creditor_name} — ${disputeBasis}` },
      });
      if (fnError) { setError(fnError.message || "Edge function error"); return; }
      if (data?.error) { setError(data.error); return; }
      if (data?.letter) {
        setLetter(data.letter);
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("dispute_letters").insert({ user_id: dispute.user_id || user?.id || "", dispute_type: dispute.reason_code?.substring(0, 50) || "FCRA Dispute", business_name: dispute.creditor_name, account_number: dispute.account_number_masked || null, letter_content: data.letter, status: "draft" });
        await supabase.from("disputes").update({ status: "submitted", reason_code: disputeBasis, updated_at: new Date().toISOString() } as any).eq("id", dispute.id);
        onLetterGenerated();
        toast.success("Dispute letter generated and saved");
      }
    } catch (err: any) { setError(err.message || "Unexpected error"); } finally { setIsGenerating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Dispute Letter</DialogTitle>
          <DialogDescription>Single FCRA-compliant letter for {dispute?.creditor_name} ({dispute?.bureau})</DialogDescription>
        </DialogHeader>
        {!letter && !isGenerating && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg"><Label className="text-xs text-muted-foreground">Dispute Basis</Label><p className="text-sm mt-1">{disputeBasis}</p></div>
            {error && <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm"><strong>Error:</strong> {error}</div>}
            <Button onClick={handleGenerate} className="w-full bg-gradient-gold hover:opacity-90">Generate FCRA Dispute Letter</Button>
          </div>
        )}
        {isGenerating && <div className="flex flex-col items-center py-12 space-y-4"><Loader2 className="w-8 h-8 animate-spin text-primary" /><p className="text-muted-foreground">Generating...</p></div>}
        {letter && (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-2">
              <Button onClick={() => { navigator.clipboard.writeText(letter); toast.success("Copied"); }} variant="outline" size="sm"><Copy className="w-4 h-4 mr-1" /> Copy</Button>
              <Button onClick={() => { const b = new Blob([letter], { type: "text/plain" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `dispute-${dispute.creditor_name?.replace(/\s+/g, "-")}.txt`; document.body.appendChild(a); a.click(); URL.revokeObjectURL(u); document.body.removeChild(a); }} variant="outline" size="sm"><Download className="w-4 h-4 mr-1" /> Download</Button>
            </div>
            <Textarea value={letter} onChange={(e) => setLetter(e.target.value)} className="min-h-[350px] font-mono text-sm" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ========== Round Letter Generation Dialog ==========
function RoundLettersDialog({
  disputes,
  clientId,
  clientName,
  clientAddress,
  hasAddress,
  open,
  onOpenChange,
  onComplete,
}: {
  disputes: any[];
  clientId?: string;
  clientName: string;
  clientAddress: string | null;
  hasAddress: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onComplete: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingBureau, setGeneratingBureau] = useState("");
  const [letters, setLetters] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("");
  const [error, setError] = useState("");
  const [showMailingInfo, setShowMailingInfo] = useState(false);
  const [allGenerated, setAllGenerated] = useState(false);

  // Group drafts by bureau
  const draftDisputes = disputes.filter(d => d.status === "draft" || (!d.dispute_round && d.status !== "resolved" && d.status !== "rejected"));
  const bureauGroups: Record<string, any[]> = {};
  draftDisputes.forEach(d => {
    const bureau = (d.bureau || "unknown").toLowerCase();
    if (!bureauGroups[bureau]) bureauGroups[bureau] = [];
    bureauGroups[bureau].push(d);
  });
  const bureaus = Object.keys(bureauGroups).sort();

  // Determine next round number
  const maxRound = Math.max(0, ...disputes.filter(d => d.dispute_round).map(d => d.dispute_round));
  const nextRound = maxRound + 1;

  useEffect(() => {
    if (open && bureaus.length > 0 && !activeTab) {
      setActiveTab(bureaus[0]);
    }
  }, [open, bureaus]);

  const generateAllLetters = async () => {
    setIsGenerating(true);
    setError("");
    const generated: Record<string, string> = {};

    try {
      for (const bureau of bureaus) {
        setGeneratingBureau(bureau);
        const items = bureauGroups[bureau].map(d => {
          const acctType = normalizeAccountType(d.item_type || d.narrative || d.reason_code, null, d.narrative);
          return {
            creditorName: d.creditor_name,
            accountNumber: d.account_number_masked || null,
            amount: null,
            itemType: acctType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
            disputeBasis: getStatutoryLanguageByType(acctType),
          };
        });
        

        const { data, error: fnError } = await supabase.functions.invoke("generate-dispute-letter", {
          body: { mode: "combined", bureau: bureau.charAt(0).toUpperCase() + bureau.slice(1), clientName, clientAddress: clientAddress || null, items, round: nextRound },
        });

        if (fnError) throw new Error(`${bureau}: ${fnError.message}`);
        if (data?.error) throw new Error(`${bureau}: ${data.error}`);
        if (data?.letter) generated[bureau] = data.letter;
      }

      setLetters(generated);
      setActiveTab(bureaus[0]);
      setAllGenerated(true);
      toast.success(`Generated ${Object.keys(generated).length} bureau letters`);
    } catch (err: any) {
      setError(err.message || "Failed to generate letters");
      toast.error(err.message || "Letter generation failed");
    } finally {
      setIsGenerating(false);
      setGeneratingBureau("");
    }
  };

  const downloadLetter = (bureau: string) => {
    const content = letters[bureau];
    if (!content) return;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Round-${nextRound}-${bureau}-dispute-letter.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success(`${bureau} letter downloaded`);
  };

  const downloadAll = () => {
    bureaus.forEach(b => downloadLetter(b));
  };

  const copyLetter = (bureau: string) => {
    navigator.clipboard.writeText(letters[bureau] || "");
    toast.success("Letter copied to clipboard");
  };

  const confirmAndSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const now = new Date().toISOString();

      for (const bureau of bureaus) {
        const items = bureauGroups[bureau];
        const disputeIds = items.map((d: any) => d.id);

        // Save the combined letter
        await supabase.from("dispute_letters").insert({
          user_id: items[0].user_id || user.id,
          dispute_type: `Round ${nextRound} Combined - ${bureau}`,
          business_name: items.map((d: any) => d.creditor_name).join(", "),
          letter_content: letters[bureau],
          status: "draft",
          bureau,
          dispute_round: nextRound,
          dispute_ids: disputeIds,
        } as any);

        // Update each dispute's status and round
        for (const d of items) {
          await supabase.from("disputes").update({
            status: `round_${nextRound}_submitted`,
            dispute_round: nextRound,
            round_submitted_at: now,
            reason_code: getStatutoryLanguage(d.reason_code || "", d.narrative),
            updated_at: now,
          } as any).eq("id", d.id);
        }
      }

      toast.success(`Round ${nextRound} letters saved — ${draftDisputes.length} disputes marked as submitted`);
      setShowMailingInfo(true);
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to save letters");
    }
  };

  const bureauLabel = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Mail className="w-5 h-5" /> Generate Round {nextRound} Letters
          </DialogTitle>
          <DialogDescription>
            {draftDisputes.length} disputes across {bureaus.length} bureau{bureaus.length !== 1 ? "s" : ""} — one combined letter per bureau
          </DialogDescription>
        </DialogHeader>

        {/* Pre-generation summary */}
        {!allGenerated && !isGenerating && (
          <div className="space-y-4">
            {!hasAddress && (
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-lg text-amber-800 dark:text-amber-200 text-sm flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <strong>Address missing:</strong> Please add the client's mailing address in their profile settings before sending these letters. The letter header will show a placeholder until an address is provided.
                </div>
              </div>
            )}
            <div className="grid gap-3">
              {bureaus.map(bureau => (
                <Card key={bureau} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-lg">{bureauLabel(bureau)}</h4>
                    <Badge variant="outline">{bureauGroups[bureau].length} item{bureauGroups[bureau].length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="space-y-1">
                    {bureauGroups[bureau].map((d: any) => (
                      <div key={d.id} className="text-sm flex items-center gap-2">
                        <AccountTypeBadge itemType={d.item_type || d.narrative || d.reason_code} />
                        <span>{d.creditor_name} {d.account_number_masked ? `(${d.account_number_masked})` : ""}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
            {error && <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm"><strong>Error:</strong> {error}</div>}
            <Button onClick={generateAllLetters} className="w-full bg-gradient-gold hover:opacity-90 h-12 text-base">
              <Send className="w-5 h-5 mr-2" />
              Generate {bureaus.length} Bureau Letter{bureaus.length !== 1 ? "s" : ""}
            </Button>
          </div>
        )}

        {/* Generation progress */}
        {isGenerating && (
          <div className="flex flex-col items-center py-12 space-y-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Generating {bureauLabel(generatingBureau)} letter...</p>
            <p className="text-xs text-muted-foreground">{Object.keys(letters).length} of {bureaus.length} complete</p>
          </div>
        )}

        {/* Letter preview with bureau tabs */}
        {allGenerated && !showMailingInfo && (
          <div className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full">
                {bureaus.map(b => (
                  <TabsTrigger key={b} value={b} className="flex-1 gap-1">
                    {bureauLabel(b)} <Badge variant="secondary" className="text-xs ml-1">{bureauGroups[b].length}</Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
              {bureaus.map(b => (
                <TabsContent key={b} value={b}>
                  <div className="flex items-center justify-end gap-2 mb-2">
                    <Button onClick={() => copyLetter(b)} variant="outline" size="sm"><Copy className="w-4 h-4 mr-1" /> Copy</Button>
                    <Button onClick={() => downloadLetter(b)} variant="outline" size="sm"><Download className="w-4 h-4 mr-1" /> Download</Button>
                  </div>
                  <Textarea
                    value={letters[b] || ""}
                    onChange={(e) => setLetters(prev => ({ ...prev, [b]: e.target.value }))}
                    className="min-h-[400px] font-mono text-sm"
                  />
                </TabsContent>
              ))}
            </Tabs>
            <div className="flex gap-2">
              <Button onClick={downloadAll} variant="outline" className="flex-1"><Download className="w-4 h-4 mr-2" /> Download All Letters</Button>
              <Button onClick={confirmAndSave} className="flex-1 bg-gradient-gold hover:opacity-90"><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm & Save Round {nextRound}</Button>
            </div>
          </div>
        )}

        {/* Mailing instructions */}
        {showMailingInfo && (
          <div className="space-y-4">
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <h4 className="font-semibold text-lg mb-3 flex items-center gap-2"><Mail className="w-5 h-5" /> Mailing Instructions</h4>
              <p className="text-sm text-muted-foreground mb-4">Send each letter via <strong>USPS Certified Mail, Return Receipt Requested</strong>. Keep the tracking number for your records.</p>
              <div className="grid gap-3">
                {bureaus.map(b => {
                  const info = BUREAU_ADDRESSES[b] || { name: bureauLabel(b), address: "See bureau website" };
                  return (
                    <Card key={b} className="p-3">
                      <p className="font-semibold">{info.name}</p>
                      <p className="text-sm text-muted-foreground">{info.address}</p>
                    </Card>
                  );
                })}
              </div>
            </div>
            <Card className="p-4 border-accent/30 bg-accent/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">30-Day Follow-Up Reminder</p>
                  <p className="text-xs text-muted-foreground mt-1">Bureaus have 30 days to investigate. Mark your calendar for <strong>{new Date(Date.now() + 35 * 86400000).toLocaleDateString()}</strong> to check for responses. If items remain unresolved, start Round {nextRound + 1} with escalated language.</p>
                </div>
              </div>
            </Card>
            <Button onClick={() => onOpenChange(false)} className="w-full" variant="outline">Close</Button>
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
        const acctType = normalizeAccountType(item.item_type, item.status, item.notes);
        setReasonCode(getStatutoryLanguageByType(acctType));
        setNarrative(item.item_type || "");
      }
    }
  }, [selectedItem, negativeItems]);

  const handleSubmit = async () => {
    if (!creditorName || !bureau || !reasonCode) { toast.error("Please fill in all required fields"); return; }
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      // Resolve item_type from selected negative item
      let resolvedItemType: string | null = null;
      if (selectedItem && negativeItems) {
        const item = negativeItems.find((n: any) => n.id === selectedItem);
        if (item) resolvedItemType = item.item_type || null;
      }
      const insertData: any = { user_id: user.id, creditor_name: creditorName, bureau, reason_code: reasonCode, narrative: narrative || null, status: "draft", item_type: resolvedItemType };
      if (clientId) insertData.client_id = clientId;
      const { error } = await supabase.from("disputes").insert(insertData);
      if (error) throw error;
      toast.success("Dispute created");
      setOpen(false);
      setCreditorName(""); setBureau(""); setReasonCode(""); setNarrative(""); setSelectedItem("");
      onCreated();
    } catch (err: any) { toast.error(err.message); } finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="w-4 h-4 mr-2" /> New {type === "personal" ? "Personal" : "Business"} Dispute</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>New {type === "personal" ? "Personal" : "Business"} Dispute</DialogTitle>
          <DialogDescription>Create a new dispute record manually or from existing negative items.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {negativeItems && negativeItems.length > 0 && (
            <div className="space-y-2">
              <Label>Pre-fill from Negative Item</Label>
              <Select value={selectedItem} onValueChange={setSelectedItem}>
                <SelectTrigger><SelectValue placeholder="Select a negative item..." /></SelectTrigger>
                <SelectContent>{negativeItems.map((item: any) => (<SelectItem key={item.id} value={item.id}>{item.creditor_name} — {item.item_type} ({item.bureau})</SelectItem>))}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2"><Label>Account / Creditor Name *</Label><Input value={creditorName} onChange={(e) => setCreditorName(e.target.value)} placeholder="e.g. Capital One" /></div>
          <div className="space-y-2">
            <Label>Bureau *</Label>
            <Select value={bureau} onValueChange={setBureau}>
              <SelectTrigger><SelectValue placeholder="Select bureau..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Experian">Experian</SelectItem>
                <SelectItem value="Equifax">Equifax</SelectItem>
                <SelectItem value="TransUnion">TransUnion</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Dispute Reason / Basis *</Label><Textarea value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} placeholder="FCRA/FDCPA statutory basis..." rows={3} /></div>
          <div className="space-y-2"><Label>Additional Notes</Label><Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Any additional details..." rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-gradient-gold hover:opacity-90">{isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create Dispute</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ========== Disputes List ==========
const DisputesList = ({ disputes, type, onRefresh }: { disputes: any[]; type: string; onRefresh: () => void }) => {
  const [detailsDispute, setDetailsDispute] = useState<any>(null);
  const [letterDispute, setLetterDispute] = useState<any>(null);
  const [outcomeDispute, setOutcomeDispute] = useState<any>(null);

  return (
    <>
      <DisputeDetailsDialog dispute={detailsDispute} open={!!detailsDispute} onOpenChange={(v) => !v && setDetailsDispute(null)} />
      <GenerateLetterDialog dispute={letterDispute} open={!!letterDispute} onOpenChange={(v) => !v && setLetterDispute(null)} onLetterGenerated={onRefresh} />
      <DisputeOutcomeDialog dispute={outcomeDispute} open={!!outcomeDispute} onOpenChange={(v) => !v && setOutcomeDispute(null)} onSaved={onRefresh} />
      <div className="grid gap-4">
        {disputes.map((dispute) => {
          const statusKey = dispute.status as string;
          const status = statusConfig[statusKey] || statusConfig.draft;
          const StatusIcon = status.icon;

          return (
            <Card key={dispute.id} className="shadow-card hover:shadow-glow transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{dispute.creditor_name}</CardTitle>
                    <CardDescription>Bureau: {dispute.bureau}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <AccountTypeBadge itemType={dispute.narrative || dispute.reason_code} />
                    {dispute.dispute_round && <Badge variant="secondary" className="text-xs">R{dispute.dispute_round}</Badge>}
                    <Badge className={status.color}><StatusIcon className="w-3 h-3 mr-1" />{status.label}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Reason</p><p className="font-medium line-clamp-2 text-xs">{dispute.reason_code}</p></div>
                  <div><p className="text-muted-foreground text-xs">Created</p><p className="font-medium text-xs">{dispute.created_at ? new Date(dispute.created_at).toLocaleDateString() : "—"}</p></div>
                  {dispute.account_number_masked && <div><p className="text-muted-foreground text-xs">Account #</p><p className="font-medium text-xs">{dispute.account_number_masked}</p></div>}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDetailsDispute(dispute)}><Eye className="w-3 h-3 mr-1" /> Details</Button>
                  {dispute.status === "draft" && (
                    <Button variant="outline" size="sm" onClick={() => setLetterDispute(dispute)}><FileText className="w-3 h-3 mr-1" /> Single Letter</Button>
                  )}
                  {dispute.status !== "draft" && dispute.status !== "resolved" && dispute.status !== "rejected" && (
                    <Button variant="outline" size="sm" onClick={() => setOutcomeDispute(dispute)}><CheckCircle2 className="w-3 h-3 mr-1" /> Record Outcome</Button>
                  )}
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
              <p className="text-muted-foreground mb-4">Upload a credit report via Paige chat to auto-generate dispute drafts, or create one manually.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
};

// ========== Main Component ==========
export function DisputesManager({ personalOnly, businessOnly, clientId }: DisputesManagerProps) {
  const queryClient = useQueryClient();
  const { data: disputes, isLoading } = useDisputes(clientId);
  const { data: activeInfo } = useDisputeClientInfo(clientId);
  const [roundDialogOpen, setRoundDialogOpen] = useState(false);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["disputes", clientId || "self"] });
  };

  const allDisputes = disputes || [];
  const draftCount = allDisputes.filter(d => d.status === "draft" || (!d.dispute_round && d.status !== "resolved" && d.status !== "rejected")).length;

  // Group drafts by bureau for the summary
  const draftsByBureau: Record<string, number> = {};
  allDisputes.filter(d => d.status === "draft").forEach(d => {
    const b = (d.bureau || "unknown").toLowerCase();
    draftsByBureau[b] = (draftsByBureau[b] || 0) + 1;
  });
  const bureauCount = Object.keys(draftsByBureau).length;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  const renderRoundButton = () => {
    if (draftCount === 0) return null;
    const maxRound = Math.max(0, ...allDisputes.filter(d => d.dispute_round).map(d => d.dispute_round));
    const nextRound = maxRound + 1;
    return (
      <Button onClick={() => setRoundDialogOpen(true)} className="bg-gradient-gold hover:opacity-90 h-11 text-base px-6">
        <Send className="w-5 h-5 mr-2" />
        Generate Round {nextRound} Letters ({draftCount} disputes → {bureauCount} letter{bureauCount !== 1 ? "s" : ""})
      </Button>
    );
  };

  const renderContent = (type: "personal" | "business") => (
    <div className="space-y-6">
      {type === "personal" && <PersonalInfoAudit clientId={clientId} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {renderRoundButton()}
        <NewDisputeDialog type={type} onCreated={handleRefresh} clientId={clientId} />
      </div>
      <DisputesList disputes={allDisputes} type={type} onRefresh={handleRefresh} />
      <RoundLettersDialog
        disputes={allDisputes}
        clientId={clientId}
        clientName={activeInfo?.name || "Consumer"}
        clientAddress={activeInfo?.address || null}
        hasAddress={activeInfo?.hasAddress || false}
        open={roundDialogOpen}
        onOpenChange={setRoundDialogOpen}
        onComplete={handleRefresh}
      />
    </div>
  );

  if (personalOnly) return renderContent("personal");
  if (businessOnly) return renderContent("business");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-foreground">Credit Disputes</h1>
        <p className="text-muted-foreground mt-2">Manage and track your personal and business credit disputes</p>
      </div>
      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="personal" className="gap-2"><User className="w-4 h-4" />Personal Disputes</TabsTrigger>
          <TabsTrigger value="business" className="gap-2"><Building2 className="w-4 h-4" />Business Disputes</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="space-y-6 mt-6">{renderContent("personal")}</TabsContent>
        <TabsContent value="business" className="space-y-6 mt-6">{renderContent("business")}</TabsContent>
      </Tabs>
    </div>
  );
}
