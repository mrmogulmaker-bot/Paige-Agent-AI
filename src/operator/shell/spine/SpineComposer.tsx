/**
 * The composer — `v3.dc.html` L4152–L4186, driven by `composerVals` at L10501–L10575.
 *
 * ONE COMPOSER ACROSS EVERY FACE (the pack's own note, L10374–L10375): what you type is still
 * addressed to her, and only the prompt changes to say what she will do with it from where you
 * are standing. There is no per-face composer and no artifact-type control anywhere in it
 * (§18/§21).
 *
 * Container, verbatim: `position:relative; flex:none; padding:12px 16px 15px;
 * border-top:1px solid var(--pg-line)`.
 *
 * §18 — NO SEND PATH LIVES HERE. `onSend` receives the text and the staked directives and the
 * caller owns everything after that. The three sigils are parsed for the picker only; the
 * pack's own `sendDirected` routing (L10578–L10625) is session behaviour and is not ported.
 *
 * WHAT IS FIXTURE AND IS NOT PORTED: the picker's pool. The pack fills it from `IA.AGENTS`,
 * `IA.SKILLS` and the teach list; here it comes from `onResolvePicker`, and the pack's own
 * conditional covers its absence — `pickerOpen: !!sigil && items.length > 0` (L10547), so with
 * nothing to offer the picker simply does not open.
 */
import { useCallback, useMemo, useState } from "react";
import type {
  SpineDirective,
  SpineFaceId,
  SpinePickerItem,
  SpineSigil,
} from "@/operator/shell/spine/spineContract";
import { ACT_BUTTON, QUIET_BUTTON } from "@/operator/shell/spine/spineStyles";

/** `composerPlaceholder` — L10376–L10383. `code` carries none in the pack; that is designed. */
const PLACEHOLDER: Partial<Record<SpineFaceId, string>> = {
  chat: "Talk while she works…",
  memory: "Tell her to remember, or to forget…",
  team: "Ask her to delegate something…",
  sandbox: "Ask her to build or find something…",
};

/** `pickerTitle` — L10548. */
const PICKER_TITLE: Record<SpineSigil, string> = {
  "@": "Hand this to",
  "/": "Call a skill",
  "#": "Memory",
};

/** `composerHelp` — L10571. */
const HELP_REST = "@ hand it to someone · / call a skill · # remember";
const HELP_SIGIL = "Esc to cancel";

