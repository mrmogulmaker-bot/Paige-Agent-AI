import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CATEGORY_ORDER, CATEGORIES, type ProductCategoryKey } from "@/lib/lenderCategories";
import { STATUS_OPTIONS, STATUS_LABELS, type FundingJourneyStatus } from "@/lib/fundingJourney";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When set, prefills the form (used for editing). */
  applicationId?: string | null;
  /** When set (admin/coach use), overrides current auth.uid as the row's user_id. */
  targetUserId?: string;
}

interface LenderOption {
  id: string;
  lender_name: string;
  product_name: string;
  product_category: string | null;
}

export function LogApplicationDialog({ open, onOpenChange, applicationId, targetUserId }: Props) {
  const qc = useQueryClient();
  const [lenderName, setLenderName] = useState("");
  const [lenderId, setLenderId] = useState<string | null>(null);
  const [productCategory, setProductCategory] = useState<ProductCategoryKey | "">("");
  const [productName, setProductName] = useState("");
  const [amountRequested, setAmountRequested] = useState("");
  const [applicationDate, setApplicationDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<FundingJourneyStatus>("submitted");
  const [notes, setNotes] = useState("");
  const [creditScore, setCreditScore] = useState("");
  const [lenders, setLenders] = useState<LenderOption[]>([]);
  const [lenderPickerOpen, setLenderPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load lender options for autocomplete
  useEffect(() => {
    if (!open) return;
    supabase
      .from("lender_products")
      .select("id, lender_name, product_name, product_category")
      .eq("is_active", true)
      .order("lender_name")
      .limit(500)
      .then(({ data }) => setLenders((data || []) as LenderOption[]));
  }, [open]);

  // Load existing app if editing
  useEffect(() => {
    if (!open || !applicationId) return;
    supabase
      .from("funding_journey_applications")
      .select("*")
      .eq("id", applicationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setLenderName(data.lender_name);
        setLenderId(data.lender_id);
        setProductCategory((data.product_category as ProductCategoryKey) || "");
        setProductName(data.product_name || "");
        setAmountRequested(data.amount_requested?.toString() || "");
        setApplicationDate(data.application_date);
        setStatus(data.status);
        setNotes(data.notes || "");
        setCreditScore(data.credit_score_at_application?.toString() || "");
      });
  }, [applicationId, open]);

  const reset = () => {
    setLenderName(""); setLenderId(null); setProductCategory(""); setProductName("");
    setAmountRequested(""); setApplicationDate(new Date().toISOString().split("T")[0]);
    setStatus("submitted"); setNotes(""); setCreditScore("");
  };

  const handleSave = async () => {
    if (!lenderName.trim()) {
      toast.error("Lender name is required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = targetUserId || user?.id;
      if (!uid) throw new Error("Not signed in");

      const payload = {
        user_id: uid,
        lender_name: lenderName.trim(),
        lender_id: lenderId,
        product_category: productCategory || null,
        product_name: productName.trim() || null,
        amount_requested: amountRequested ? parseInt(amountRequested, 10) : null,
        application_date: applicationDate,
        status,
        notes: notes.trim() || null,
        credit_score_at_application: creditScore ? parseInt(creditScore, 10) : null,
      };

      if (applicationId) {
        const { error } = await supabase
          .from("funding_journey_applications")
          .update(payload)
          .eq("id", applicationId);
        if (error) throw error;
        toast.success("Application updated");
      } else {
        const { error } = await supabase
          .from("funding_journey_applications")
          .insert(payload);
        if (error) throw error;
        toast.success("Application logged to your Funding Journey");
      }

      qc.invalidateQueries({ queryKey: ["funding-journey"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save application");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{applicationId ? "Edit Application" : "Log New Funding Application"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Lender</Label>
            <Popover open={lenderPickerOpen} onOpenChange={setLenderPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {lenderName || "Select or type lender name..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter>
                  <CommandInput
                    placeholder="Search lenders or type new name..."
                    value={lenderName}
                    onValueChange={(v) => { setLenderName(v); setLenderId(null); }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      <button
                        type="button"
                        className="w-full text-left text-sm p-2 hover:bg-muted rounded"
                        onClick={() => setLenderPickerOpen(false)}
                      >
                        Use "{lenderName}" as a custom lender
                      </button>
                    </CommandEmpty>
                    <CommandGroup>
                      {lenders.slice(0, 100).map((l) => (
                        <CommandItem
                          key={l.id}
                          value={`${l.lender_name} ${l.product_name}`}
                          onSelect={() => {
                            setLenderName(l.lender_name);
                            setLenderId(l.id);
                            setProductName(l.product_name);
                            if (l.product_category) setProductCategory(l.product_category as ProductCategoryKey);
                            setLenderPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              lenderId === l.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="font-medium">{l.lender_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground truncate">{l.product_name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Product Category</Label>
              <Select value={productCategory} onValueChange={(v) => setProductCategory(v as ProductCategoryKey)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((k) => (
                    <SelectItem key={k} value={k}>{CATEGORIES[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Product Name (optional)</Label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="e.g. Spark Cash Plus" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount Requested ($)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={amountRequested}
                onChange={(e) => setAmountRequested(e.target.value)}
                placeholder="50000"
              />
            </div>
            <div className="space-y-2">
              <Label>Credit Score at Application (optional)</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={creditScore}
                onChange={(e) => setCreditScore(e.target.value)}
                placeholder="680"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Application Date</Label>
              <Input
                type="date"
                value={applicationDate}
                onChange={(e) => setApplicationDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as FundingJourneyStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {applicationId ? "Save Changes" : "Log Application"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
