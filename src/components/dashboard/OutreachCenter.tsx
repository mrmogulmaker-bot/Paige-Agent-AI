import { useState, useEffect } from "react";
import { useClientDisplayInfo } from "@/lib/getClientDisplayInfo";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Mail, RefreshCw, Download, Copy, Loader2, AlertTriangle, Check, FileDown } from "lucide-react";
import { format } from "date-fns";

const OUTREACH_TYPES = [
  { id: "lender_introduction", label: "Lender Introduction Letter", icon: FileText, description: "Introduce a client to a new lender" },
  { id: "application_cover", label: "Application Cover Letter", icon: FileText, description: "Cover letter for a funding application" },
  { id: "lender_followup", label: "Lender Follow-Up Email", icon: Mail, description: "Follow up on a previous outreach" },
  { id: "client_progress_update", label: "Client Progress Update", icon: RefreshCw, description: "Update on client milestones" },
] as const;

interface OutreachCenterProps {
  clientUserId: string;
}

interface ComplianceFlag {
  phrase: string;
  concern: string;
  suggestion: string;
  dismissed?: boolean;
}

export function OutreachCenter({ clientUserId }: OutreachCenterProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [complianceReview, setComplianceReview] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [complianceFlags, setComplianceFlags] = useState<ComplianceFlag[]>([]);
  const [complianceStatus, setComplianceStatus] = useState<string>("pending");
  const [drafts, setDrafts] = useState<any[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  // Form state
  const [lenderName, setLenderName] = useState("");
  const [fundingProduct, setFundingProduct] = useState("");
  const [originalDate, setOriginalDate] = useState("");
  const [daysOverdue, setDaysOverdue] = useState("");
  const [selectedMilestones, setSelectedMilestones] = useState<string[]>([]);
  const [progressNotes, setProgressNotes] = useState("");

  // Data from client
  const [lenderResults, setLenderResults] = useState<any[]>([]);
  const [clientMilestones, setClientMilestones] = useState<string[]>([]);
  const [clientContext, setClientContext] = useState<any>({});

  // Use centralized client display info
  const { data: displayInfo } = useClientDisplayInfo({ userId: clientUserId });

  useEffect(() => {
    loadDrafts();
    loadClientContext();
    loadLenderResults();
    loadMilestones();
  }, [clientUserId]);

  const loadDrafts = async () => {
    const { data } = await supabase
      .from("outreach_drafts")
      .select("*")
      .eq("client_user_id", clientUserId)
      .order("created_at", { ascending: false });
    setDrafts(data || []);
  };

  const loadClientContext = async () => {
    // Use centralized utility for name/entity info
    const { getClientDisplayInfo } = await import("@/lib/getClientDisplayInfo");
    const info = await getClientDisplayInfo({ userId: clientUserId });

    // Load credit factor scores
    const { data: creditFactors } = await supabase
      .from("credit_factor_scores")
      .select("overall_fundability_score")
      .eq("user_id", clientUserId)
      .maybeSingle();

    // Load build scores
    const { data: buildScore } = await supabase
      .from("build_scores")
      .select("build_score")
      .eq("user_id", clientUserId)
      .maybeSingle();

    // Load funding secured total
    const { data: funding } = await supabase
      .from("funding_secured")
      .select("amount")
      .eq("user_id", clientUserId);

    const fundingTotal = (funding || []).reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0);

    setClientContext({
      full_name: info.full_name,
      email: info.email || "N/A",
      phone: info.phone || "N/A",
      entity_name: info.entity_name || "N/A",
      entity_type: "N/A",
      revenue_band: "N/A",
      pme_score: creditFactors?.overall_fundability_score || "N/A",
      fico_score: "On file",
      build_score: buildScore?.build_score || "N/A",
      funding_total: fundingTotal,
      financial_summary: "See client file for details",
      milestones_completed: clientMilestones,
      // Sender info — use business name if available, else full name
      sender_name: info.entity_name || info.full_name,
      sender_email: info.email || "N/A",
      sender_phone: info.phone || "N/A",
    });
  };

  const loadLenderResults = async () => {
    const { data } = await supabase
      .from("lender_research_results")
      .select("results")
      .eq("user_id", clientUserId)
      .order("created_at", { ascending: false })
      .limit(5);

    const lenders: any[] = [];
    (data || []).forEach((r: any) => {
      if (r.results?.lenders) {
        r.results.lenders.forEach((l: any) => {
          if (l.name && !lenders.find((e: any) => e.name === l.name)) {
            lenders.push(l);
          }
        });
      }
    });
    setLenderResults(lenders);
  };

  const loadMilestones = async () => {
    const { data } = await supabase
      .from("audit_logs")
      .select("data, created_at")
      .eq("user_id", clientUserId)
      .eq("entity", "milestone")
      .order("created_at", { ascending: false })
      .limit(50);

    const names = (data || [])
      .map((m: any) => m.data?.milestone_name)
      .filter(Boolean);
    setClientMilestones([...new Set(names)] as string[]);
  };

  const handleGenerate = async () => {
    if (!selectedType) return;
    setIsGenerating(true);
    setDraftContent("");
    setComplianceFlags([]);
    setActiveDraftId(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const body: any = {
        outreach_type: selectedType,
        client_context: { ...clientContext, milestones_completed: clientMilestones },
        compliance_review: complianceReview,
      };

      if (selectedType === "lender_introduction" || selectedType === "application_cover") {
        body.lender_name = lenderName;
        body.funding_product = fundingProduct;
      } else if (selectedType === "lender_followup") {
        body.lender_name = lenderName;
        body.followup_details = { original_date: originalDate, days_overdue: daysOverdue };
      } else if (selectedType === "client_progress_update") {
        body.milestones = selectedMilestones;
        body.notes = progressNotes;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-outreach-draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to generate draft");
      }

      const result = await response.json();
      setDraftContent(result.draft);
      setComplianceFlags((result.compliance_flags || []).map((f: any) => ({ ...f, dismissed: false })));
      setComplianceStatus(result.compliance_status);

      // Save to database
      const { data: saved, error: saveErr } = await supabase.from("outreach_drafts").insert({
        client_user_id: clientUserId,
        outreach_type: selectedType,
        lender_name: lenderName || null,
        funding_product: fundingProduct || null,
        generated_content: result.draft,
        compliance_status: result.compliance_status,
        compliance_flag_count: result.compliance_flags?.length || 0,
        compliance_flags: result.compliance_flags || [],
        created_by: session.user.id,
      }).select().single();

      if (saved) setActiveDraftId(saved.id);
      if (saveErr) console.error("Save error:", saveErr);

      // Log activity
      await supabase.from("audit_logs").insert({
        user_id: clientUserId,
        entity: "outreach",
        action: "draft_generated",
        data: { outreach_type: selectedType, lender_name: lenderName || null },
      });

      loadDrafts();
      toast({ title: "Draft Generated", description: "Review and edit before downloading." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setIsGenerating(false);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(draftContent);
    toast({ title: "Copied to clipboard" });
  };

  const handleDownloadPDF = async () => {
    // Mark as downloaded and admin_edited if content was modified
    if (activeDraftId) {
      const { data: orig } = await supabase.from("outreach_drafts").select("generated_content").eq("id", activeDraftId).single();
      const edited = orig?.generated_content !== draftContent;
      await supabase.from("outreach_drafts").update({
        downloaded_at: new Date().toISOString(),
        admin_edited: edited,
        edited_content: edited ? draftContent : null,
      }).eq("id", activeDraftId);
    }

    // Create a simple PDF-like text download (branded)
    const blob = new Blob([
      `PROJECT MOGUL ENTERPRISE INC.\n`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`,
      draftContent,
      `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`,
      `Generated by PaigeAgent.ai | ${new Date().toLocaleDateString()}\n`,
      `Project Mogul Enterprise Inc. | Confidential\n`,
    ], { type: "text/plain" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PME_Outreach_${selectedType}_${format(new Date(), "yyyyMMdd")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded" });
    loadDrafts();
  };

  const handleDownloadDOCX = async () => {
    if (activeDraftId) {
      const { data: orig } = await supabase.from("outreach_drafts").select("generated_content").eq("id", activeDraftId).single();
      const edited = orig?.generated_content !== draftContent;
      await supabase.from("outreach_drafts").update({
        downloaded_at: new Date().toISOString(),
        admin_edited: edited,
        edited_content: edited ? draftContent : null,
      }).eq("id", activeDraftId);
    }

    // Simple DOCX-compatible download
    const blob = new Blob([draftContent], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PME_Outreach_${selectedType}_${format(new Date(), "yyyyMMdd")}.docx`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded" });
    loadDrafts();
  };

  const reopenDraft = (draft: any) => {
    setSelectedType(draft.outreach_type);
    setDraftContent(draft.edited_content || draft.generated_content);
    setComplianceFlags((draft.compliance_flags || []).map((f: any) => ({ ...f, dismissed: false })));
    setComplianceStatus(draft.compliance_status);
    setActiveDraftId(draft.id);
    setLenderName(draft.lender_name || "");
    setFundingProduct(draft.funding_product || "");
  };

  const dismissFlag = (index: number) => {
    setComplianceFlags(prev => prev.map((f, i) => i === index ? { ...f, dismissed: true } : f));
  };

  const unresolvedFlags = complianceFlags.filter(f => !f.dismissed);
  const hasUnresolvedFlags = unresolvedFlags.length > 0;

  const renderHighlightedContent = () => {
    if (!complianceFlags.length || complianceFlags.every(f => f.dismissed)) {
      return draftContent;
    }

    let result = draftContent;
    // Simple highlighting - wrap flagged phrases
    complianceFlags.forEach((flag, idx) => {
      if (!flag.dismissed && result.includes(flag.phrase)) {
        result = result.replace(
          flag.phrase,
          `⚠️[${flag.phrase}]⚠️`
        );
      }
    });
    return result;
  };

  const typeLabel = (type: string) => OUTREACH_TYPES.find(t => t.id === type)?.label || type;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-foreground">Outreach Draft Center</h3>
        <p className="text-sm text-muted-foreground mt-1">Generate professional lender outreach documents for this client.</p>
      </div>

      {/* Outreach Type Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {OUTREACH_TYPES.map(type => (
          <Button
            key={type.id}
            variant={selectedType === type.id ? "default" : "outline"}
            className={`h-auto py-4 flex flex-col items-center gap-2 ${
              selectedType === type.id ? "bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => {
              setSelectedType(type.id);
              setDraftContent("");
              setComplianceFlags([]);
              setActiveDraftId(null);
            }}
          >
            <type.icon className="w-5 h-5" />
            <span className="text-xs font-medium text-center leading-tight">{type.label}</span>
          </Button>
        ))}
      </div>

      {/* Generation Panel */}
      {selectedType && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{typeLabel(selectedType)}</CardTitle>
              <div className="flex items-center gap-2">
                <Label htmlFor="compliance-toggle" className="text-xs text-muted-foreground">Compliance Review</Label>
                <Switch id="compliance-toggle" checked={complianceReview} onCheckedChange={setComplianceReview} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lender selection for intro & cover */}
            {(selectedType === "lender_introduction" || selectedType === "application_cover") && (
              <>
                <div>
                  <Label className="text-sm">Lender</Label>
                  {lenderResults.length > 0 ? (
                    <Select value={lenderName} onValueChange={setLenderName}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select from research or type below" />
                      </SelectTrigger>
                      <SelectContent>
                        {lenderResults.map((l: any, i: number) => (
                          <SelectItem key={i} value={l.name}>{l.name} {l.type ? `(${l.type})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input className="mt-2" placeholder="Or type lender name manually..." value={lenderName} onChange={e => setLenderName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Funding Product</Label>
                  <Input className="mt-1" placeholder="e.g. SBA 7(a), Business Line of Credit..." value={fundingProduct} onChange={e => setFundingProduct(e.target.value)} />
                </div>
              </>
            )}

            {/* Follow-up fields */}
            {selectedType === "lender_followup" && (
              <>
                <div>
                  <Label className="text-sm">Lender</Label>
                  {lenderResults.length > 0 ? (
                    <Select value={lenderName} onValueChange={setLenderName}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select lender" />
                      </SelectTrigger>
                      <SelectContent>
                        {lenderResults.map((l: any, i: number) => (
                          <SelectItem key={i} value={l.name}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Input className="mt-2" placeholder="Or type lender name..." value={lenderName} onChange={e => setLenderName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Original Outreach Date</Label>
                    <Input type="date" className="mt-1" value={originalDate} onChange={e => setOriginalDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Days Overdue</Label>
                    <Input type="number" className="mt-1" placeholder="e.g. 7" value={daysOverdue} onChange={e => setDaysOverdue(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {/* Progress update fields */}
            {selectedType === "client_progress_update" && (
              <>
                <div>
                  <Label className="text-sm">Select Milestones to Reference</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {clientMilestones.length > 0 ? clientMilestones.map(m => (
                      <div key={m} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedMilestones.includes(m)}
                          onCheckedChange={(checked) => {
                            setSelectedMilestones(prev => checked ? [...prev, m] : prev.filter(x => x !== m));
                          }}
                          id={`ms-${m}`}
                        />
                        <label htmlFor={`ms-${m}`} className="text-sm cursor-pointer">{m}</label>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground col-span-2">No milestones recorded yet.</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-sm">Additional Notes (optional)</Label>
                  <Textarea className="mt-1" placeholder="Any additional context to include..." value={progressNotes} onChange={e => setProgressNotes(e.target.value)} rows={3} />
                </div>
              </>
            )}

            <Button onClick={handleGenerate} disabled={isGenerating} className="bg-gradient-gold hover:opacity-90">
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
              ) : (
                "Generate Draft"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Compliance Flags */}
      {complianceFlags.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Compliance Review — {unresolvedFlags.length} Flag{unresolvedFlags.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <TooltipProvider>
              {complianceFlags.map((flag, idx) => (
                <div key={idx} className={`flex items-start justify-between gap-3 p-2 rounded border ${flag.dismissed ? "opacity-50 border-border" : "border-amber-500/30 bg-amber-500/5"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">"{flag.phrase}"</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{flag.concern}</p>
                    <p className="text-xs text-foreground mt-0.5">
                      <span className="font-medium">Suggested:</span> {flag.suggestion}
                    </p>
                  </div>
                  {!flag.dismissed && (
                    <Button size="sm" variant="ghost" onClick={() => dismissFlag(idx)} className="shrink-0">
                      Dismiss
                    </Button>
                  )}
                  {flag.dismissed && <Check className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />}
                </div>
              ))}
            </TooltipProvider>
          </CardContent>
        </Card>
      )}

      {/* Draft Editor */}
      {draftContent && (
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Draft Editor</CardTitle>
            <CardDescription>Edit the draft below before downloading.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={draftContent}
              onChange={e => setDraftContent(e.target.value)}
              rows={20}
              className="font-mono text-sm leading-relaxed"
            />

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleDownloadPDF} disabled={hasUnresolvedFlags} variant="default">
                <Download className="w-4 h-4 mr-2" /> Download as PDF
              </Button>
              <Button onClick={handleDownloadDOCX} disabled={hasUnresolvedFlags} variant="outline">
                <FileDown className="w-4 h-4 mr-2" /> Download as DOCX
              </Button>
              <Button onClick={handleCopyToClipboard} variant="outline">
                <Copy className="w-4 h-4 mr-2" /> Copy to Clipboard
              </Button>
              {hasUnresolvedFlags && (
                <p className="text-xs text-amber-500 self-center">Resolve all compliance flags before downloading.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outreach History */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">Outreach History</CardTitle>
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No outreach drafts generated yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Lender</TableHead>
                    <TableHead>Compliance</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map(draft => (
                    <TableRow key={draft.id}>
                      <TableCell className="text-xs">{format(new Date(draft.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-sm">{typeLabel(draft.outreach_type)}</TableCell>
                      <TableCell className="text-sm">{draft.lender_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={draft.compliance_status === "passed" ? "default" : "secondary"} className={`text-[10px] ${draft.compliance_status === "flagged" ? "bg-amber-500/20 text-amber-600" : ""}`}>
                          {draft.compliance_status === "passed" ? "Passed" : `${draft.compliance_flag_count} Flag${draft.compliance_flag_count !== 1 ? "s" : ""}`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => reopenDraft(draft)}>Reopen</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