/** The sigil scanner — L10505, verbatim. */
const SIGIL_RE = /([@/#])([\w -]*)$/;

/** `tools` — L5253–L5263. Three controls, glyph paths and titles ported exactly. */
const TOOL_GLYPHS = {
  voice:
    "M8 2.6a1.9 1.9 0 0 1 1.9 1.9v3.6a1.9 1.9 0 0 1-3.8 0V4.5A1.9 1.9 0 0 1 8 2.6z M4 7.6a4 4 0 0 0 8 0 M8 11.6v1.8 M6 13.4h4",
  attach:
    "M11.4 6.6L7 11a2.3 2.3 0 0 1-3.3-3.3l4.8-4.8a1.5 1.5 0 0 1 2.1 2.1L5.8 9.8a.8.8 0 0 1-1.1-1.1l4.4-4.4",
  download: "M8 2.6v7.6 M5 7.6L8 10.6l3-3 M3 12.4h10",
} as const;

const TOOL_CLASS =
  "grid h-[30px] w-[30px] place-items-center rounded-[var(--pg-r-chip)] border-0 bg-transparent disabled:cursor-not-allowed";

export type SpineComposerProps = {
  readonly face: SpineFaceId;
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly directives?: readonly SpineDirective[];
  readonly onDropDirective?: (id: string) => void;
  readonly onStakeDirective?: (sigil: SpineSigil, item: SpinePickerItem) => void;
  /** The pool behind a sigil. Absent → the picker never opens (the pack's own conditional). */
  readonly onResolvePicker?: (sigil: SpineSigil) => readonly SpinePickerItem[];
  readonly onSend?: (text: string, directives: readonly SpineDirective[]) => void;
  /** `readOnly` — `s.scope === 1` at L10631. Send drops to the quiet plate and cannot fire. */
  readonly readOnly?: boolean;
  /** The mic reads `--pg-gold-core` while it is open (L5256). */
  readonly listening?: boolean;
  readonly onVoice?: () => void;
  readonly onAttach?: () => void;
  readonly onDownload?: () => void;
};

export default function SpineComposer({
  face,
  value,
  onChange,
  directives = [],
  onDropDirective,
  onStakeDirective,
  onResolvePicker,
  onSend,
  readOnly = false,
  listening = false,
  onVoice,
  onAttach,
  onDownload,
}: SpineComposerProps) {
  const [dismissed, setDismissed] = useState(false);

  const match = useMemo(() => SIGIL_RE.exec(value), [value]);
  const sigil = (match ? match[1] : null) as SpineSigil | null;
  const query = match ? match[2].toLowerCase() : "";

  /** `items` — L10527–L10528: prefix match on the label or on any word inside it, first five. */
  const items = useMemo(() => {
    if (!sigil || !onResolvePicker || dismissed) return [];
    return onResolvePicker(sigil)
      .filter(
        (i) =>
          !query ||
          i.label.toLowerCase().indexOf(query) === 0 ||
          i.label.toLowerCase().indexOf(` ${query}`) > -1,
      )
      .slice(0, 5);
  }, [sigil, onResolvePicker, query, dismissed]);

  const pickerOpen = !!sigil && items.length > 0;

  const stake = useCallback(
    (item: SpinePickerItem) => {
      if (!sigil) return;
      onChange(value.replace(SIGIL_RE, ""));
      onStakeDirective?.(sigil, item);
    },
    [sigil, value, onChange, onStakeDirective],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // L10545–L10546, verbatim: Escape clears a live sigil, Enter (no shift) sends.
      if (e.key === "Escape" && sigil) {
        e.preventDefault();
        onChange(value.replace(SIGIL_RE, ""));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!readOnly && onSend) onSend(value, directives);
      }
    },
    [sigil, value, onChange, readOnly, onSend, directives],
  );

  const tools: readonly { key: string; title: string; glyph: string; act?: () => void; lit?: boolean }[] = [
    { key: "voice", title: "Speak to her", glyph: TOOL_GLYPHS.voice, act: onVoice, lit: listening },
    { key: "attach", title: "Attach a file", glyph: TOOL_GLYPHS.attach, act: onAttach },
    { key: "download", title: "Download the conversation", glyph: TOOL_GLYPHS.download, act: onDownload },
  ];

  return (
    <div className="relative min-w-0 flex-none border-t border-[var(--pg-line)] px-4 pb-[15px] pt-3">
      {/* the sigil picker · L4153–L4168 */}
      {pickerOpen && sigil ? (
        <div
          data-spine-picker={sigil}
          className="absolute bottom-full left-[14px] right-[14px] z-[6] mb-1.5 max-h-[232px] overflow-auto rounded-[var(--pg-r-plate)] bg-[var(--pg-raised)] shadow-[shadow:var(--pg-lift-2)] outline outline-1 outline-[var(--pg-line-strong)]"
        >
          <p className="px-[13px] pb-[7px] pt-[9px] text-[length:var(--pg-t-label)] text-[var(--pg-faint)]">
            {PICKER_TITLE[sigil]}
          </p>
          {items.map((i) => (
            <button
              key={i.label}
              type="button"
              onClick={() => stake(i)}
              className="flex min-h-[44px] w-full items-center gap-[10px] bg-transparent px-[13px] text-left text-[var(--pg-ink)]"
              // L10555-L10557 — inline, so the one-sided hairline does not depend on Tailwind's
              // utility emission order against `border-0`.
              style={{ border: 0, borderTop: "1px solid var(--pg-line-soft)", opacity: i.dead ? 0.6 : 1 }}
            >
              <span className="flex min-w-0 flex-col">
                <b className="truncate text-[length:var(--pg-t-body)] font-medium">{i.label}</b>
                <small className="mt-0.5 truncate text-[length:var(--pg-t-label)] text-[var(--pg-faint)]">
                  {i.note}
                </small>
              </span>
              <span
                className="ml-auto flex-none whitespace-nowrap font-mono text-[length:var(--pg-t-label)] font-normal"
                style={{ color: i.dead ? "var(--pg-faint)" : "var(--pg-gold-deep)" }}
              >
                {i.tag}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* staked directives · L4169–L4176 */}
      {directives.length ? (
        <div className="flex flex-wrap gap-[5px] pb-2">
          {directives.map((d) => (
            <button
              key={d.id}
              type="button"
              title="Remove"
              onClick={onDropDirective ? () => onDropDirective(d.id) : undefined}
              disabled={!onDropDirective}
              className="inline-flex min-h-[24px] items-center gap-[5px] rounded-[var(--pg-r-pill)] border font-mono text-[length:var(--pg-t-label)] font-medium disabled:cursor-not-allowed"
              style={{
                padding: "0 9px",
                borderColor: d.dead ? "var(--pg-line)" : "var(--pg-gold-deep)",
                background: d.dead ? "transparent" : "var(--pg-lift)",
                color: d.dead ? "var(--pg-faint)" : "var(--pg-gold-deep)",
              }}
            >
              {d.label} ×
            </button>
          ))}
        </div>
      ) : null}

      {/* L4175 */}
      <textarea
        aria-label="Direct PAIGE"
        value={value}
        placeholder={PLACEHOLDER[face]}
        onChange={(e) => {
          setDismissed(false);
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
        className="block h-[38px] w-full resize-none border-0 bg-transparent p-0 text-[length:var(--pg-t-body)] leading-[1.5] text-[var(--pg-ink)] outline-none placeholder:text-[var(--pg-faint)]"
      />

      {/* L4176 */}
      <p className="mt-0.5 text-[length:var(--pg-t-label)] text-[var(--pg-faint)]">
        {sigil ? HELP_SIGIL : HELP_REST}
      </p>

      {/* L4177–L4185 */}
      <div className="mt-1 flex items-center gap-[3px]">
        {tools.map((t) => (
          <button
            key={t.key}
            type="button"
            title={t.title}
            aria-label={t.title}
            onClick={t.act}
            disabled={!t.act}
            className={TOOL_CLASS}
            style={{ color: t.lit ? "var(--pg-gold-core)" : "var(--pg-faint)" }}
          >
            <svg viewBox="0 0 16 16" width={15} height={15} aria-hidden="true">
              <path
                d={t.glyph}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.3}
                strokeLinecap="square"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
        <span className="flex-1" />
        {/* `sendStyle` — L11164. The one gold act in the column; read-only drops it to the
            quiet plate with `not-allowed`, which is the pack's own read-scope treatment. */}
        <button
          type="button"
          onClick={onSend && !readOnly ? () => onSend(value, directives) : undefined}
          disabled={readOnly || !onSend}
          style={
            readOnly
              ? { ...QUIET_BUTTON, minHeight: "32px", color: "var(--pg-faint)", cursor: "not-allowed" }
              : { ...ACT_BUTTON, minHeight: "32px" }
          }
        >
          Send
        </button>
      </div>
    </div>
  );
}
