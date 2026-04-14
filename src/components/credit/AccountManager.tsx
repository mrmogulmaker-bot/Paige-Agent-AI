import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Check,
  Copy,
  Edit2,
  Flag,
  Loader2,
  Merge,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AccountRecord {
  id: string;
  creditor: string;
  type: string;
  bureau?: string;
  amount?: number | null;
  balance?: number | null;
  credit_limit?: number | null;
  status?: string | null;
  is_open?: boolean | null;
  is_authorized_user?: boolean | null;
  duplicate_of_id?: string | null;
  is_disputed_ownership?: boolean | null;
  table_source: "credit_accounts" | "credit_negative_items";
  // negative-specific
  item_type?: string;
  bureau_source?: string;
  account_number_masked?: string | null;
}

interface MergeSuggestion {
  primary: AccountRecord;
  duplicate: AccountRecord;
  reason: string;
  similarity: number;
}

interface AccountManagerProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: "client" | "coach" | "admin";
  targetUserId?: string; // for coach/admin viewing a client
}

const ACCOUNT_TYPES = [
  "credit_card", "auto_loan", "personal_loan", "mortgage",
  "student_loan", "collections", "other",
];

const BUREAUS = ["Experian", "TransUnion", "Equifax"];

function fuzzyMatch(a: string, b: string): number {
  const la = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const lb = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.9;
  // Simple bigram similarity
  const bigramsA = new Set<string>();
  for (let i = 0; i < la.length - 1; i++) bigramsA.add(la.slice(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < lb.length - 1; i++) bigramsB.add(lb.slice(i, i + 2));
  let shared = 0;
  bigramsA.forEach(bg => { if (bigramsB.has(bg)) shared++; });
  return bigramsA.size + bigramsB.size === 0 ? 0 : (2 * shared) / (bigramsA.size + bigramsB.size);
}

export function AccountManager({ isOpen, onClose, userRole = "client", targetUserId }: AccountManagerProps) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<AccountRecord>>({});
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [notMineDialogId, setNotMineDialogId] = useState<string | null>(null);
  const [markDupDialogId, setMarkDupDialogId] = useState<string | null>(null);
  const [selectedDupTarget, setSelectedDupTarget] = useState<string>("");

  // Fetch all accounts
  const { data: allAccounts, isLoading } = useQuery({
    queryKey: ["account-manager", targetUserId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = targetUserId || session?.user?.id;
      if (!uid) return [];

      const [{ data: creditAccounts }, { data: negItems }] = await Promise.all([
        supabase.from("credit_accounts").select("*").eq("user_id", uid).is("duplicate_of_id", null).order("creditor"),
        supabase.from("credit_negative_items").select("*").eq("user_id", uid).is("duplicate_of_id", null).neq("status", "removed").order("creditor_name"),
      ]);

      const records: AccountRecord[] = [];

      (creditAccounts || []).forEach((a: any) => {
        records.push({
          id: a.id,
          creditor: a.creditor,
          type: a.type,
          amount: a.balance ?? a.current_balance,
          balance: a.balance,
          credit_limit: a.credit_limit ?? a.limit_amount,
          status: a.status,
          is_open: a.is_open,
          is_authorized_user: a.is_authorized_user,
          duplicate_of_id: a.duplicate_of_id,
          is_disputed_ownership: a.is_disputed_ownership,
          table_source: "credit_accounts",
          account_number_masked: a.account_number_masked,
        });
      });

      (negItems || []).forEach((n: any) => {
        records.push({
          id: n.id,
          creditor: n.creditor_name || "Unknown",
          type: n.item_type,
          bureau: n.bureau,
          amount: n.amount,
          status: n.status,
          duplicate_of_id: n.duplicate_of_id,
          is_disputed_ownership: n.is_disputed_ownership,
          table_source: "credit_negative_items",
          item_type: n.item_type,
          account_number_masked: n.account_number_masked,
        });
      });

      return records;
    },
    enabled: isOpen,
  });

  const filteredAccounts = useMemo(() => {
    if (!allAccounts) return [];
    const term = searchTerm.toLowerCase();
    return allAccounts.filter(a =>
      !a.is_disputed_ownership &&
      (a.creditor.toLowerCase().includes(term) || (a.type || "").toLowerCase().includes(term))
    );
  }, [allAccounts, searchTerm]);

  const disputedAccounts = useMemo(() => {
    return (allAccounts || []).filter(a => a.is_disputed_ownership);
  }, [allAccounts]);

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async ({ record, updates }: { record: AccountRecord; updates: Partial<AccountRecord> }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const table = record.table_source;
      const prevValues: Record<string, any> = {};
      const newValues: Record<string, any> = {};

      if (table === "credit_accounts") {
        const updatePayload: Record<string, any> = {};
        if (updates.creditor !== undefined) { prevValues.creditor = record.creditor; newValues.creditor = updates.creditor; updatePayload.creditor = updates.creditor; }
        if (updates.type !== undefined) { prevValues.type = record.type; newValues.type = updates.type; updatePayload.type = updates.type; }
        if (updates.status !== undefined) { prevValues.status = record.status; newValues.status = updates.status; updatePayload.status = updates.status; }
        if (updates.credit_limit !== undefined) { prevValues.credit_limit = record.credit_limit; newValues.credit_limit = updates.credit_limit; updatePayload.credit_limit = updates.credit_limit; }
        updatePayload.updated_at = new Date().toISOString();
        await supabase.from("credit_accounts").update(updatePayload).eq("id", record.id);
      } else {
        const updatePayload: Record<string, any> = {};
        if (updates.creditor !== undefined) { prevValues.creditor_name = record.creditor; newValues.creditor_name = updates.creditor; updatePayload.creditor_name = updates.creditor; }
        if (updates.type !== undefined) { prevValues.item_type = record.type; newValues.item_type = updates.type; updatePayload.item_type = updates.type; }
        if (updates.bureau !== undefined) { prevValues.bureau = record.bureau; newValues.bureau = updates.bureau; updatePayload.bureau = updates.bureau; }
        if (updates.amount !== undefined) { prevValues.amount = record.amount; newValues.amount = updates.amount; updatePayload.amount = updates.amount; }
        if (updates.status !== undefined) { prevValues.status = record.status; newValues.status = updates.status; updatePayload.status = updates.status; }
        updatePayload.updated_at = new Date().toISOString();
        await supabase.from("credit_negative_items").update(updatePayload).eq("id", record.id);
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        user_id: session.user.id,
        entity: "account_modification",
        action: "edit",
        entity_id: record.id,
        data: { previous_value: prevValues, new_value: newValues, table: table, source: userRole === "admin" ? "admin_ui" : userRole === "coach" ? "coach_ui" : "client_ui" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-manager"] });
      queryClient.invalidateQueries({ queryKey: ["credit-accounts-health"] });
      queryClient.invalidateQueries({ queryKey: ["credit-negatives-health"] });
      setEditingId(null);
      setEditValues({});
      toast({ title: "Account updated", description: "Changes saved and audit logged." });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  // Mark not mine
  const markNotMineMutation = useMutation({
    mutationFn: async (record: AccountRecord) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const table = record.table_source;
      if (table === "credit_negative_items") {
        await supabase.from("credit_negative_items").update({ is_disputed_ownership: true, status: "disputed" }).eq("id", record.id);
      } else {
        await supabase.from("credit_accounts").update({ is_disputed_ownership: true, status: "disputed_ownership" }).eq("id", record.id);
      }

      await supabase.from("audit_logs").insert({
        user_id: session.user.id,
        entity: "account_modification",
        action: "mark_not_mine",
        entity_id: record.id,
        data: { creditor: record.creditor, table, source: userRole === "admin" ? "admin_ui" : userRole === "coach" ? "coach_ui" : "client_ui" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-manager"] });
      queryClient.invalidateQueries({ queryKey: ["credit-accounts-health"] });
      queryClient.invalidateQueries({ queryKey: ["credit-negatives-health"] });
      setNotMineDialogId(null);
      toast({ title: "Flagged as Not Mine", description: "Account excluded from scoring and assessments." });
    },
  });

  // Mark as duplicate
  const markDuplicateMutation = useMutation({
    mutationFn: async ({ duplicateId, primaryId }: { duplicateId: string; primaryId: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const record = allAccounts?.find(a => a.id === duplicateId);
      if (!record) throw new Error("Account not found");

      const table = record.table_source;
      if (table === "credit_negative_items") {
        await supabase.from("credit_negative_items").update({ duplicate_of_id: primaryId, status: "removed" }).eq("id", duplicateId);
      } else {
        await supabase.from("credit_accounts").update({ duplicate_of_id: primaryId }).eq("id", duplicateId);
      }

      await supabase.from("audit_logs").insert({
        user_id: session.user.id,
        entity: "account_modification",
        action: "mark_duplicate",
        entity_id: duplicateId,
        data: { merged_into: primaryId, creditor: record.creditor, table, source: userRole === "admin" ? "admin_ui" : userRole === "coach" ? "coach_ui" : "client_ui" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-manager"] });
      queryClient.invalidateQueries({ queryKey: ["credit-accounts-health"] });
      queryClient.invalidateQueries({ queryKey: ["credit-negatives-health"] });
      setMarkDupDialogId(null);
      setSelectedDupTarget("");
      toast({ title: "Duplicate merged", description: "Account marked as duplicate and removed from active assessments." });
    },
  });

  // Delete (admin/coach only)
  const deleteMutation = useMutation({
    mutationFn: async (record: AccountRecord) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      if (record.table_source === "credit_negative_items") {
        await supabase.from("credit_negative_items").update({ status: "removed" }).eq("id", record.id);
      } else {
        await supabase.from("credit_accounts").delete().eq("id", record.id);
      }

      await supabase.from("audit_logs").insert({
        user_id: session.user.id,
        entity: "account_modification",
        action: "delete",
        entity_id: record.id,
        data: { creditor: record.creditor, type: record.type, table: record.table_source, source: userRole === "admin" ? "admin_ui" : "coach_ui" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account-manager"] });
      queryClient.invalidateQueries({ queryKey: ["credit-accounts-health"] });
      queryClient.invalidateQueries({ queryKey: ["credit-negatives-health"] });
      toast({ title: "Account deleted", description: "Record removed and audit logged." });
    },
  });

  // Auto-detect duplicates
  const detectDuplicates = () => {
    if (!allAccounts) return;
    const suggestions: MergeSuggestion[] = [];

    for (let i = 0; i < allAccounts.length; i++) {
      for (let j = i + 1; j < allAccounts.length; j++) {
        const a = allAccounts[i];
        const b = allAccounts[j];
        if (a.is_disputed_ownership || b.is_disputed_ownership) continue;

        const nameSim = fuzzyMatch(a.creditor, b.creditor);
        if (nameSim < 0.8) continue;

        const sameType = a.type === b.type || (a.table_source !== b.table_source);
        if (!sameType) continue;

        const amtA = a.amount ?? a.balance ?? 0;
        const amtB = b.amount ?? b.balance ?? 0;
        const maxAmt = Math.max(amtA, amtB);
        const amtClose = maxAmt === 0 || Math.abs(amtA - amtB) / maxAmt <= 0.1;

        if (nameSim >= 0.8 && (sameType || amtClose)) {
          const reasons: string[] = [];
          if (nameSim >= 0.95) reasons.push("Exact creditor name match");
          else reasons.push(`${Math.round(nameSim * 100)}% name similarity`);
          if (amtClose && maxAmt > 0) reasons.push("Amounts within 10%");
          if (a.type === b.type) reasons.push("Same account type");

          suggestions.push({
            primary: a,
            duplicate: b,
            reason: reasons.join(", "),
            similarity: nameSim,
          });
        }
      }
    }

    setMergeSuggestions(suggestions.sort((a, b) => b.similarity - a.similarity));
    setMergeDialogOpen(true);
  };

  const startEdit = (record: AccountRecord) => {
    setEditingId(record.id);
    setEditValues({
      creditor: record.creditor,
      type: record.type,
      bureau: record.bureau,
      amount: record.amount,
      status: record.status,
      credit_limit: record.credit_limit,
    });
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Account Manager</DialogTitle>
          <DialogDescription>View, edit, merge, and flag account records extracted from credit reports.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={detectDuplicates} className="gap-1.5">
            <Merge className="w-4 h-4" /> Merge Duplicates
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Creditor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bureau</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map(record => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {editingId === record.id ? (
                          <Input value={editValues.creditor || ""} onChange={e => setEditValues(v => ({ ...v, creditor: e.target.value }))} className="h-8 text-sm" />
                        ) : (
                          <div>
                            <span className="font-medium text-sm">{record.creditor}</span>
                            {record.account_number_masked && <span className="text-xs text-muted-foreground ml-1">({record.account_number_masked})</span>}
                            <div className="flex gap-1 mt-0.5">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {record.table_source === "credit_accounts" ? "Account" : "Negative"}
                              </Badge>
                              {record.is_authorized_user && <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400">AU</Badge>}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === record.id ? (
                          <Select value={editValues.type || ""} onValueChange={v => setEditValues(vals => ({ ...vals, type: v }))}>
                            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>{ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs">{(record.type || "").replace(/_/g, " ")}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === record.id && record.table_source === "credit_negative_items" ? (
                          <Select value={editValues.bureau || ""} onValueChange={v => setEditValues(vals => ({ ...vals, bureau: v }))}>
                            <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>{BUREAUS.map(b => <SelectItem key={b} value={b.toLowerCase()}>{b}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs capitalize">{record.bureau || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === record.id ? (
                          <Input type="number" value={editValues.amount ?? ""} onChange={e => setEditValues(v => ({ ...v, amount: e.target.value ? Number(e.target.value) : null }))} className="h-8 text-sm w-24" />
                        ) : (
                          <span className="text-sm">{record.amount != null || record.credit_limit != null ? `$${(record.amount ?? record.credit_limit ?? 0).toLocaleString()}` : "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === record.id ? (
                          <Input value={editValues.status || ""} onChange={e => setEditValues(v => ({ ...v, status: e.target.value }))} className="h-8 text-xs w-24" />
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{record.status || "active"}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === record.id ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => editMutation.mutate({ record, updates: editValues })}>
                              <Check className="w-3.5 h-3.5 text-fundability-excellent" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingId(null); setEditValues({}); }}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => startEdit(record)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Mark as Duplicate" onClick={() => { setMarkDupDialogId(record.id); setSelectedDupTarget(""); }}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Not My Account" onClick={() => setNotMineDialogId(record.id)}>
                              <Flag className="w-3.5 h-3.5" />
                            </Button>
                            {(userRole === "admin" || userRole === "coach") && (
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Delete" onClick={() => deleteMutation.mutate(record)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredAccounts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No accounts found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Disputed Ownership Section */}
            {disputedAccounts.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-amber-500" /> Not My Accounts ({disputedAccounts.length})
                </h3>
                <div className="space-y-2">
                  {disputedAccounts.map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2">
                      <div>
                        <span className="text-sm font-medium">{a.creditor}</span>
                        <span className="text-xs text-muted-foreground ml-2">({a.type?.replace(/_/g, " ")})</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30">Disputed Ownership</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Not Mine Confirmation Dialog */}
        <Dialog open={!!notMineDialogId} onOpenChange={() => setNotMineDialogId(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Flag as Not My Account</DialogTitle>
              <DialogDescription>
                This will exclude the account from all scoring, comparable credit calculations, and file health assessments. Are you sure this account does not belong to you?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotMineDialogId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const record = allAccounts?.find(a => a.id === notMineDialogId);
                  if (record) markNotMineMutation.mutate(record);
                }}
                disabled={markNotMineMutation.isPending}
              >
                {markNotMineMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Confirm — Not My Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Duplicate Dialog */}
        <Dialog open={!!markDupDialogId} onOpenChange={() => setMarkDupDialogId(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark as Duplicate</DialogTitle>
              <DialogDescription>Select the primary account this is a duplicate of. The duplicate will be merged into the primary record.</DialogDescription>
            </DialogHeader>
            <Select value={selectedDupTarget} onValueChange={setSelectedDupTarget}>
              <SelectTrigger><SelectValue placeholder="Select primary account..." /></SelectTrigger>
              <SelectContent>
                {(allAccounts || [])
                  .filter(a => a.id !== markDupDialogId && !a.is_disputed_ownership)
                  .map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.creditor} ({a.type?.replace(/_/g, " ")})</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMarkDupDialogId(null)}>Cancel</Button>
              <Button
                disabled={!selectedDupTarget || markDuplicateMutation.isPending}
                onClick={() => { if (markDupDialogId && selectedDupTarget) markDuplicateMutation.mutate({ duplicateId: markDupDialogId, primaryId: selectedDupTarget }); }}
              >
                {markDuplicateMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                Merge Duplicate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Auto-Merge Suggestions Dialog */}
        <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
          <DialogContent className="sm:max-w-lg max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Duplicate Detection Results</DialogTitle>
              <DialogDescription>{mergeSuggestions.length > 0 ? `Found ${mergeSuggestions.length} potential duplicate(s).` : "No duplicates detected."}</DialogDescription>
            </DialogHeader>
            {mergeSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Your account list looks clean — no duplicates found.</p>
            ) : (
              <div className="space-y-4">
                {mergeSuggestions.map((s, i) => (
                  <Card key={i} className="p-4 border-amber-500/30 bg-amber-500/5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span className="text-sm font-medium">Possible Duplicate</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{s.reason}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded bg-muted/30 p-2">
                            <p className="text-[10px] text-muted-foreground mb-1">Primary</p>
                            <p className="text-xs font-medium">{s.primary.creditor}</p>
                            <p className="text-[10px] text-muted-foreground">{s.primary.type?.replace(/_/g, " ")} · ${(s.primary.amount ?? 0).toLocaleString()}</p>
                          </div>
                          <div className="rounded bg-muted/30 p-2">
                            <p className="text-[10px] text-muted-foreground mb-1">Duplicate</p>
                            <p className="text-xs font-medium">{s.duplicate.creditor}</p>
                            <p className="text-[10px] text-muted-foreground">{s.duplicate.type?.replace(/_/g, " ")} · ${(s.duplicate.amount ?? 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1"
                        onClick={() => markDuplicateMutation.mutate({ duplicateId: s.duplicate.id, primaryId: s.primary.id })}
                        disabled={markDuplicateMutation.isPending}
                      >
                        <Merge className="w-3 h-3" /> Merge
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
