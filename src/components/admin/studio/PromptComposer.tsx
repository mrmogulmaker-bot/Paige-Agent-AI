// The ONE conversational input — a docked chat composer (the Lovable/v0/Bolt pattern).
//
// A creative brief, not a form. It has two modes and ONE textarea: describe the whole page,
// or — when a section is selected on the canvas — say what should change about that section.
// Keeping it a single input is what makes the section edit feel like a continuing
// conversation instead of a second tool bolted on the side.
//
// LAYOUT (owner ask, 2026-07-17 — "get ours to that level"): the input is ONE rounded box.
// The textarea and its controls (attach · rebuild · the send act) live INSIDE the same
// container; the textarea grows then scrolls WITHIN itself so the send button never scrolls
// out of reach — the whole dock never scrolls as a unit the way a plain stacked panel did.
// Suggestions ("start from a brief") sit ABOVE the box and clear out the moment you type, so
// the dock stays clean. The caller pins this at the bottom of the rail; the conversation/canvas
// scrolls above it.
//
// Gold budget: the submit is indigo by default (`variant="default"`) — in the builder the act
// moment is Publish (§11). The Studio HOME passes `submitVariant="gold"` so its "Start building"
// is the single gold ACT on that surface.
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { FileText, Image as ImageIcon, Loader2, Paperclip, RefreshCw, Send, X } from "lucide-react";
import type { GrowthAsset, GrowthBlock } from "@/lib/growth";
import { GROWTH_ASSET_ACCEPT, GROWTH_ASSET_MAX_COUNT } from "@/lib/growth";
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
  /** Page mode only. Reference/deliverable files already uploaded (§10/§13 — real Storage
   *  URLs). Controlled by the shell, same pattern as `value`/`onChange`: this component never
   *  touches Supabase itself, it only renders what it's given and asks for a change. */
  attachments?: GrowthAsset[];
  /** The operator picked file(s) from the hidden input — the shell does the actual upload. */
  onFilesSelected?: (files: File[]) => void;
  onRemoveAttachment?: (index: number) => void;
  /** An upload is in flight — disables the attach button and shows a spinner on the chip row. */
  attachmentsBusy?: boolean;
  /** A short label shown ABOVE the dock ("What's this page for?" in page mode). Additive —
   *  omit to keep the page/section defaults. Lets Copy/Image reuse this ONE composer (§18). */
  heading?: string;
  /** Overrides the placeholder text (page mode only — section mode keeps its own). */
  placeholder?: string;
  /** Overrides the helper caption under the dock (page mode only). */
  helperText?: string;
  /** Overrides the submit button's resting label ("Build the page" in page mode). */
  submitLabel?: string;
  /** Overrides the submit button's busy label ("Working…" by default). */
  busyLabel?: string;
  /** Starting height of the textarea in rows before it grows with the writing. Defaults to 4. */
  minRows?: number;
  /** Variant for the submit button. Defaults to "default" (indigo). The Studio HOME passes
   *  "gold" so its "Start building" is the ONE gold ACT on that surface (§11 gold discipline). */
  submitVariant?: "default" | "gold";
  className?: string;
}

const PAGE_PLACEHOLDER =
  "Describe your page — the offer, who it's for, and the one action you want them to take…";
const SECTION_PLACEHOLDER =
  "What should change? e.g. 'punchier headline', 'add a third card', 'make the CTA about booking a call'…";

