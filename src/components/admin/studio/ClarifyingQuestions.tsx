// The pre-generation probe (§15) — a thin or questionnaire-signaling brief gets a few
// grounding questions before Paige spends a model call, instead of guessing specifics or
// shipping the generic 3-field questionnaire nobody asked for.
//
// Body-only: it renders inside StudioSplit's railBody. The submit ("Build the page") lives
// in the railFooter next to it, owned by StudioShell since it drives state — same split as
// PromptComposer's own conversation-vs-submit boundary. Gold budget: zero — the submit is
// indigo (§11).
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLARIFYING_RECAP_LABEL } from "./studio-copy";
import type { ClarifyingQuestion } from "./studio-types";

export interface ClarifyingQuestionsProps {
  /** The whole-page brief the operator already wrote — recapped verbatim, never rewritten. */
  brief: string;
  questions: ClarifyingQuestion[];
  answers: Record<string, string>;
  onAnswerChange: (id: string, value: string) => void;
  /** Leave the clarifying step, back to the plain brief — the brief text is preserved. */
  onBack: () => void;
  disabled?: boolean;
  className?: string;
}

export function ClarifyingQuestions({
  brief,
  questions,
  answers,
  onAnswerChange,
  onBack,
  disabled = false,
  className,
}: ClarifyingQuestionsProps) {
  return (
    <div className={className}>
      <div
        aria-live="polite"
        className="flex items-start justify-between gap-2 rounded-lg border border-[hsl(var(--ring)/0.4)] bg-[hsl(var(--ring)/0.06)] px-3 py-2"
      >
        <p className="min-w-0 text-xs text-foreground">
          <span className="font-medium">{CLARIFYING_RECAP_LABEL}</span> &ldquo;{brief}&rdquo;
        </p>
        <button
          type="button"
          onClick={onBack}
          aria-label="Edit the brief instead"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <Label htmlFor={`clarify-${q.id}`}>{q.question}</Label>
            <Textarea
              id={`clarify-${q.id}`}
              value={answers[q.id] ?? ""}
              onChange={(e) => onAnswerChange(q.id, e.target.value)}
              placeholder={q.placeholder}
              disabled={disabled}
              rows={3}
              className="resize-none text-sm leading-relaxed"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ClarifyingQuestions;
