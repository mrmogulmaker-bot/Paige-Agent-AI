// ConversationsRichComposer — the scope-agnostic dense composer (§18 one home). It wraps the
// shared MessageComposer atom (the textarea + the ONE gold Send act) and injects the tenant's
// full affordance cluster through the atom's header/toolbar slots, EACH gated by an adapter
// capability flag. A scope with a flag off simply does not render that affordance — no fork,
// no scope branch. The operator SMS composer passes { canDraftWithPaige:false, canSchedule:false,
// hasTemplates:false, hasSignature:false, hasAttachments:false } and renders down to the bare
// textarea + Send; the tenant email composer passes them all on and renders the full row.
//
// This composer owns only TRANSIENT UI state (the Draft-with-Paige guide popover, the schedule
// popover open state). The substantive values (body, subject, scheduledFor, attachments,
// drafting status, draft flags) are the container's, passed in — so the container keeps driving
// its existing send/draft/schedule seams unchanged (§13/§37 zero regression).
//
// §11: gold ONLY on the atom's Send; every affordance here is neutral/indigo utility; token-only,
// motion-safe.
import { useRef, useState } from "react";
import {
  Loader2, Paperclip, Sparkles, Clock, ChevronDown, X, Pencil, AlertTriangle,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CHANNEL_ICON, CHANNEL_LABEL } from "../inbox-shared";
import { MessageComposer } from "../MessageComposer";
import { AttachmentChip } from "../AttachmentChip";
import { DictationMicButton } from "@/components/voice/DictationMicButton";
import { appendDictation } from "@/lib/voice/useDictation";
import type { ConversationsComposerModel, DraftTone } from "./conversationsAdapter";

