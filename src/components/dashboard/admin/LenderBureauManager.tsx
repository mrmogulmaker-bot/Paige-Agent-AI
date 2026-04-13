import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Landmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const INSTITUTION_TYPES = [
  { value: "national_bank", label: "National Bank" },
  { value: "regional_bank", label: "Regional Bank" },
  { value: "credit_union", label: "Credit Union" },
  { value: "online_lender", label: "Online Lender" },
  { value: "cdfi", label: "CDFI" },
  { value: "equipment_finance", label: "Equipment Finance" },
];

const BUREAUS = [
  { value: "experian", label: "Experian" },
  { value: "transunion", label: "TransUnion" },
  { value: "equifax", label: "Equifax" },
  { value: "all_three", label: "All Three" },
  { value: "flexible", label: "Flexible / Varies" },
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
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  institution_name: "",
  institution_type: "national_bank",
  fdic_cert: "",
  ncua_charter: "",
  primary_bureau: "experian",
  secondary_bureau: "",
  geographic_scope: "national",
  confidence_level: "likely",
  confidence_source: "industry_knowledge",
  notes: "",
};

export function LenderBureauManager() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

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

  const filtered = (prefs || []).filter(
    (p) =>
      p.institution_name.toLowerCase().includes(search.toLowerCase()) ||
      p.primary_bureau.toLowerCase().includes(search.toLowerCase())
  );

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
      };

      if (editingId) {
        const { error } = await supabase
          .from("lender_bureau_preferences" as any)
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Bureau preference updated");
      } else {
        const { error } = await supabase
          .from("lender_bureau_preferences" as any)
          .insert(payload);
        if (error) throw error;
        toast.success("Bureau preference added");
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
    if (!confirm("Delete this bureau preference record?")) return;
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

  const bureauLabel = (b: string) => BUREAUS.find((x) => x.value === b)?.label || b;
  const confLabel = (c: string) => CONFIDENCE_LEVELS.find((x) => x.value === c)?.label || c;
  const typeLabel = (t: string) => INSTITUTION_TYPES.find((x) => x.value === t)?.label || t;

  const confColor: Record<string, string> = {
    verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    likely: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    reported: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-accent" />
          <CardTitle className="text-lg">Lender Bureau Preferences</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 h-9"
          />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-1" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit" : "Add"} Bureau Preference</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <Label>Institution Name</Label>
                  <Input value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.institution_type} onValueChange={(v) => setForm({ ...form, institution_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{INSTITUTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Geographic Scope</Label>
                    <Select value={form.geographic_scope} onValueChange={(v) => setForm({ ...form, geographic_scope: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="national">National</SelectItem>
                        <SelectItem value="regional">Regional</SelectItem>
                        <SelectItem value="state">State</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>FDIC CERT #</Label>
                    <Input value={form.fdic_cert} onChange={(e) => setForm({ ...form, fdic_cert: e.target.value })} placeholder="Optional" />
                  </div>
                  <div>
                    <Label>NCUA Charter #</Label>
                    <Input value={form.ncua_charter} onChange={(e) => setForm({ ...form, ncua_charter: e.target.value })} placeholder="Optional" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Primary Bureau</Label>
                    <Select value={form.primary_bureau} onValueChange={(v) => setForm({ ...form, primary_bureau: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BUREAUS.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Secondary Bureau</Label>
                    <Select value={form.secondary_bureau || "none"} onValueChange={(v) => setForm({ ...form, secondary_bureau: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {BUREAUS.filter((b) => b.value !== "all_three" && b.value !== "flexible").map((b) => (
                          <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Confidence</Label>
                    <Select value={form.confidence_level} onValueChange={(v) => setForm({ ...form, confidence_level: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONFIDENCE_LEVELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Source</Label>
                    <Select value={form.confidence_source} onValueChange={(v) => setForm({ ...form, confidence_source: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONFIDENCE_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingId ? "Update" : "Add"} Preference
                </Button>
              </div>
            </DialogContent>
          </Dialog>
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
                  <TableHead>Type</TableHead>
                  <TableHead>Primary Bureau</TableHead>
                  <TableHead>Secondary</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.institution_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{typeLabel(p.institution_type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{bureauLabel(p.primary_bureau)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.secondary_bureau ? bureauLabel(p.secondary_bureau) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${confColor[p.confidence_level] || ""}`}>
                        {confLabel(p.confidence_level)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(p.updated_at), "MMM d, yyyy")}</TableCell>
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
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {search ? "No matching records" : "No bureau preferences recorded yet"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
