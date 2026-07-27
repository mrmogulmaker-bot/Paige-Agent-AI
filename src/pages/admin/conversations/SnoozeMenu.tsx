import { useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Clock, Archive, ArchiveRestore, MessageCircleReply, CalendarClock } from "lucide-react";
import { type DbThread, snoozePresets, SNOOZE_SENTINEL_UNTIL_REPLY } from "./inbox-shared";

export function SnoozeMenu({
  thread, onSnooze, onArchive, size = "icon",
}: {
  thread: DbThread;
  onSnooze: (id: string, until: Date | string | null) => void;
  onArchive: (id: string, on: boolean) => void;
  size?: "icon" | "sm";
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const presets = snoozePresets();
  const archived = !!thread.archived_at;
  const snoozed = !!thread.snoozed_until && new Date(thread.snoozed_until) > new Date();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size === "icon" ? "icon" : "sm"}
          className="h-7 w-7 text-muted-foreground hover:text-foreground
            focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          aria-label="Thread actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Snooze
        </DropdownMenuLabel>
        {presets.map((p) => (
          <DropdownMenuItem key={p.key} onSelect={() => onSnooze(thread.id, p.until)}>
            <Clock className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <span className="flex-1">{p.label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => onSnooze(thread.id, SNOOZE_SENTINEL_UNTIL_REPLY)}>
          <MessageCircleReply className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          Until they reply
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); setCustomOpen((v) => !v); }}
        >
          <CalendarClock className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
          Custom…
        </DropdownMenuItem>
        {customOpen && (
          <div className="flex items-center gap-1.5 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
            <Input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-8 flex-1 text-xs"
            />
            <Button
              size="sm" variant="outline" className="h-8"
              disabled={!custom}
              onClick={() => { if (custom) { onSnooze(thread.id, new Date(custom)); setCustomOpen(false); } }}
            >
              Set
            </Button>
          </div>
        )}
        {snoozed && (
          <DropdownMenuItem onSelect={() => onSnooze(thread.id, null)}>
            <Clock className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Un-snooze now
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {archived ? (
          <DropdownMenuItem onSelect={() => onArchive(thread.id, false)}>
            <ArchiveRestore className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Move to inbox
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onArchive(thread.id, true)}>
            <Archive className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            Archive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
