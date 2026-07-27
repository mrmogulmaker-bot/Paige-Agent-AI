import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Tag, Check, Pencil, Plus } from "lucide-react";
import {
  type DbThread, type Label, type LabelColor,
  LABEL_DOT, LABEL_COLORS,
} from "./inbox-shared";

function ColorSwatches({
  value, onPick,
}: { value: LabelColor; onPick: (c: LabelColor) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
          className={cn(
            "h-5 w-5 rounded-full border transition-transform",
            LABEL_DOT[c],
            value === c
              ? "ring-2 ring-[hsl(var(--ring))] ring-offset-1 ring-offset-[hsl(var(--card))]"
              : "border-border hover:scale-110",
          )}
        />
      ))}
    </div>
  );
}

export function LabelPopover({
  thread, catalog, onSetThreadLabels, onRenameCatalogLabel,
}: {
  thread: DbThread;
  catalog: Label[];
  onSetThreadLabels: (threadId: string, labels: Label[]) => void;
  onRenameCatalogLabel: (labelId: string, patch: Partial<Label>) => void;
}) {
  const current = thread.labels ?? [];
  const has = (id: string) => current.some((l) => l.id === id);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<LabelColor>("indigo");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<LabelColor>("indigo");

  const toggle = (l: Label) =>
    onSetThreadLabels(thread.id, has(l.id) ? current.filter((x) => x.id !== l.id) : [...current, l]);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const label: Label = { id: crypto.randomUUID(), name, color: newColor };
    onSetThreadLabels(thread.id, [...current, label]);
    setNewName(""); setNewColor("indigo");
  };

  const startEdit = (l: Label) => { setEditing(l.id); setEditName(l.name); setEditColor(l.color); };
  const saveEdit = () => {
    if (editing && editName.trim()) onRenameCatalogLabel(editing, { name: editName.trim(), color: editColor });
    setEditing(null);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground
            focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Labels"
          onClick={(e) => e.stopPropagation()}
        >
          <Tag className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {catalog.length === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              No labels yet — create one below to organize this thread.
            </p>
          )}
          {catalog.map((l) =>
            editing === l.id ? (
              <div key={l.id} className="space-y-2 rounded-md bg-muted/50 p-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-8 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <ColorSwatches value={editColor} onPick={setEditColor} />
                  <Button size="sm" variant="outline" className="h-7" onClick={saveEdit}>Save</Button>
                </div>
              </div>
            ) : (
              <div key={l.id} className="group/lbl flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                <button
                  type="button"
                  onClick={() => toggle(l)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {/* R-S2: selected check fills the primary token with primary-foreground —
                      never text-white on a mid-gray dot (AA both themes, token-only). */}
                  <span className={cn("grid h-4 w-4 place-items-center rounded-sm", has(l.id) ? "bg-[hsl(var(--primary))]" : "border border-border")}>
                    {has(l.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                  <span className={cn("h-2 w-2 rounded-full", LABEL_DOT[l.color])} aria-hidden />
                  <span className="truncate text-sm text-foreground">{l.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(l)}
                  className="opacity-0 transition-opacity group-hover/lbl:opacity-100 text-muted-foreground hover:text-foreground"
                  aria-label={`Edit ${l.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
        <div className="space-y-2 border-t border-border/60 p-2.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New label"
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <div className="flex items-center justify-between">
            <ColorSwatches value={newColor} onPick={setNewColor} />
            <Button size="sm" variant="outline" className="h-7" disabled={!newName.trim()} onClick={create}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
