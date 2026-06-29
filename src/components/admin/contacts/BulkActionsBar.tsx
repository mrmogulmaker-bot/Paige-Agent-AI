import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Users, Tag as TagIcon, Trash2, BanIcon, Download,
  ChevronDown, X, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkUpdateContacts, bulkAddTag, bulkRemoveTag, deleteContact,
  LIFECYCLE_STAGES,
} from "@/lib/contacts";

type Coach = { user_id: string; name: string };

type Props = {
  selectedIds: string[];
  coaches: Coach[];
  knownTags: string[];
  onCleared: () => void;
  onChanged: () => void;
  onExport: () => void;
};

export function BulkActionsBar({
  selectedIds, coaches, knownTags, onCleared, onChanged, onExport,
}: Props) {
  const [tagOpen, setTagOpen] = useState<"add" | "remove" | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (selectedIds.length === 0) return null;

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Bulk action failed");
    }
  };

  return (
    <>
      <div className="sticky bottom-4 z-30 mx-auto flex items-center gap-2 rounded-full border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg w-fit">
        <span className="text-sm font-medium flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> {selectedIds.length} selected
        </span>

        {/* Assign coach */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <Users className="h-4 w-4 mr-1" /> Coach <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Assign coach</DropdownMenuLabel>
            <DropdownMenuItem onClick={() =>
              wrap(() => bulkUpdateContacts(selectedIds, { assigned_coach_user_id: null }), "Unassigned")
            }>Unassign</DropdownMenuItem>
            <DropdownMenuSeparator />
            {coaches.map((c) => (
              <DropdownMenuItem key={c.user_id} onClick={() =>
                wrap(() => bulkUpdateContacts(selectedIds, { assigned_coach_user_id: c.user_id }), `Assigned to ${c.name}`)
              }>{c.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Lifecycle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Lifecycle <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {LIFECYCLE_STAGES.map((s) => (
              <DropdownMenuItem key={s.value} onClick={() =>
                wrap(() => bulkUpdateContacts(selectedIds, { lifecycle_stage: s.value }), `Moved to ${s.label}`)
              }>{s.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tag */}
        <Button size="sm" variant="outline" onClick={() => { setTagInput(""); setTagOpen("add"); }}>
          <TagIcon className="h-4 w-4 mr-1" /> Add tag
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setTagInput(""); setTagOpen("remove"); }}>
          <TagIcon className="h-4 w-4 mr-1" /> Remove tag
        </Button>

        {/* DNC */}
        <Button size="sm" variant="outline" onClick={() =>
          wrap(() => bulkUpdateContacts(selectedIds, { do_not_contact: true }), "Marked Do-Not-Contact")
        }>
          <BanIcon className="h-4 w-4 mr-1" /> DNC
        </Button>

        {/* Export */}
        <Button size="sm" variant="outline" onClick={onExport}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>

        {/* Delete */}
        <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> Delete
        </Button>

        <Button size="icon" variant="ghost" onClick={onCleared} aria-label="Clear selection">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tag input dialog */}
      <Dialog open={tagOpen !== null} onOpenChange={(v) => !v && setTagOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tagOpen === "add" ? "Add tag to selected" : "Remove tag from selected"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Tag</Label>
            <Input
              autoFocus
              list="contact-known-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="e.g. Hot Lead"
            />
            <datalist id="contact-known-tags">
              {knownTags.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagOpen(null)}>Cancel</Button>
            <Button onClick={async () => {
              const t = tagInput.trim();
              if (!t) return;
              const mode = tagOpen;
              setTagOpen(null);
              await wrap(
                () => mode === "add" ? bulkAddTag(selectedIds, t) : bulkRemoveTag(selectedIds, t),
                mode === "add" ? `Tag added to ${selectedIds.length}` : `Tag removed`,
              );
            }}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} contact{selectedIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the contact records, their tags, and their
              CRM-only deals. Linked client portal accounts are NOT deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              setDeleteOpen(false);
              const toastId = toast.loading(`Deleting ${selectedIds.length}…`);
              try {
                for (const id of selectedIds) {
                  await deleteContact(id);
                }
                toast.success(`Deleted ${selectedIds.length}`, { id: toastId });
                onChanged();
                onCleared();
              } catch (e: any) {
                toast.error(e.message || "Delete failed", { id: toastId });
              }
            }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