const MIN_ROWS = 4;
const MAX_ROWS = 10;

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
  attachments = [],
  onFilesSelected,
  onRemoveAttachment,
  attachmentsBusy = false,
  heading,
  placeholder,
  helperText,
  submitLabel,
  busyLabel,
  minRows,
  submitVariant = "default",
  className,
}: PromptComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sectionMode = mode === "section" && !!target;
  const attachSlotsLeft = GROWTH_ASSET_MAX_COUNT - attachments.length;
  const showChips = !sectionMode && !!chips && chips.length > 0 && value.trim().length === 0;

  // Grow with the writing, up to MAX_ROWS, then scroll INSIDE the textarea — the dock's height
  // is bounded so the send button below it never scrolls out of reach. No jumpy fixed box.
  const minRowsResolved = Math.max(1, minRows ?? MIN_ROWS);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight || "20") || 20;
    const pad = 20;
    el.style.height = "auto";
    const min = line * minRowsResolved + pad;
    const max = line * MAX_ROWS + pad;
    el.style.height = `${Math.min(Math.max(el.scrollHeight, min), max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value, sectionMode, minRowsResolved]);

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

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).slice(0, Math.max(attachSlotsLeft, 0));
      if (files.length > 0) onFilesSelected?.(files);
      if (e.target) e.target.value = "";
    },
    [attachSlotsLeft, onFilesSelected],
  );

  const label = sectionMode ? "What should this section say?" : heading;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Section retarget banner — the composer visibly retargets; the whole-page brief is
          held in the shell and restored on dismiss (never eats the operator's words). */}
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

      {/* Optional short label above the dock. */}
      {label && (
        <label htmlFor="studio-composer" className="block px-0.5 text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      {/* Suggestion chips — sit ABOVE the dock and clear out once the operator types (§15). */}
      {showChips && (
        <div className="flex flex-wrap gap-1.5">
          {chips!.map((chip) => (
            <FilterChip key={chip.id} active={false} onClick={() => onChange(chip.seed)}>
              {chip.label}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Uploaded reference/deliverable files — chips above the dock (page mode). */}
      {!sectionMode && attachments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {attachments.map((a, i) => (
            <span
              key={a.path}
              className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs text-foreground"
            >
              {a.kind === "image" ? (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate">{a.name}</span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(i)}
                  aria-label={`Remove ${a.name}`}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ── THE DOCK: one rounded box — textarea + controls together ── */}
      <div
        className={cn(
          "rounded-2xl border border-border bg-card shadow-sm transition-shadow",
          "focus-within:border-[hsl(var(--ring))] focus-within:shadow-md",
        )}
      >
        <Textarea
          id="studio-composer"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={minRowsResolved}
          placeholder={sectionMode ? SECTION_PLACEHOLDER : placeholder ?? PAGE_PLACEHOLDER}
          // Borderless inside the dock — the container carries the border/shadow/focus ring, so
          // the textarea is a transparent field flush inside it (one cohesive box, not a box
          // in a box). The grow effect above bounds its height; overflow scrolls internally.
          className="resize-none border-0 bg-transparent px-3.5 pb-1.5 pt-3 text-sm leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />

        {/* control row — lives INSIDE the dock, always visible under the textarea */}
        <div className="flex items-center gap-1 px-2 pb-2">
          {!sectionMode && onFilesSelected && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={GROWTH_ASSET_ACCEPT}
                multiple
                className="hidden"
                onChange={onFileInputChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || attachmentsBusy || attachSlotsLeft <= 0}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach a file"
                title={
                  attachSlotsLeft <= 0
                    ? `Up to ${GROWTH_ASSET_MAX_COUNT} files`
                    : "Attach reference material or the deliverable file"
                }
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                {attachmentsBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Paperclip className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </>
          )}

          {!sectionMode && onRegenerate && canRegenerate && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={busy || disabled}
              className="h-8 text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Rebuild
            </Button>
          )}

          <span className="ml-auto hidden pr-1 text-[11px] text-muted-foreground sm:block">
            ⌘/Ctrl + Enter
          </span>

          {/* The send act. Indigo in the builder (Publish is the gold act); gold on HOME. */}
          <Button
            type="button"
            variant={submitVariant}
            size="sm"
            onClick={submit}
            disabled={!canSubmit}
            className="shrink-0"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                {busyLabel ?? "Working…"}
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden />
                {sectionMode ? "Apply the change" : submitLabel ?? "Build the page"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* One quiet helper line under the dock. */}
      <p className="px-0.5 text-xs text-muted-foreground">
        {sectionMode
          ? "Paige rewrites this one section and leaves the rest of the page alone."
          : helperText ?? "The more real detail you give — the offer, the audience, the ask — the closer the first draft lands."}
      </p>
    </div>
  );
}

export default PromptComposer;
