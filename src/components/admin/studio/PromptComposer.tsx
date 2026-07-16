// The ONE conversational input.
//
// A creative brief, not a form. It has two modes and ONE textarea: describe the whole page,
// or — when a section is selected on the canvas — say what should change about that section.
// Keeping it a single input is what makes the section edit feel like a continuing
// conversation instead of a second tool bolted on the side.
//
// Gold budget: the submit is indigo by default (`variant="default"`) — in the builder the act
// moment is Publish (§11). The Studio HOME is the one exception: it passes `submitVariant="gold"`
// so its "Start building" is the single gold ACT on that surface, and the cosmic hero's
// decorative gold reads as secondary to it.
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
  /** Overrides the field label ("What's this page for?" in page mode). Additive — omit to
   *  keep the page/section defaults unchanged. Lets Copy/Image modes reuse this ONE
   *  composer with their own wording instead of forking a private textarea (§18). */
  heading?: string;
  /** Overrides the placeholder text (page mode only — section mode keeps its own). */
  placeholder?: string;
  /** Overrides the helper caption under the textarea (page mode only). */
  helperText?: string;
  /** Overrides the submit button's resting label ("Build the page" in page mode). */
  submitLabel?: string;
  /** Overrides the submit button's busy label ("Working…" by default). */
  busyLabel?: string;
  /** Starting height of the textarea in rows before it grows with the writing. Defaults to 5
   *  (the builder's roomy brief). The HOME passes a smaller value so the composer stays compact
   *  and the projects gallery stays above the fold (§11 — space is the scarce resource). */
  minRows?: number;
  /** Variant for the submit button. Defaults to "default" (indigo). The Studio HOME passes
   *  "gold" so its "Start building" is the ONE gold ACT on that surface (§11 gold discipline —
   *  the cosmic hero's decorative gold reads as secondary to a single gold act). The in-builder
   *  composer keeps the default indigo, since Publish is the builder's gold act. */
  submitVariant?: "default" | "gold";
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

  // Grow with the writing, up to ~12 rows, then scroll. No jumpy fixed box.
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
          {sectionMode ? "What should this section say?" : heading ?? "What's this page for?"}
        </label>
        <Textarea
          id="studio-composer"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={sectionMode ? MIN_ROWS : minRowsResolved}
          placeholder={sectionMode ? SECTION_PLACEHOLDER : placeholder ?? PAGE_PLACEHOLDER}
          // bg-card + shadow-sm — the ONE input the whole session revolves around should read
          // as a real, lifted field, not the same bare-hairline outline as everything else
          // (§11). shadow-sm alone was a no-op here: the rail it sits in is bg-background, and
          // Textarea's own default is also bg-background, so a shadow against an identical
          // surface never registers. bg-card gives it the same one-step lift SectionCard uses
          // against a page (card sits above background) — now the shadow has something to cast
          // onto. focus-visible:shadow-md mirrors SectionCard's own hover:shadow-lg convention.
          className="resize-none bg-card text-sm leading-relaxed shadow-sm focus-visible:shadow-md"
        />
        <p className="text-xs text-muted-foreground">
          {sectionMode
            ? "Paige rewrites this one section and leaves the rest of the page alone."
            : helperText ?? "The more real detail you give — the offer, the audience, the ask — the closer the first draft lands."}
        </p>
      </div>

      {/* Reference material / lead-magnet attachments — page mode only. Real files, tenant-
          scoped, read as actual multimodal content (§10/§13) — never just described in prose. */}
      {!sectionMode && onFilesSelected && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={GROWTH_ASSET_ACCEPT}
            multiple
            className="hidden"
            onChange={onFileInputChange}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || attachmentsBusy || attachSlotsLeft <= 0}
              onClick={() => fileInputRef.current?.click()}
              className="shadow-xs hover:shadow-sm"
            >
              {attachmentsBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
              )}
              Attach a file
            </Button>
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
          <p className="text-xs text-muted-foreground">
            {attachments.length > 0
              ? "Paige reads these as real reference material — a brand PDF, a program one-pager, a photo. If one is the deliverable you're promising (like a checklist), she'll notice."
              : `Optional — attach up to ${GROWTH_ASSET_MAX_COUNT} images or PDFs for Paige to read while building (reference material, or the real file behind a "get the checklist" offer).`}
          </p>
        </div>
      )}

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
        {/* Indigo by default (in the builder the act moment is Publish, not this). The Studio
            HOME overrides to gold so its "Start building" is the single gold ACT on that surface. */}
        <Button type="button" variant={submitVariant} onClick={submit} disabled={!canSubmit}>
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

        {!sectionMode && onRegenerate && canRegenerate && (
          <Button type="button" variant="outline" onClick={onRegenerate} disabled={busy || disabled} className="shadow-xs hover:shadow-sm">
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
