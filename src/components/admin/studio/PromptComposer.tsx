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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Image as ImageIcon, Loader2, NotebookPen, Paperclip, RefreshCw, Send, X } from "lucide-react";
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

/** A large block the operator pasted, lifted OUT of the textarea into its own chip (the Claude
 *  paste-as-file pattern) so the composer stays a clean one-liner instead of a wall of text. */
interface PastedNote {
  id: string;
  text: string;
  label: string;
}
/** A paste this big (chars OR lines) becomes a note chip instead of flooding the input. */
const PASTE_TO_NOTE_CHARS = 700;
const PASTE_TO_NOTE_LINES = 8;

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
  /** How the dock frames itself. "framed" (default) draws its own rounded border/lit-depth
   *  container. "bare" draws NO border/bg/shadow — for callers that already sit inside a frame
   *  (the HOME hero's `studio-glass-card`), so the dock isn't a box-in-a-box (§11). */
  surface?: "framed" | "bare";
  /** Send-button shape. Omit and it derives from `submitVariant`: gold → a labeled button
   *  ("Start building" on HOME), indigo → a circular ↑ (the builder dock, Lovable-parity). */
  sendShape?: "circle" | "label";
  /** Where the suggestion chips render. "above" (default) keeps the row ABOVE the dock
   *  (HOME/Copy/Image). "dock" moves them INSIDE the box as a compact scroll row so they're
   *  discoverable in the builder without a bottom-pinned row nobody sees (§18 — one chips
   *  concept, placement-controlled). */
  chipPlacement?: "above" | "dock";
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
  surface = "framed",
  sendShape,
  chipPlacement = "above",
  className,
}: PromptComposerProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notes, setNotes] = useState<PastedNote[]>([]);
  const sectionMode = mode === "section" && !!target;
  const framed = surface === "framed";
  // Labeled by default so every meaningful CTA ("Draft with Paige", "Generate image", "Start
  // building") keeps its words. The BUILDER dock opts into the circular ↑ (Lovable parity) by
  // passing sendShape="circle" — that's the one surface whose send carries no standalone label.
  const resolvedSendShape = sendShape ?? "label";
  const attachSlotsLeft = GROWTH_ASSET_MAX_COUNT - attachments.length;
  const showChips =
    chipPlacement === "above" && !sectionMode && !!chips && chips.length > 0 && value.trim().length === 0;
  const showDockChips =
    chipPlacement === "dock" && !sectionMode && !!chips && chips.length > 0 && value.trim().length === 0;

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

  // A pasted note alone can satisfy the length gate — the brief may live entirely in the note.
  const hasNote = !sectionMode && notes.length > 0;
  const canSubmit = !busy && !disabled && (value.trim().length >= (sectionMode ? 2 : 5) || hasNote);

  const submit = useCallback(() => {
    if (!canSubmit) return;
    // Fold any pasted notes into the brief (§13 — the model receives the full pasted context),
    // then clear them so the next brief starts fresh.
    const composed =
      sectionMode || notes.length === 0
        ? value.trim()
        : [value.trim(), ...notes.map((n) => n.text)].filter(Boolean).join("\n\n");
    onSubmit(composed);
    if (!sectionMode && notes.length > 0) setNotes([]);
  }, [canSubmit, onSubmit, value, notes, sectionMode]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  // Claude-style paste-as-notepad: a big paste (chars OR lines) becomes a note CHIP instead of
  // dumping a wall of text into the one-line composer. Small pastes fall through untouched.
  const onPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (sectionMode) return;
      const text = e.clipboardData.getData("text");
      if (!text) return;
      const lineCount = text.split(/\r\n|\r|\n/).length;
      const isLarge = text.length >= PASTE_TO_NOTE_CHARS || lineCount >= PASTE_TO_NOTE_LINES;
      if (!isLarge) return;
      e.preventDefault();
      const trimmed = text.trim();
      if (!trimmed) return;
      const firstLine = trimmed.split(/\r\n|\r|\n/)[0].slice(0, 40).trim();
      setNotes((prev) => [...prev, { id: crypto.randomUUID(), text: trimmed, label: firstLine || "Pasted note" }]);
    },
    [sectionMode],
  );

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

      {/* Suggestion chips — sit ABOVE the dock and clear out once the operator types (§15). The
          composer always sits on a dark studio surface (the HOME glass card / the builder dock),
          where the platform --border hairline nearly vanishes; a scoped indigo edge + faint fill
          gives the chips a crisp, legible resting outline on dark glass (#4). */}
      {showChips && (
        <div className="flex flex-wrap gap-1.5">
          {chips!.map((chip) => (
            <FilterChip
              key={chip.id}
              active={false}
              onClick={() => onChange(chip.seed)}
              className="border-[hsl(var(--studio-glass-border)/0.7)] bg-[hsl(var(--foreground)/0.04)]"
            >
              {chip.label}
            </FilterChip>
          ))}
        </div>
      )}

      {/* ── THE DOCK: one lit floating surface — attachments · textarea · controls together ──
          `framed` draws the rounded border + lit depth and lifts on focus with a halo (not a
          hard border snap). `bare` skips all of that for callers already inside a frame (HOME's
          glass card), so it's never a box-in-a-box (§11). The inner white lip is a fixed-white
          highlight (light in both themes — invisible over a light card, a subtle lit edge over a
          dark one), the mirror of why the drop-shadow uses fixed shadow-ink. */}
      <div
        className={cn(
          "overflow-hidden transition-[border-color,box-shadow]",
          framed && [
            // The in-session dock sits on the lit indigo studio surface, not platform bg-card
            // (the neutral gray the owner called out inside a running session). Same de-gray token
            // family as the frame/rail/masthead so the whole session reads as one indigo room.
            "rounded-3xl border border-[hsl(var(--studio-chrome-border)/0.6)] bg-[hsl(var(--studio-dock))]",
            "shadow-[0_1px_0_0_hsl(0_0%_100%/0.06)_inset,0_10px_30px_-14px_hsl(var(--shadow-ink)/0.55)]",
            "hover:border-[hsl(var(--studio-chrome-border)/0.85)]",
            "focus-within:border-[hsl(var(--ring))] focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.16),0_1px_0_0_hsl(0_0%_100%/0.08)_inset,0_14px_36px_-14px_hsl(var(--shadow-ink)/0.6)]",
          ],
          // BARE (HOME hero): the dock sits inside the glass card. §311 (a): NO inner outline — the
          // glass-card's single refined hairline rim is the ONE frame, so this draws none of its own
          // (the old inset 1px ring stacked on the rim was the "box-in-a-box" the owner flagged).
          // §311 (b): the field is a genuine INPUT well — --studio-input flips WHITE (light) /
          // raised-indigo (dark) with the theme, so the "middle of the chat box" is always a light
          // field with readable text, never dark-on-dark. §311 (c): exactly ONE accent — a soft
          // indigo focus-within glow (the "glowing blue"), no competing rings. Gold stays only on
          // the ↑ submit (§11).
          // A resting INNER shadow (not a border) makes the white well read as a distinct input in
          // light mode without adding a second outline — so it stays ONE frame (the card rim), never
          // the box-in-a-box the owner flagged. On focus-within the same recess keeps + a stronger
          // indigo glow (0.32, up from a too-faint 0.18) is a WCAG-visible focus cue on the white field.
          !framed &&
            "rounded-2xl bg-[hsl(var(--studio-input))] shadow-[inset_0_1px_2px_hsl(var(--studio-ink)/0.08)] focus-within:shadow-[inset_0_1px_2px_hsl(var(--studio-ink)/0.08),0_0_0_3px_hsl(var(--ring)/0.32)]",
        )}
      >
        {/* In-dock suggestion chips (builder) — a compact single-line scroll row at the TOP of
            the box so they're discoverable the instant the builder opens, and gone once you type.
            Same border-b rhythm as the rows below. FilterChip active=false is border/muted, no gold. */}
        {showDockChips && (
          <div
            className={cn(
              "flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
              // Builder dock keeps its hairline divider + tighter rhythm. §311 (a): the BARE/HOME row
              // drops the divider entirely (it was the third "line" in the double-outline the owner
              // flagged) and slims its padding so the composer reads as one clean slim bar (§311 (d)).
              framed ? "border-b border-border/50 pb-2.5 pt-3" : "pb-2 pt-2.5",
            )}
          >
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Try</span>
            {chips!.map((chip) => (
              <FilterChip
                key={chip.id}
                active={false}
                onClick={() => onChange(chip.seed)}
                className={cn(
                  "shrink-0 whitespace-nowrap",
                  // Builder dock (framed): the existing neutral glass chip — untouched, no regression.
                  framed && "border-[hsl(var(--studio-glass-border)/0.7)] bg-[hsl(var(--foreground)/0.04)]",
                  // HOME/bare (owner ask, 2026-07-17): a smaller gold OVAL pill with a LIVING gold glow.
                  // Border/bg are set ONLY here (not stacked on the glass values) so the gold wins with
                  // no CSS source-order ambiguity. The pulsing (staggered) halo lives in .studio-chip-glow
                  // (src/index.css). Gold stays SUBTLE (§11) — the gold ↑ submit below is the primary act.
                  !framed &&
                    "studio-chip-glow rounded-full px-2.5 py-0.5 text-[11px] text-foreground " +
                      "border-[hsl(var(--gold)/0.45)] bg-[hsl(var(--gold)/0.06)] " +
                      "hover:border-[hsl(var(--gold)/0.7)] hover:bg-[hsl(var(--gold)/0.1)] hover:text-foreground",
                )}
              >
                {chip.label}
              </FilterChip>
            ))}
          </div>
        )}

        {/* Uploaded reference/deliverable files — INSIDE the dock now, above the textarea, so the
            box holds its own context (the Lovable pattern). A hairline divider separates them. */}
        {!sectionMode && attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-4 pb-2.5 pt-3">
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

        {/* Pasted notes — a big paste lifts OUT of the textarea into its own chip (Claude pattern),
            so the composer stays a clean line. Folded back into the brief on submit (§13). */}
        {!sectionMode && notes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-4 pb-2.5 pt-3">
            {notes.map((note) => (
              <span
                key={note.id}
                className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs text-foreground"
              >
                <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{note.label}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {note.text.length.toLocaleString()} chars
                </span>
                <button
                  type="button"
                  onClick={() => setNotes((prev) => prev.filter((n) => n.id !== note.id))}
                  aria-label={`Remove pasted note ${note.label}`}
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}

        <Textarea
          id="studio-composer"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          disabled={disabled}
          rows={minRowsResolved}
          placeholder={sectionMode ? SECTION_PLACEHOLDER : placeholder ?? PAGE_PLACEHOLDER}
          // Borderless inside the dock — the container carries the border/shadow/focus ring, so
          // the textarea is a transparent field flush inside it (one cohesive box, not a box
          // in a box). The grow effect above bounds its height; overflow scrolls internally.
          // px-4 aligns the text column with the toolbar's optically-aligned glyph below.
          // Ring suppression only in FRAMED mode, where the container's focus-within halo IS the
          // focus indicator. In BARE mode (HOME hero) there is no container halo, so the textarea
          // keeps its own indigo focus-visible ring — never leave the primary input with no
          // visible focus state (WCAG 2.4.7).
          className={cn(
            "resize-none border-0 bg-transparent px-4 text-sm leading-relaxed shadow-none",
            // The bare input WELL stays light in both themes (--studio-input), so its text is pinned
            // to the always-dark --studio-input-fg (dark-on-light in light AND dark mode — never
            // invisible), and the placeholder to a muted version of it. The focus-within glow is the
            // single focus indicator (suppress the textarea's own ring, as framed does); vertical
            // padding is slimmed so the bar stays a slim single line that grows as you type.
            framed && "pb-2 pt-3.5 focus-visible:ring-0 focus-visible:ring-offset-0",
            !framed &&
              "pb-1.5 pt-2.5 text-[hsl(var(--studio-input-fg))] placeholder:text-[hsl(var(--studio-input-fg)/0.5)] focus-visible:ring-0 focus-visible:ring-offset-0",
          )}
        />

        {/* control row — lives INSIDE the dock, always visible under the textarea */}
        <div className="flex items-center gap-1.5 px-3 pb-3">
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
                size="sm"
                disabled={disabled || attachmentsBusy || attachSlotsLeft <= 0}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Add attachment or context"
                title={
                  attachSlotsLeft <= 0
                    ? `Up to ${GROWTH_ASSET_MAX_COUNT} files`
                    : "Attach reference material or the deliverable file"
                }
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                {attachmentsBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Paperclip className="h-4 w-4" aria-hidden />
                )}
                <span className="hidden sm:inline">Attach</span>
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

          {/* Keyboard hint as real keycaps — only in the FRAMED builder dock, where the composer is a
              persistent tool worth teaching. On the BARE home surface it's suppressed (#1): the whole
              footer collapses to just the inline gold act, so a one-sentence brief reads finite. */}
          {framed && (
            <span className="ml-auto hidden items-center gap-1 pr-0.5 sm:flex" aria-hidden>
              <kbd className="rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ⌘/Ctrl
              </kbd>
              <kbd className="rounded border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ↵
              </kbd>
            </span>
          )}

          {/* The send act. Circular ↑ in the builder (indigo; Publish is the gold act), a labeled
              button on HOME (gold "Start building"). aria-label always carries the meaning. */}
          {resolvedSendShape === "circle" ? (
            <Button
              type="button"
              variant={submitVariant}
              onClick={submit}
              disabled={!canSubmit}
              aria-label={sectionMode ? "Apply the change" : submitLabel ?? "Build the page"}
              className={cn("h-9 w-9 shrink-0 rounded-full p-0 disabled:opacity-40", !framed && "ml-auto")}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <ArrowUp className="h-4 w-4" aria-hidden />
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant={submitVariant}
              size="sm"
              onClick={submit}
              disabled={!canSubmit}
              className={cn("shrink-0", !framed && "ml-auto")}
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
          )}
        </div>
      </div>

      {/* One quiet helper line under the dock — suppressed when a caller passes helperText="" (the
          HOME, where the hero subhead already carries the instruction, #1). */}
      {!(!sectionMode && helperText === "") && (
        <p className="px-0.5 text-xs text-muted-foreground">
          {sectionMode
            ? "Paige rewrites this one section and leaves the rest of the page alone."
            : helperText ?? "The more real detail you give — the offer, the audience, the ask — the closer the first draft lands."}
        </p>
      )}
    </div>
  );
}

export default PromptComposer;