export function ConversationsRichComposer(model: ConversationsComposerModel) {
  const {
    capabilities: caps,
    value, onChange, onSend, sending, disabled, placeholder, note, sendLabel, rows, textareaClassName,
    identities, identityId, onIdentityChange, showIdentity = true,
    showSubject = false, subject = "", onSubjectChange,
    attachments = [], uploading = false, onAttachFiles, onRemoveAttachment,
    showDraftWithPaige = false, onDraftWithPaige, drafting = false, draftReadingDoc = false,
    draftFlags = [], canDraft = true,
    templates = [], onApplyTemplate,
    signatureAvailable = false, appendSignature = true, onToggleSignature,
    scheduledFor, onSchedule,
    showDictation = false, onDictate, onDictateError,
    editingDraft = false, onCancelEdit,
    dragOver = false, onDropFiles, onDragOverZone, onDragLeaveZone,
  } = model;

  // transient UI-only state owned by the composer
  const [draftGuideOpen, setDraftGuideOpen] = useState(false);
  const [draftGuide, setDraftGuide] = useState("");
  const [draftTone, setDraftTone] = useState<DraftTone>("professional");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fireDraft = () => onDraftWithPaige?.({ guide: draftGuide.trim(), tone: draftTone });

  const renderDraft = caps.canDraftWithPaige && showDraftWithPaige && !!onDraftWithPaige;
  const renderTemplates = caps.hasTemplates && templates.length > 0 && !!onApplyTemplate;
  const renderSignature = caps.hasSignature && signatureAvailable && !!onToggleSignature;
  const renderAttach = caps.hasAttachments && !!onAttachFiles;
  const renderSchedule = caps.canSchedule && !!onSchedule;

  const header = (
    <div className="space-y-2">
      {editingDraft && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Pencil className="h-3 w-3" /> Editing Paige's draft — Send replaces and delivers it.
          {onCancelEdit && (
            <button type="button" className="ml-1 underline hover:text-foreground" onClick={onCancelEdit}>
              Cancel
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showIdentity && identities.length > 0 && (
          <Select value={identityId} onValueChange={onIdentityChange}>
            <SelectTrigger className="h-9 min-w-[220px]">
              <SelectValue placeholder="Sending address" />
            </SelectTrigger>
            <SelectContent>
              {identities.map((idn) => {
                const Icon = CHANNEL_ICON[idn.channel];
                return (
                  <SelectItem key={idn.id} value={idn.id}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      <span>
                        {idn.label || CHANNEL_LABEL[idn.channel]}
                        {idn.sublabel ? <span className="ml-1.5 text-xs text-muted-foreground">· {idn.sublabel}</span> : null}
                      </span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        {showSubject && (
          <Input
            value={subject}
            onChange={(e) => onSubjectChange?.(e.target.value)}
            placeholder="Subject"
            className="h-9 flex-1 min-w-[180px]"
          />
        )}
      </div>

      {/* Attachment chip row */}
      {renderAttach && attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attachments.map((a) => (
            <AttachmentChip key={a.url} a={a} onRemove={() => a.url && onRemoveAttachment?.(a)} />
          ))}
        </div>
      )}

      {/* Compliance flags from Paige's draft — tokened, not raw amber (§11). */}
      {renderDraft && draftFlags.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-md border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.08)] px-2.5 py-1.5 text-[11px] text-[hsl(var(--warning))]">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span><span className="font-medium">Check before sending:</span> {draftFlags.join(" · ")}</span>
        </div>
      )}
    </div>
  );

  const toolbar = (
    <>
      {renderAttach && (
        <>
          <input
            ref={fileInputRef} type="file" multiple hidden
            onChange={(e) => { if (e.target.files?.length) onAttachFiles?.(e.target.files); e.target.value = ""; }}
          />
          {/* Attach — leads the cluster; neutral/indigo utility (gold is Send, §11). */}
          <Button variant="outline" size="sm" className="h-8"
            onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Paperclip className="mr-1.5 h-3.5 w-3.5" />}
            Attach
          </Button>
        </>
      )}

      {/* Hold-to-dictate — neutral utility; dictated text feeds THROUGH the container's
          snippet-expanding onChange (via onDictate + a live ref) so expansion still runs. */}
      {showDictation && (
        <DictationMicButton
          onText={(seg) => (onDictate ? onDictate(seg) : onChange(appendDictation(value, seg)))}
          onError={(msg) => onDictateError?.(msg)}
          disabled={sending || drafting || uploading}
          variant="outline"
          size="sm"
          label="Dictate"
          activeLabel="Listening…"
          className="h-8 border-[hsl(var(--primary)/0.4)]"
        />
      )}

      {/* Draft with Paige — the headline assist. Indigo-tinted (NOT gold, §11); one-click
          primary + optional guide popover. */}
      {renderDraft && (
        <div className="inline-flex items-center">
          <Button
            variant="outline" size="sm"
            className="h-8 min-w-[8.5rem] justify-center rounded-r-none border-r-0 border-[hsl(var(--primary)/0.4)]"
            onClick={fireDraft}
            disabled={drafting || sending || uploading || !canDraft}
            aria-busy={drafting}
            title={!canDraft ? "Add a recipient to draft a reply" : undefined}
          >
            {drafting
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />}
            {drafting
              ? (draftReadingDoc ? "Reading attachment…" : "Paige is drafting…")
              : "Draft with Paige"}
          </Button>
          <Popover open={draftGuideOpen} onOpenChange={setDraftGuideOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline" size="sm"
                className="h-8 rounded-l-none border-[hsl(var(--primary)/0.4)] px-2"
                aria-label="Guide Paige's draft" disabled={drafting}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 p-3">
              <label htmlFor="draft-guide" className="block text-[11px] font-medium text-muted-foreground">
                Optional — tell Paige the angle &amp; tone
              </label>
              <Textarea
                id="draft-guide" rows={2} value={draftGuide}
                onChange={(e) => setDraftGuide(e.target.value)}
                placeholder="e.g. Confirm the Thursday call and ask for their intake form"
                className="resize-none text-sm"
              />
              <Select value={draftTone} onValueChange={(v) => setDraftTone(v as DraftTone)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="warm">Warm</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 w-full"
                onClick={() => { fireDraft(); setDraftGuideOpen(false); }} disabled={drafting}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Draft it
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Saved email templates — non-gold utility (§11). */}
      {renderTemplates && (
        <Select onValueChange={(k) => onApplyTemplate?.(k)}>
          <SelectTrigger className="h-8 w-[190px]">
            <SelectValue placeholder="Insert template…" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.template_key} value={t.template_key}>
                <span className="mr-1.5 text-xs text-muted-foreground">[{t.category}]</span>{t.subject}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {renderSignature && (
        <Button
          variant="outline" size="sm" className="h-8"
          aria-pressed={appendSignature}
          data-state={appendSignature ? "on" : "off"}
          onClick={onToggleSignature}
        >
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Signature {appendSignature ? "on" : "off"}
        </Button>
      )}

      {renderSchedule && (
        <>
          <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Clock className="mr-1.5 h-3.5 w-3.5" />
                {scheduledFor ? "Scheduled" : "Schedule"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 space-y-1 p-2">
              <button type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => { onSchedule?.(new Date(Date.now() + 3600_000).toISOString()); setScheduleOpen(false); }}>
                In 1 hour
              </button>
              <button type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
                  onSchedule?.(d.toISOString()); setScheduleOpen(false);
                }}>
                Tomorrow, 9:00 AM
              </button>
              <div className="px-2 pt-1">
                <label className="text-[11px] text-muted-foreground">Custom</label>
                <Input
                  type="datetime-local"
                  className="mt-1 h-9"
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const d = new Date(e.target.value);
                    if (d.getTime() > Date.now()) { onSchedule?.(d.toISOString()); setScheduleOpen(false); }
                  }}
                />
              </div>
            </PopoverContent>
          </Popover>

          {scheduledFor && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground">
              <Clock className="h-3 w-3 text-muted-foreground" />
              {new Date(scheduledFor).toLocaleString()}
              <button type="button" onClick={() => onSchedule?.(null)}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                aria-label="Clear schedule">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </>
      )}
    </>
  );

  // Only render the header/toolbar slots when they hold something (an all-flags-off scope,
  // e.g. operator SMS today, renders the bare atom — identical to the shipped operator composer).
  const hasHeader = editingDraft
    || (showIdentity && identities.length > 0)
    || showSubject
    || (renderAttach && attachments.length > 0)
    || (renderDraft && draftFlags.length > 0);
  const hasToolbar = renderAttach || showDictation || renderDraft || renderTemplates || renderSignature || renderSchedule;

  return (
    <MessageComposer
      value={value}
      onChange={onChange}
      onSend={onSend}
      sending={sending}
      disabled={disabled}
      placeholder={placeholder}
      note={note}
      sendLabel={sendLabel}
      rows={rows}
      header={hasHeader ? header : undefined}
      toolbar={hasToolbar ? toolbar : undefined}
      textareaClassName={cn(textareaClassName, renderAttach && dragOver && "ring-2 ring-[hsl(var(--ring))]")}
      onDrop={renderAttach ? (e) => {
        e.preventDefault(); onDragLeaveZone?.();
        if (e.dataTransfer.files?.length) onDropFiles?.(e.dataTransfer.files);
      } : undefined}
      onDragOver={renderAttach ? (e) => { e.preventDefault(); onDragOverZone?.(); } : undefined}
      onDragLeave={renderAttach ? () => onDragLeaveZone?.() : undefined}
    />
  );
}
