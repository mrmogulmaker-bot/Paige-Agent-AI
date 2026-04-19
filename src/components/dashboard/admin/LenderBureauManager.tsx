import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Plus, Pencil, Landmark, Trash2, Award, Users, Heart,
  Shield, ShieldOff, Eye, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

// ---------- Constants ----------

const PRODUCT_CATEGORIES = [
  { value: "business_credit_card", label: "Business Credit Cards", color: "bg-amber-500/10 text-amber-600 border-amber-500/30" },
  { value: "business_line_of_credit", label: "Lines of Credit", color: "bg-teal-500/10 text-teal-600 border-teal-500/30" },
  { value: "term_loan", label: "Term Loans", color: "bg-blue-500/10 text-blue-600 border-blue-500/30" },
  { value: "sba_loan", label: "SBA Loans", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  { value: "equipment_financing", label: "Equipment", color: "bg-indigo-500/10 text-indigo-600 border-indigo-500/30" },
  { value: "invoice_factoring", label: "Invoice Factoring", color: "bg-cyan-500/10 text-cyan-600 border-cyan-500/30" },
  { value: "merchant_cash_advance", label: "MCA", color: "bg-orange-500/10 text-orange-600 border-orange-500/30" },
  { value: "revenue_based_financing", label: "Revenue Based", color: "bg-pink-500/10 text-pink-600 border-pink-500/30" },
  { value: "commercial_real_estate", label: "Commercial RE", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  { value: "hard_money_loan", label: "Hard Money", color: "bg-red-500/10 text-red-600 border-red-500/30" },
  { value: "microfinance", label: "Microfinance", color: "bg-lime-500/10 text-lime-600 border-lime-500/30" },
  { value: "cdfi_loan", label: "CDFI", color: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
  { value: "grant", label: "Grants", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  { value: "personal_loan_for_business", label: "Personal Loan for Biz", color: "bg-rose-500/10 text-rose-600 border-rose-500/30" },
];

const INSTITUTION_TYPES = [
  { value: "bank", label: "Bank" },
  { value: "national_bank", label: "National Bank" },
  { value: "regional_bank", label: "Regional Bank" },
  { value: "credit_union", label: "Credit Union" },
  { value: "fintech", label: "Fintech / Online" },
  { value: "online_lender", label: "Online Lender" },
  { value: "cdfi", label: "CDFI" },
  { value: "equipment_finance", label: "Equipment Finance" },
];

const BUREAUS = [
  { value: "Experian", label: "Experian" },
  { value: "TransUnion", label: "TransUnion" },
  { value: "Equifax", label: "Equifax" },
];

const CONFIDENCE_LEVELS = [
  { value: "verified", label: "Verified" },
  { value: "likely", label: "Likely" },
  { value: "reported", label: "Reported by Clients" },
];

const CONFIDENCE_SOURCES = [
  { value: "client_outcome", label: "Client Outcome" },
  { value: "industry_knowledge", label: "Industry Knowledge" },
  { value: "public_disclosure", label: "Public Disclosure" },
];

const CREDIT_IMPACTS = [
  { value: "hard pull", label: "Hard Pull" },
  { value: "soft pull", label: "Soft Pull" },
  { value: "no pull", label: "No Pull" },
];

const FUNDING_SPEEDS = ["same day", "24 hours", "1-3 days", "1-2 weeks", "30-90 days"];

const BUSINESS_BUREAUS = ["DNB", "Experian Business", "Equifax Business", "SBFE", "PayNet", "LexisNexis"];

const confColor: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  likely: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  reported: "bg-blue-500/10 text-blue-500 border-blue-500/30",
};

// ---------- Types ----------

interface LenderPref {
  id: string;
  institution_name: string;
  institution_type: string;
  fdic_cert: string | null;
  ncua_charter: string | null;
  primary_bureau: string;
  secondary_bureau: string | null;
  geographic_scope: string;
  states_applicable: string[] | null;
  confidence_level: string;
  confidence_source: string;
  notes: string | null;
  updated_at: string;
  // New fields
  product_category: string | null;
  product_subcategory: string | null;
  min_credit_score: number | null;
  min_time_in_business_months: number | null;
  min_annual_revenue: number | null;
  max_loan_amount: number | null;
  min_loan_amount: number | null;
  funding_speed: string | null;
  requires_personal_guarantee: boolean | null;
  requires_collateral: boolean | null;
  personal_credit_impact: string | null;
  business_credit_bureaus: string[] | null;
  interest_rate_range: string | null;
  is_sba_approved: boolean | null;
  sba_preferred_lender: boolean | null;
  serves_startups: boolean | null;
  serves_bad_credit: boolean | null;
  serves_minority_owned: boolean | null;
  serves_women_owned: boolean | null;
  serves_veterans: boolean | null;
  application_url: string | null;
  is_active: boolean | null;
}

const emptyForm = {
  institution_name: "",
  institution_type: "bank",
  fdic_cert: "",
  ncua_charter: "",
  primary_bureau: "Experian",
  secondary_bureau: "",
  geographic_scope: "national",
  confidence_level: "likely",
  confidence_source: "industry_knowledge",
  notes: "",
  product_category: "business_line_of_credit",
  product_subcategory: "",
  min_credit_score: "",
  min_time_in_business_months: "",
  min_annual_revenue: "",
  max_loan_amount: "",
  min_loan_amount: "",
  funding_speed: "1-3 days",
  requires_personal_guarantee: true,
  requires_collateral: false,
  personal_credit_impact: "hard pull",
  business_credit_bureaus: [] as string[],
  interest_rate_range: "",
  is_sba_approved: false,
  sba_preferred_lender: false,
  serves_startups: false,
  serves_bad_credit: false,
  serves_minority_owned: false,
  serves_women_owned: false,
  serves_veterans: false,
  application_url: "",
  is_active: true,
};

// ---------- Helpers ----------

function categoryStyle(cat: string | null) {
  return PRODUCT_CATEGORIES.find(c => c.value === cat);
}

function FlagIcon({ icon: Icon, label, color }: { icon: any; label: string; color: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${color}`}>
          <Icon className="w-3 h-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent><p className="text-xs">{label}</p></TooltipContent>
    </Tooltip>
  );
}

// ---------- Component ----------

export function LenderBureauManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [filterBureau, setFilterBureau] = useState<string>("all");
  const [filterMinority, setFilterMinority] = useState<boolean>(false);
  const [filterConfidence, setFilterConfidence] = useState<string>("all");
  const [filterMaxScore, setFilterMaxScore] = useState<string>("");

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["lender-bureau-preferences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lender_bureau_preferences" as any)
        .select("*")
        .order("institution_name", { ascending: true });
      if (error) throw error;
      return (data as any[] as LenderPref[]) || [];
    },
  });

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const list = prefs || [];
    const byCategory: Record<string, number> = {};
    let verified = 0, likely = 0, lastUpdated: string | null = null;
    for (const p of list) {
      const k = p.product_category || "uncategorized";
      byCategory[k] = (byCategory[k] || 0) + 1;
      if (p.confidence_level === "verified") verified++;
      else if (p.confidence_level === "likely") likely++;
      if (!lastUpdated || p.updated_at > lastUpdated) lastUpdated = p.updated_at;
    }
    return { total: list.length, byCategory, verified, likely, lastUpdated };
  }, [prefs]);

  // ---------- Filtering ----------
  const filtered = useMemo(() => {
    let list = prefs || [];
    if (activeCategory !== "all") {
      list = list.filter(p => p.product_category === activeCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.institution_name.toLowerCase().includes(q));
    }
    if (filterBureau !== "all") {
      list = list.filter(p => p.primary_bureau === filterBureau);
    }
    if (filterMinority) {
      list = list.filter(p => p.serves_minority_owned);
    }
    if (filterConfidence !== "all") {
      list = list.filter(p => p.confidence_level === filterConfidence);
    }
    if (filterMaxScore) {
      const max = parseInt(filterMaxScore);
      if (!isNaN(max)) list = list.filter(p => (p.min_credit_score ?? 0) <= max);
    }
    return list;
  }, [prefs, activeCategory, search, filterBureau, filterMinority, filterConfidence, filterMaxScore]);

  // ---------- Form handlers ----------
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: LenderPref) => {
    setEditingId(p.id);
    setForm({
      institution_name: p.institution_name,
      institution_type: p.institution_type,
      fdic_cert: p.fdic_cert || "",
      ncua_charter: p.ncua_charter || "",
      primary_bureau: p.primary_bureau,
      secondary_bureau: p.secondary_bureau || "",
      geographic_scope: p.geographic_scope,
      confidence_level: p.confidence_level,
      confidence_source: p.confidence_source,
      notes: p.notes || "",
      product_category: p.product_category || "business_line_of_credit",
      product_subcategory: p.product_subcategory || "",
      min_credit_score: p.min_credit_score?.toString() ?? "",
      min_time_in_business_months: p.min_time_in_business_months?.toString() ?? "",
      min_annual_revenue: p.min_annual_revenue?.toString() ?? "",
      max_loan_amount: p.max_loan_amount?.toString() ?? "",
      min_loan_amount: p.min_loan_amount?.toString() ?? "",
      funding_speed: p.funding_speed || "1-3 days",
      requires_personal_guarantee: p.requires_personal_guarantee ?? true,
      requires_collateral: p.requires_collateral ?? false,
      personal_credit_impact: p.personal_credit_impact || "hard pull",
      business_credit_bureaus: p.business_credit_bureaus || [],
      interest_rate_range: p.interest_rate_range || "",
      is_sba_approved: p.is_sba_approved ?? false,
      sba_preferred_lender: p.sba_preferred_lender ?? false,
      serves_startups: p.serves_startups ?? false,
      serves_bad_credit: p.serves_bad_credit ?? false,
      serves_minority_owned: p.serves_minority_owned ?? false,
      serves_women_owned: p.serves_women_owned ?? false,
      serves_veterans: p.serves_veterans ?? false,
      application_url: p.application_url || "",
      is_active: p.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.institution_name.trim()) {
      toast.error("Institution name is required");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const num = (s: string) => (s.trim() === "" ? null : parseInt(s));
      const payload: any = {
        institution_name: form.institution_name.trim(),
        institution_type: form.institution_type,
        fdic_cert: form.fdic_cert.trim() || null,
        ncua_charter: form.ncua_charter.trim() || null,
        primary_bureau: form.primary_bureau,
        secondary_bureau: form.secondary_bureau.trim() || null,
        geographic_scope: form.geographic_scope,
        confidence_level: form.confidence_level,
        confidence_source: form.confidence_source,
        notes: form.notes.trim() || null,
        updated_by: user?.id || null,
        product_category: form.product_category || null,
        product_subcategory: form.product_subcategory.trim() || null,
        min_credit_score: num(form.min_credit_score),
        min_time_in_business_months: num(form.min_time_in_business_months),
        min_annual_revenue: num(form.min_annual_revenue),
        max_loan_amount: num(form.max_loan_amount),
        min_loan_amount: num(form.min_loan_amount),
        funding_speed: form.funding_speed || null,
        requires_personal_guarantee: form.requires_personal_guarantee,
        requires_collateral: form.requires_collateral,
        personal_credit_impact: form.personal_credit_impact || null,
        business_credit_bureaus: form.business_credit_bureaus.length ? form.business_credit_bureaus : null,
        interest_rate_range: form.interest_rate_range.trim() || null,
        is_sba_approved: form.is_sba_approved,
        sba_preferred_lender: form.sba_preferred_lender,
        serves_startups: form.serves_startups,
        serves_bad_credit: form.serves_bad_credit,
        serves_minority_owned: form.serves_minority_owned,
        serves_women_owned: form.serves_women_owned,
        serves_veterans: form.serves_veterans,
        application_url: form.application_url.trim() || null,
        is_active: form.is_active,
      };

      if (editingId) {
        const { error } = await supabase
          .from("lender_bureau_preferences" as any)
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Lender updated");
      } else {
        const { error } = await supabase
          .from("lender_bureau_preferences" as any)
          .insert(payload);
        if (error) throw error;
        toast.success("Lender added");
      }
      queryClient.invalidateQueries({ queryKey: ["lender-bureau-preferences"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this lender record?")) return;
    try {
      const { error } = await supabase
        .from("lender_bureau_preferences" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Record deleted");
      queryClient.invalidateQueries({ queryKey: ["lender-bureau-preferences"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from("lender_bureau_preferences" as any)
        .update({ is_active: !current })
        .eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["lender-bureau-preferences"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to toggle");
    }
  };

  const toggleBureau = (b: string) => {
    setForm(f => ({
      ...f,
      business_credit_bureaus: f.business_credit_bureaus.includes(b)
        ? f.business_credit_bureaus.filter(x => x !== b)
        : [...f.business_credit_bureaus, b],
    }));
  };

  // ---------- Render ----------

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="space-y-4 pb-4">
          {/* Title row */}
          <div className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-accent" />
              <CardTitle className="text-lg">Lender Bureau Preferences</CardTitle>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openAdd}>
                  <Plus className="w-4 h-4 mr-1" /> Add Lender
                </Button>
              </DialogTrigger>
              <LenderFormDialog
                editingId={editingId}
                form={form}
                setForm={setForm}
                saving={saving}
                onSave={handleSave}
                toggleBureau={toggleBureau}
              />
            </Dialog>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Lenders" value={stats.total} />
            <StatCard label="Verified" value={stats.verified} accent="text-emerald-500" />
            <StatCard label="Likely" value={stats.likely} accent="text-amber-500" />
            <StatCard
              label="Last Updated"
              value={stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleDateString() : "—"}
              small
            />
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
            <CategoryTab
              label="All"
              count={stats.total}
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            />
            {PRODUCT_CATEGORIES.map(c => {
              const count = stats.byCategory[c.value] || 0;
              if (count === 0) return null;
              return (
                <CategoryTab
                  key={c.value}
                  label={c.label}
                  count={count}
                  active={activeCategory === c.value}
                  onClick={() => setActiveCategory(c.value)}
                />
              );
            })}
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-end gap-2">
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 h-9"
            />
            <Select value={filterBureau} onValueChange={setFilterBureau}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Primary bureau" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bureaus</SelectItem>
                {BUREAUS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterConfidence} onValueChange={setFilterConfidence}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Confidence" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Confidence</SelectItem>
                {CONFIDENCE_LEVELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Max min-score"
              value={filterMaxScore}
              onChange={(e) => setFilterMaxScore(e.target.value)}
              className="w-36 h-9"
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={filterMinority} onCheckedChange={setFilterMinority} />
              Minority-owned focus
            </label>
            {(activeCategory !== "all" || search || filterBureau !== "all" || filterMinority || filterConfidence !== "all" || filterMaxScore) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveCategory("all");
                  setSearch("");
                  setFilterBureau("all");
                  setFilterMinority(false);
                  setFilterConfidence("all");
                  setFilterMaxScore("");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-accent" />
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Institution</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Bureaus</TableHead>
                    <TableHead className="text-right">Min Score</TableHead>
                    <TableHead className="text-right">Min Revenue</TableHead>
                    <TableHead>Funding Speed</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const cat = categoryStyle(p.product_category);
                    return (
                      <TableRow key={p.id} className={!p.is_active ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="font-medium">{p.institution_name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{p.institution_type.replace(/_/g, " ")}</div>
                        </TableCell>
                        <TableCell>
                          {cat ? (
                            <Badge variant="outline" className={`text-xs ${cat.color}`}>{cat.label}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {p.product_subcategory && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 uppercase">{p.product_subcategory.replace(/_/g, " ")}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <Badge variant="outline" className="text-xs w-fit">{p.primary_bureau}</Badge>
                            {p.secondary_bureau && (
                              <span className="text-[10px] text-muted-foreground">+ {p.secondary_bureau}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {p.min_credit_score === 0 ? <span className="text-emerald-500">No min</span> : (p.min_credit_score ?? "—")}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {p.min_annual_revenue ? `$${(p.min_annual_revenue / 1000).toFixed(0)}K` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.funding_speed || "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {p.is_sba_approved && (
                              <FlagIcon icon={Award} label="SBA Approved" color="bg-emerald-500/15 text-emerald-500" />
                            )}
                            {p.serves_minority_owned && (
                              <FlagIcon icon={Users} label="Minority-Owned" color="bg-violet-500/15 text-violet-500" />
                            )}
                            {p.serves_women_owned && (
                              <FlagIcon icon={Heart} label="Women-Owned" color="bg-pink-500/15 text-pink-500" />
                            )}
                            {p.serves_veterans && (
                              <FlagIcon icon={Shield} label="Veteran-Friendly" color="bg-blue-500/15 text-blue-500" />
                            )}
                            {p.requires_personal_guarantee === false && (
                              <FlagIcon icon={ShieldOff} label="No Personal Guarantee" color="bg-teal-500/15 text-teal-500" />
                            )}
                            {p.personal_credit_impact === "soft pull" && (
                              <FlagIcon icon={Eye} label="Soft Pull Only" color="bg-cyan-500/15 text-cyan-500" />
                            )}
                            {p.personal_credit_impact === "no pull" && (
                              <FlagIcon icon={CheckCircle2} label="No Credit Pull" color="bg-emerald-500/15 text-emerald-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${confColor[p.confidence_level] || ""}`}>
                            {p.confidence_level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={p.is_active ?? true}
                            onCheckedChange={() => toggleActive(p.id, p.is_active ?? true)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No lenders match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

// ---------- Subcomponents ----------

function StatCard({ label, value, accent, small }: { label: string; value: number | string; accent?: string; small?: boolean }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 border border-border">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${small ? "text-sm" : "text-2xl"} font-bold mt-0.5 ${accent || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function CategoryTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label} <span className="ml-1 opacity-70">({count})</span>
    </button>
  );
}

function LenderFormDialog({
  editingId, form, setForm, saving, onSave, toggleBureau,
}: {
  editingId: string | null;
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  saving: boolean;
  onSave: () => void;
  toggleBureau: (b: string) => void;
}) {
  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editingId ? "Edit Lender" : "Add Lender"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        {/* Section: Basic Info */}
        <Section title="Basic Info">
          <div className="grid grid-cols-2 gap-3">
            <FieldFull label="Institution Name">
              <Input value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} />
            </FieldFull>
            <Field label="Type">
              <Select value={form.institution_type} onValueChange={(v) => setForm({ ...form, institution_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{INSTITUTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Active">
              <div className="flex items-center h-9">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <span className="ml-2 text-xs text-muted-foreground">{form.is_active ? "Visible to clients" : "Hidden"}</span>
              </div>
            </Field>
            <Field label="FDIC CERT #">
              <Input value={form.fdic_cert} onChange={(e) => setForm({ ...form, fdic_cert: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="NCUA Charter #">
              <Input value={form.ncua_charter} onChange={(e) => setForm({ ...form, ncua_charter: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Application URL">
              <Input value={form.application_url} onChange={(e) => setForm({ ...form, application_url: e.target.value })} placeholder="https://" />
            </Field>
            <Field label="Geographic Scope">
              <Select value={form.geographic_scope} onValueChange={(v) => setForm({ ...form, geographic_scope: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="regional">Regional</SelectItem>
                  <SelectItem value="state">State</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>

        {/* Section: Product Details */}
        <Section title="Product Details">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product Category">
              <Select value={form.product_category} onValueChange={(v) => setForm({ ...form, product_category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategory">
              <Input value={form.product_subcategory} onChange={(e) => setForm({ ...form, product_subcategory: e.target.value })} placeholder="e.g. sba_7a, sba_express, microloan" />
            </Field>
            <Field label="Min Loan Amount ($)">
              <Input type="number" value={form.min_loan_amount} onChange={(e) => setForm({ ...form, min_loan_amount: e.target.value })} />
            </Field>
            <Field label="Max Loan Amount ($)">
              <Input type="number" value={form.max_loan_amount} onChange={(e) => setForm({ ...form, max_loan_amount: e.target.value })} />
            </Field>
            <Field label="Funding Speed">
              <Select value={form.funding_speed} onValueChange={(v) => setForm({ ...form, funding_speed: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUNDING_SPEEDS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Interest Rate Range">
              <Input value={form.interest_rate_range} onChange={(e) => setForm({ ...form, interest_rate_range: e.target.value })} placeholder="e.g. 7-25% APR" />
            </Field>
          </div>
        </Section>

        {/* Section: Credit Requirements */}
        <Section title="Credit Requirements">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min Personal Credit Score">
              <Input type="number" value={form.min_credit_score} onChange={(e) => setForm({ ...form, min_credit_score: e.target.value })} />
            </Field>
            <Field label="Personal Credit Impact">
              <Select value={form.personal_credit_impact} onValueChange={(v) => setForm({ ...form, personal_credit_impact: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREDIT_IMPACTS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Min Time in Business (months)">
              <Input type="number" value={form.min_time_in_business_months} onChange={(e) => setForm({ ...form, min_time_in_business_months: e.target.value })} />
            </Field>
            <Field label="Min Annual Revenue ($)">
              <Input type="number" value={form.min_annual_revenue} onChange={(e) => setForm({ ...form, min_annual_revenue: e.target.value })} />
            </Field>
            <Field label="Personal Guarantee">
              <div className="flex items-center h-9">
                <Switch checked={form.requires_personal_guarantee} onCheckedChange={(v) => setForm({ ...form, requires_personal_guarantee: v })} />
                <span className="ml-2 text-xs text-muted-foreground">{form.requires_personal_guarantee ? "Required" : "Not required"}</span>
              </div>
            </Field>
            <Field label="Collateral">
              <div className="flex items-center h-9">
                <Switch checked={form.requires_collateral} onCheckedChange={(v) => setForm({ ...form, requires_collateral: v })} />
                <span className="ml-2 text-xs text-muted-foreground">{form.requires_collateral ? "Required" : "Not required"}</span>
              </div>
            </Field>
          </div>
        </Section>

        {/* Section: Bureau Preferences */}
        <Section title="Bureau Preferences">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary Bureau (Personal)">
              <Select value={form.primary_bureau} onValueChange={(v) => setForm({ ...form, primary_bureau: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BUREAUS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Secondary Bureau (Personal)">
              <Select value={form.secondary_bureau || "none"} onValueChange={(v) => setForm({ ...form, secondary_bureau: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {BUREAUS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <FieldFull label="Reports To Business Bureaus">
            <div className="flex flex-wrap gap-2 pt-1">
              {BUSINESS_BUREAUS.map(b => {
                const active = form.business_credit_bureaus.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => toggleBureau(b)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-muted/30 text-muted-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </FieldFull>
        </Section>

        {/* Section: Special Programs */}
        <Section title="Special Programs">
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            <ToggleRow label="SBA Approved" value={form.is_sba_approved} onChange={(v) => setForm({ ...form, is_sba_approved: v })} />
            <ToggleRow label="SBA Preferred Lender" value={form.sba_preferred_lender} onChange={(v) => setForm({ ...form, sba_preferred_lender: v })} />
            <ToggleRow label="Serves Startups" value={form.serves_startups} onChange={(v) => setForm({ ...form, serves_startups: v })} />
            <ToggleRow label="Serves Bad Credit" value={form.serves_bad_credit} onChange={(v) => setForm({ ...form, serves_bad_credit: v })} />
            <ToggleRow label="Minority-Owned Focus" value={form.serves_minority_owned} onChange={(v) => setForm({ ...form, serves_minority_owned: v })} />
            <ToggleRow label="Women-Owned Focus" value={form.serves_women_owned} onChange={(v) => setForm({ ...form, serves_women_owned: v })} />
            <ToggleRow label="Veteran-Friendly" value={form.serves_veterans} onChange={(v) => setForm({ ...form, serves_veterans: v })} />
          </div>
        </Section>

        {/* Section: Confidence + Notes */}
        <Section title="Confidence & Notes">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence Level">
              <Select value={form.confidence_level} onValueChange={(v) => setForm({ ...form, confidence_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONFIDENCE_LEVELS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Source">
              <Select value={form.confidence_source} onValueChange={(v) => setForm({ ...form, confidence_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONFIDENCE_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
          <FieldFull label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          </FieldFull>
        </Section>

        <Button onClick={onSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editingId ? "Update" : "Add"} Lender
        </Button>
      </div>
    </DialogContent>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FieldFull({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col-span-2">
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 cursor-pointer">
      <span className="text-xs">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}
