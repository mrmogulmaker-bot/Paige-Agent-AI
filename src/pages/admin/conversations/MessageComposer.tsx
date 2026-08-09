// MessageComposer — the ONE scope-agnostic composer chrome for every conversation surface
// (§18 one home). The textarea + Send affordance shared by the tenant Client Hub inbox and
// the operator Fleet Communications inbox, so the send experience reads as one continuous
// system (§6) and gold is spent in exactly one place across both surfaces.
//
// It owns only the composer CHROME — the value is controlled by the parent (each container
// keeps its own draft state + send handler via its data-source adapter). ⌘/Ctrl+↵ sends.
//
// §11: gold ONLY on the Send act (the one earned gold moment); token-only; motion-safe
// (the spinner respects the OS via the Loader2 animate-spin, which CSS-freezes under
// prefers-reduced-motion at the framework level).
import type { ReactNode } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
}

export function MessageComposer({
  value, onChange, onSend, sending = false, disabled = false,
  placeholder = "Write a message…", note, sendLabel = "Send", rows = 2,
}: MessageComposerProps) {
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="min-h-[2.75rem] resize-none"
          disabled={disabled}
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
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
