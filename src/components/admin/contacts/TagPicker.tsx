import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { SUGGESTED_TAGS, TAG_COLOR_MAP } from "@/lib/contactTags";

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Pull existing tags already in the system to expand the suggestion list. */
  knownTags?: string[];
  placeholder?: string;
  className?: string;
};

export function TagPicker({
  value, onChange, knownTags = [], placeholder = "Add tag…", className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const palette = useMemo(() => {
    const merged = Array.from(new Set([...SUGGESTED_TAGS, ...knownTags])).sort();
    return merged.filter((t) => !value.includes(t));
  }, [value, knownTags]);

  const filtered = useMemo(() => {
    if (!draft.trim()) return palette;
    const q = draft.toLowerCase();
    return palette.filter((t) => t.toLowerCase().includes(q));
  }, [palette, draft]);

  const add = (t: string) => {
    const tag = t.trim();
    if (!tag || value.includes(tag)) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TagIcon className="h-3 w-3" /> No tags yet
          </span>
        )}
        {value.map((t) => (
          <Badge
            key={t}
            variant="secondary"
            className={`text-xs gap-1 ${TAG_COLOR_MAP[t] || ""}`}
          >
            {t}
            <button onClick={() => remove(t)} aria-label={`Remove ${t}`}>
              <X className="h-3 w-3 opacity-60 hover:opacity-100" />
            </button>
          </Badge>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
            }}
          />
          <div className="mt-2 max-h-56 overflow-auto space-y-1">
            {draft.trim() && !palette.includes(draft.trim()) && (
              <button
                className="w-full text-left text-sm rounded px-2 py-1 hover:bg-muted flex items-center gap-2"
                onClick={() => add(draft)}
              >
                <Plus className="h-3 w-3" /> Create "{draft.trim()}"
              </button>
            )}
            {filtered.map((t) => (
              <button
                key={t}
                className="w-full text-left text-sm rounded px-2 py-1 hover:bg-muted"
                onClick={() => add(t)}
              >
                {t}
              </button>
            ))}
            {filtered.length === 0 && !draft && (
              <div className="text-xs text-muted-foreground p-2">
                Start typing to create a new tag.
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
