// MessageComposer — the ONE scope-agnostic composer chrome for every conversation surface
// (§18 one home). The textarea + Send affordance shared by the tenant Client Hub inbox and
// the operator Fleet Communications inbox, so the send experience reads as one continuous
// system (§6) and gold is spent in exactly one place across both surfaces.
//
// It owns only the composer CHROME — the value is controlled by the parent (each container
// keeps its own draft state + send handler via its data-source adapter). ⌘/Ctrl+↵ sends.
//
// The tenant inbox wraps a dense affordance cluster around this same textarea + Send: a
// sending-identity Select, a subject input, attachment chips (ABOVE the textarea), and an
// attach/dictate/Draft-with-Paige/templates/signature/schedule action row (LEFT of Send).
// Those inject through OPTIONAL `header`/`toolbar` slots + optional textarea event handlers,
// WITHOUT this atom knowing anything tenant-specific. The operator call site passes none of
// them and renders identically.
//
// §11: gold ONLY on the Send act (the one earned gold moment); token-only; motion-safe
// (the spinner respects the OS via the Loader2 animate-spin, which CSS-freezes under
// prefers-reduced-motion at the framework level).
import type { ClipboardEvent, DragEvent, ReactNode } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Compliance/help note under the composer (e.g. the A2P "Reply STOP" line). */
  note?: ReactNode;
  /** Send button label; defaults to "Send". */
  sendLabel?: string;
  rows?: number;
  /** Optional slot ABOVE the textarea (tenant: identity Select + subject input + attachment chips). */
  header?: ReactNode;
  /** Optional slot in the action row, LEFT of the gold Send (tenant: attach/dictate/draft/templates/etc.). */
  toolbar?: ReactNode;
  /** Optional drop-zone / paste-to-attach handlers forwarded onto the textarea (tenant: useCommsAttachments). */
  onDrop?: (e: DragEvent<HTMLTextAreaElement>) => void;
  onDragOver?: (e: DragEvent<HTMLTextAreaElement>) => void;
  /** Clears the drag-over ring when the cursor leaves the textarea without dropping. */
  onDragLeave?: (e: DragEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  /** Optional extra classes on the textarea (tenant: drop-zone ring styling). */
  textareaClassName?: string;
}

export function MessageComposer({
  value, onChange, onSend, sending = false, disabled = false,
  placeholder = "Write a message…", note, sendLabel = "Send", rows = 2,
  header, toolbar, onDrop, onDragOver, onDragLeave, onPaste, textareaClassName,
}: MessageComposerProps) {
  return (
    <div className="border-t border-border p-3">
      {header && <div className="mb-2">{header}</div>}
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn("min-h-[2.75rem] resize-none", textareaClassName)}
          disabled={disabled}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (!sending && !disabled) onSend();
            }
          }}
        />
        {/* Send is the ONE earned gold act on this surface (§11). */}
        <Button
          variant="gold"
          onClick={onSend}
          disabled={sending || disabled}
          className="h-11 shrink-0"
        >
          {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
          {sendLabel}
        </Button>
      </div>
      {toolbar && <div className="mt-2 flex flex-wrap items-center gap-2">{toolbar}</div>}
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
