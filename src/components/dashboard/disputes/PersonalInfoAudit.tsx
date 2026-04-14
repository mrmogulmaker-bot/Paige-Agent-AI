import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Shield, User, MapPin, Briefcase, Calendar, Phone, Hash, Plus, Trash2, Loader2, Download, Copy, ChevronDown, ChevronUp, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PIStatus = "correct" | "outdated" | "not_mine" | "unreviewed";

interface PIItem {
  id: string;
  value: string;
  status: PIStatus | string;
  bureauSource?: string;
  dateRange?: string;
  dbId?: string; // database record ID for updates
}

interface PersonalInfoAuditProps {
  clientId?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  unreviewed: { label: "Needs Review", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  correct: { label: "Correct", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  outdated: { label: "Belongs to Me — Outdated", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  not_mine: { label: "Does Not Belong to Me", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

const ADDRESS_STATUSES: Record<string, { label: string; color: string }> = {
  unreviewed: { label: "Needs Review", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  current: { label: "Current", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  former: { label: "Former", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  not_mine: { label: "Does Not Belong to Me", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

const BUREAU_LABELS: Record<string, string> = {
  experian: "Experian",
  transunion: "TransUnion",
  equifax: "Equifax",
  all_three: "All 3 Bureaus",
  unknown: "Bureau Unknown",
};

export function PersonalInfoAudit({ clientId }: PersonalInfoAuditProps) {
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<PIItem[]>([]);
  const [addresses, setAddresses] = useState<PIItem[]>([]);
  const [employers, setEmployers] = useState<PIItem[]>([]);
  const [dobCorrect, setDobCorrect] = useState<"correct" | "discrepancy">("correct");
  const [dobValue, setDobValue] = useState<string>("");
  const [ssnMultiple, setSsnMultiple] = useState<"single" | "multiple">("single");
  const [phones, setPhones] = useState<PIItem[]>([]);
  const [hasExtractedData, setHasExtractedData] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [letter, setLetter] = useState("");

  // Load extracted personal info from database
  useEffect(() => {
    loadExtractedData();
  }, [clientId]);

  const loadExtractedData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const targetUserId = clientId || user.id;

      // Query credit_report_personal_info for this user
      const { data: piData, error } = await supabase
        .from("credit_report_personal_info")
        .select("*")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading personal info:", error);
        setLoading(false);
        return;
      }

      const records = (piData || []) as any[];
      
      if (records.length > 0) {
        setHasExtractedData(true);

        // Deduplicate by field_type + field_value, keeping the most recent
        const seen = new Set<string>();
        const unique = records.filter(r => {
          const key = `${r.field_type}:${r.field_value}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const nameItems = unique.filter(r => r.field_type === "name").map(r => ({
          id: crypto.randomUUID(),
          value: r.field_value,
          status: r.status || "unreviewed",
          bureauSource: r.bureau_source,
          dbId: r.id,
        }));
        if (nameItems.length > 0) setNames(nameItems);

        const addrItems = unique.filter(r => r.field_type === "address").map(r => ({
          id: crypto.randomUUID(),
          value: r.field_value,
          status: r.status || "unreviewed",
          bureauSource: r.bureau_source,
          dateRange: r.date_range,
          dbId: r.id,
        }));
        if (addrItems.length > 0) setAddresses(addrItems);

        const empItems = unique.filter(r => r.field_type === "employer").map(r => ({
          id: crypto.randomUUID(),
          value: r.field_value,
          status: r.status || "unreviewed",
          bureauSource: r.bureau_source,
          dateRange: r.date_range,
          dbId: r.id,
        }));
        if (empItems.length > 0) setEmployers(empItems);

        const phoneItems = unique.filter(r => r.field_type === "phone").map(r => ({
          id: crypto.randomUUID(),
          value: r.field_value,
          status: r.status || "unreviewed",
          bureauSource: r.bureau_source,
          dbId: r.id,
        }));
        if (phoneItems.length > 0) setPhones(phoneItems);

        const dobRecord = unique.find(r => r.field_type === "dob");
        if (dobRecord) {
          setDobValue(dobRecord.value);
        }

        const ssnRecord = unique.find(r => r.field_type === "ssn_variation");
        if (ssnRecord) {
          setSsnMultiple("multiple");
        }
      }

      // If no extracted data, set defaults
      if (records.length === 0) {
        if (names.length === 0) setNames([{ id: "1", value: "", status: "correct" }]);
        if (addresses.length === 0) setAddresses([{ id: "1", value: "", status: "current" }]);
        if (employers.length === 0) setEmployers([{ id: "1", value: "", status: "correct" }]);
        if (phones.length === 0) setPhones([{ id: "1", value: "", status: "correct" }]);
      }
    } catch (err) {
      console.error("Error loading personal info:", err);
    } finally {
      setLoading(false);
    }
  };

  const hasErrors = () => {
    const nameErrors = names.some(n => n.status === "not_mine" && n.value.trim());
    const addrErrors = addresses.some(a => a.status === "not_mine" && a.value.trim());
    const employerErrors = employers.some(e => e.status === "not_mine" && e.value.trim());
    const phoneErrors = phones.some(p => p.status === "not_mine" && p.value.trim());
    return nameErrors || addrErrors || employerErrors || phoneErrors || dobCorrect === "discrepancy" || ssnMultiple === "multiple";
  };

  const addItem = (setter: React.Dispatch<React.SetStateAction<PIItem[]>>) => {
    setter(prev => [...prev, { id: crypto.randomUUID(), value: "", status: "correct" }]);
  };

  const removeItem = (setter: React.Dispatch<React.SetStateAction<PIItem[]>>, id: string) => {
    setter(prev => prev.filter(i => i.id !== id));
  };

  const updateItem = async (setter: React.Dispatch<React.SetStateAction<PIItem[]>>, id: string, field: "value" | "status", val: string) => {
    setter(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, [field]: val } : i);
      // If updating status on an extracted item, persist to DB
      if (field === "status") {
        const item = updated.find(i => i.id === id);
        if (item?.dbId) {
          supabase.from("credit_report_personal_info")
            .update({ status: val })
            .eq("id", item.dbId)
            .then(({ error }) => {
              if (error) console.error("Failed to update status:", error);
            });
        }
      }
      return updated;
    });
  };

  const BureauBadge = ({ source }: { source?: string }) => {
    if (!source) return null;
    return (
      <Badge variant="outline" className="text-xs shrink-0 flex items-center gap-1">
        <Database className="w-3 h-3" />
        {BUREAU_LABELS[source] || source}
      </Badge>
    );
  };

  const renderItemList = (
    items: PIItem[],
    setter: React.Dispatch<React.SetStateAction<PIItem[]>>,
    label: string,
    icon: React.ReactNode,
    placeholder: string,
    statusOptions: Record<string, { label: string; color: string }> = STATUS_LABELS
  ) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <Label className="font-semibold">{label}</Label>
      </div>
      {items.map(item => (
        <div key={item.id} className="space-y-1">
          <div className="flex gap-2 items-start">
            <Input
              value={item.value}
              onChange={e => updateItem(setter, item.id, "value", e.target.value)}
              placeholder={placeholder}
              className="flex-1"
              readOnly={!!item.dbId}
            />
            <Select value={item.status} onValueChange={v => updateItem(setter, item.id, "status", v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusOptions).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!item.dbId && items.length > 1 && (
              <Button variant="ghost" size="icon" onClick={() => removeItem(setter, item.id)} className="shrink-0">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 pl-1">
            {item.bureauSource && <BureauBadge source={item.bureauSource} />}
            {item.dateRange && (
              <span className="text-xs text-muted-foreground">{item.dateRange}</span>
            )}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => addItem(setter)}>
        <Plus className="w-3 h-3 mr-1" /> Add {label.replace(/\s+History$/, "")}
      </Button>
    </div>
  );

  const generateCorrectionLetter = async (bureau: string) => {
    setIsGenerating(true);
    setLetter("");

    const errorItems: string[] = [];
    names.filter(n => n.status === "not_mine" && n.value.trim()).forEach(n => errorItems.push(`Name variation "${n.value}" does not belong to the consumer — remove from file.`));
    addresses.filter(a => a.status === "not_mine" && a.value.trim()).forEach(a => errorItems.push(`Address "${a.value}" does not belong to the consumer — remove from file. This may indicate a mixed file.`));
    employers.filter(e => e.status === "not_mine" && e.value.trim()).forEach(e => errorItems.push(`Employer "${e.value}" is incorrect — remove from file.`));
    phones.filter(p => p.status === "not_mine" && p.value.trim()).forEach(p => errorItems.push(`Phone number "${p.value}" does not belong to the consumer — remove from file.`));
    if (dobCorrect === "discrepancy") errorItems.push("Date of birth on file contains a discrepancy — correct to the consumer's actual date of birth.");
    if (ssnMultiple === "multiple") errorItems.push("Multiple SSN variations detected on file — this is a serious data integrity issue. Only the consumer's actual SSN should appear.");

    if (errorItems.length === 0) {
      toast.info("No personal information errors flagged");
      setIsGenerating(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("generate-dispute-letter", {
        body: {
          bureauData: { name: bureau, totalAccounts: 0, derogatoryItems: 0, delinquentItems: 0 },
          issueType: `PERSONAL INFORMATION CORRECTION REQUEST\n\nThe following personal information items on the consumer's credit file are inaccurate and must be corrected or removed pursuant to FCRA Section 611:\n\n${errorItems.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nThe consumer requests that only accurate, verified personal information remain in their file. Failure to correct these items may result in mixed file issues and inaccurate credit reporting.`,
        },
      });

      if (error) throw error;
      if (data?.letter) {
        setLetter(data.letter);
        toast.success(`Personal Information Correction Letter generated for ${bureau}`);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate letter");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <CardTitle className="text-lg">Step 1: Personal Information Audit</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Correcting personal information errors before disputing accounts dramatically improves dispute success rates. Bureaus match disputes to consumer files using personal information — corrupted personal data creates investigation failures and mixed-file risks.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasExtractedData && (
              <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0">
                <Database className="w-3 h-3 mr-1" /> Auto-populated from report
              </Badge>
            )}
            {hasErrors() && (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-0">
                <AlertTriangle className="w-3 h-3 mr-1" /> Errors Found
              </Badge>
            )}
            {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Loading personal information from credit report...</span>
            </div>
          ) : (
            <>
              {/* Name Variations */}
              {renderItemList(names, setNames, "Name Variations", <User className="w-4 h-4 text-primary" />, "e.g. John A. Smith, John Smith Jr.")}

              {/* Address History */}
              {renderItemList(addresses, setAddresses, "Address History", <MapPin className="w-4 h-4 text-primary" />, "e.g. 123 Main St, Apt 4, New York, NY 10001", ADDRESS_STATUSES)}
              <div className="pl-6 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Addresses you never lived at may indicate a mixed file — another consumer's data has merged with yours. Flag these for immediate removal.
              </div>

              {/* Employers */}
              {renderItemList(employers, setEmployers, "Employers", <Briefcase className="w-4 h-4 text-primary" />, "e.g. ABC Corporation")}

              {/* Date of Birth */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <Label className="font-semibold">Date of Birth</Label>
                  {dobValue && (
                    <Badge variant="outline" className="text-xs">
                      <Database className="w-3 h-3 mr-1" /> {dobValue}
                    </Badge>
                  )}
                </div>
                <Select value={dobCorrect} onValueChange={(v: any) => setDobCorrect(v)}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="correct">Correct on file</SelectItem>
                    <SelectItem value="discrepancy">Discrepancy detected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* SSN */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-primary" />
                  <Label className="font-semibold">Social Security Number Variations</Label>
                </div>
                <Select value={ssnMultiple} onValueChange={(v: any) => setSsnMultiple(v)}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single SSN on file</SelectItem>
                    <SelectItem value="multiple">Multiple SSN variations detected</SelectItem>
                  </SelectContent>
                </Select>
                {ssnMultiple === "multiple" && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-sm text-red-800 dark:text-red-200 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <strong>Multiple SSN variations detected — this is a serious red flag for mixed file or identity fraud and should be resolved before any other disputes are filed.</strong>
                  </div>
                )}
              </div>

              {/* Phone Numbers */}
              {renderItemList(phones, setPhones, "Phone Numbers", <Phone className="w-4 h-4 text-primary" />, "e.g. (555) 123-4567")}

              {/* Advisory Gate */}
              {hasErrors() && !letter && (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-amber-800 dark:text-amber-200">Recommendation: Correct Personal Information First</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Personal information errors were flagged. It is strongly recommended to send Personal Information Correction Letters and receive confirmation before proceeding to account-level disputes. This is an advisory — your team may proceed at their discretion.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {["Equifax", "Experian", "TransUnion"].map(bureau => (
                      <Button
                        key={bureau}
                        variant="outline"
                        size="sm"
                        onClick={() => generateCorrectionLetter(bureau)}
                        disabled={isGenerating}
                      >
                        {isGenerating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Shield className="w-3 h-3 mr-1" />}
                        Generate {bureau} PI Letter
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated Letter */}
              {letter && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold">Personal Information Correction Letter</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(letter); toast.success("Copied"); }}>
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        const blob = new Blob([letter], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "personal-info-correction-letter.txt";
                        document.body.appendChild(a);
                        a.click();
                        URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                      }}>
                        <Download className="w-3 h-3 mr-1" /> Download
                      </Button>
                    </div>
                  </div>
                  <Textarea value={letter} onChange={e => setLetter(e.target.value)} className="min-h-[300px] font-mono text-sm" />
                  <Button variant="outline" size="sm" onClick={() => setLetter("")}>Generate for Another Bureau</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
