// The ONE conversational input.
//
// A creative brief, not a form. It has two modes and ONE textarea: describe the whole page,
// or — when a section is selected on the canvas — say what should change about that section.
// Keeping it a single input is what makes the section edit feel like a continuing
// conversation instead of a second tool bolted on the side.
//
// Gold budget: zero. The submit is indigo (`variant="default"`). Gold is spent only on
// Publish (§11).
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Loader2, RefreshCw, Send, X } from "lucide-react";
import type { GrowthBlock } from "@/lib/growth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip } from "@/components/ui/page";
import { cn } from "@/lib/utils";

export interface IntentChip {
  id: string;
  /** "Webinar registration" */
  label: string;
  /** The FULL example brief dropped into the textarea, fully editable. No hidden template
   *  magic — the operator sees exactly what Paige is about to be asked (§15). */
  seed: string;
}

export interface PromptComposerProps {
  /** "page" = whole-page brief. "section" = conversational edit of one selected block. */
  mode: "page" | "section";
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  /** A run is in flight — the input stays readable, the submit swaps to a busy affordance. */
  busy?: boolean;
  disabled?: boolean;
  /** Section mode only — what is being edited. */
  target?: { index: number; blockType: GrowthBlock["type"]; label: string } | null;
  /** Leave section mode, return to the whole-page brief. */
  onClearTarget?: () => void;
  /** Page mode only. Clicking a chip REPLACES the textarea value (never appends silently). */
  chips?: IntentChip[];
  /** Re-run the whole page from the current brief. Only offered once blocks exist. */
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  className?: string;
}

const PAGE_PLACEHOLDER =
  "Tell me what this page is for — the offer, who it's for, and the one action you want them to take.";
const SECTION_PLACEHOLDER =
  "What should change? e.g. 'punchier headline', 'add a third card', 'make the CTA about booking a call'.";

const MIN_ROWS = 5;
const MAX_ROWS = 12;

export function PromptComposer({
  mode,
  value,
  onChange,
  onSubmit,
  busy = false,
  disabled = false,
  target = null,
  onClearTarget,
  chips,
  onRegenerate,
  canRegenerate = false,
  className,
}: PromptComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const sectionMode = mode === "section" && !!target;

  // Grow with the writing, up to ~12 rows, then scroll. No jumpy fixed box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight || "20") || 20;
    const pad = 20;
    el.style.height = "auto";
    const min = line * MIN_ROWS + pad;
    const max = line * MAX_ROWS + pad;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, sectionMode]);

  // Retargeting moves the cursor into the composer — the conversation follows the click.
  useEffect(() => {
    if (sectionMode) ref.current?.focus();
  }, [sectionMode, target?.index]);

  const canSubmit = !busy && !disabled && value.trim().length >= (sectionMode ? 2 : 5);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit(value.trim());
  }, [canSubmit, onSubmit, value]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* The composer visibly retargets. The whole-page brief is held in the shell and
          restored on dismiss — retargeting never eats the operator's words. */}
      <div aria-live="polite">
        {sectionMode && target && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--ring)/0.4)] bg-[hsl(var(--ring)/0.06)] px-3 py-2">
            <span className="min-w-0 truncate text-xs font-medium text-foreground">
              Editing section {target.index + 1} · {target.label}
            </span>
            {onClearTarget && (
              <button
                type="button"
                onClick={onClearTarget}
                aria-label="Stop editing this section"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="studio-composer" className="block text-sm font-medium text-foreground">
          {sectionMode ? "What should this section say?" : "What's this page for?"}
        </label>
        <Textarea
          id="studio-composer"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={MIN_ROWS}
          placeholder={sectionMode ? SECTION_PLACEHOLDER : PAGE_PLACEHOLDER}
          className="resize-none text-sm leading-relaxed"
        />
        <p className="text-xs text-muted-foreground">
          {sectionMode
            ? "Paige rewrites this one section and leaves the rest of the page alone."
            : "The more real detail you give — the offer, the audience, the ask — the closer the first draft lands."}
        </p>
      </div>

      {!sectionMode && chips && chips.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Start from a brief
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <FilterChip
                key={chip.id}
                active={value.trim() === chip.seed.trim()}
                onClick={() => onChange(chip.seed)}
              >
                {chip.label}
              </FilterChip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Each one drops a full brief in the box. Edit it until it's yours.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Indigo, deliberately. The act moment is Publish — not this. */}
        <Button type="button" variant="default" onClick={submit} disabled={!canSubmit}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              Working…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              {sectionMode ? "Apply the change" : "Build the page"}
            </>
          )}
        </Button>

        {!sectionMode && onRegenerate && canRegenerate && (
          <Button type="button" variant="outline" onClick={onRegenerate} disabled={busy || disabled}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Rebuild it
          </Button>
        )}

        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">⌘/Ctrl + Enter</span>
      </div>
    </div>
  );
}

export default PromptComposer;
