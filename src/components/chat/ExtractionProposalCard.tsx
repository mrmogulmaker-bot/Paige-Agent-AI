import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, FileText, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExtractionField {
  /** Stable identifier — also used as the field_path sent to paige-write-back. */
  key: string;
  /** Human-friendly label shown in the checklist. */
  label: string;
  /** The extracted value as a primitive (string/number/boolean) or null. */
  value: string | number | boolean | null;
  /** Optional pretty-formatted display version of the value. */
  displayValue?: string;
}

export interface ExtractionProposal {
  /** Unique id Paige assigns so we can track state. */
  id: string;
  /** "document" or "conversation" — drives copy. */
  source: "document" | "conversation";
  /** Document type (e.g. "IRS EIN Letter") when source === "document". */
  documentType?: string;
  /** Top-level message Paige used to introduce the card. */
  intro?: string;
  fields: ExtractionField[];
}

type Status = "idle" | "saving" | "saved" | "skipped" | "error";

interface ExtractionProposalCardProps {
  proposal: ExtractionProposal;
  onConfirm: (selectedKeys: string[]) => Promise<void> | void;
  onSkip: () => void;
}

export function ExtractionProposalCard({
  proposal,
  onConfirm,
  onSkip,
}: ExtractionProposalCardProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(proposal.fields.map((f) => f.key)),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggle = (key: string) => {
    if (status !== "idle") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = async () => {
    if (status !== "idle") return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      await onConfirm(Array.from(selected));
      setStatus("saved");
    } catch (err) {
      console.error("Extraction confirmation failed:", err);
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
      setStatus("error");
    }
  };

  const handleSkip = () => {
    if (status !== "idle") return;
    setStatus("skipped");
    onSkip();
  };

  const isSingleField = proposal.fields.length === 1;
  const SourceIcon = proposal.source === "document" ? FileText : MessageSquare;

  return (
    <Card className="bg-card border-accent/30 p-3 space-y-3 mt-1">
      <div className="flex items-start gap-2">
        <SourceIcon className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          {/*
            THE INTRO IS AN "IT HASN'T HAPPENED YET" SENTENCE, so it stops being true the moment it
            has. The credit proposal's intro is literally "Nothing has been saved to the profile yet
            — tell me which of these to record", and it was rendering above the settled line, so a
            card that had just saved read: "Nothing has been saved to the profile yet… Done — I've
            updated your business profile." Both at once, on screen, to the person who just clicked.
            Hiding a sentence that has become false is not a design change; leaving it is a §13 one.
          */}
          {status === "idle" && (
            <p className="text-[13px] font-medium text-foreground leading-tight">
              {proposal.intro ||
                (isSingleField
                  ? "I caught something I can save for you."
                  : "I found the following information:")}
            </p>
          )}
          {proposal.documentType && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              From: {proposal.documentType}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {proposal.fields.map((field) => {
          const isChecked = selected.has(field.key);
          return (
            <label
              key={field.key}
              className={cn(
                "flex items-start gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                isChecked ? "bg-accent/5" : "hover:bg-muted/40",
                status !== "idle" && "cursor-default",
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => toggle(field.key)}
                disabled={status !== "idle"}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-muted-foreground leading-tight">
                  {field.label}
                </p>
                <p className="text-[13px] text-foreground font-medium break-words">
                  {field.displayValue ?? String(field.value ?? "")}
                </p>
              </div>
            </label>
          );
        })}
      </div>

      {status === "saved" && (
        <div className="flex items-center gap-1.5 text-[12px] text-accent">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {/*
            IT ONLY NAMES A PROFILE WHEN IT KNOWS WHICH ONE. The branch was a two-way guess on a
            `profile.` key prefix, with "business" as the fallback — so a credit report, whose keys
            are `credit_score_equifax` and friends, reported a write to three FICO columns and five
            credit tables as "I've updated your business profile". Wrong noun, stated confidently,
            about the one thing the person is being asked to trust the card on.
            The prefixes are the REAL ones `conversationalExtractor` emits — `foundation.`,
            `public_presence.` and `intake.` are all the business profile, `profile.` is the
            personal one. Naming them explicitly rather than falling back to "business" is what
            keeps this from regressing the cases that were already right: a first attempt at this
            fix used a `business.` prefix that nothing emits, which would have turned every correct
            "business profile" into a vaguer sentence while fixing only the credit one (§58).
            OWED TO CLAUDE DESIGN: the last case says only that it saved. What a credit-report
            confirmation should actually READ is CD's call; what is ours is that it must not name
            the wrong thing.
          */}
          <span>
            {proposal.fields.some((f) => f.key.startsWith("profile."))
              ? "Done — I've updated your personal profile."
              : proposal.fields.some((f) =>
                  ["foundation.", "public_presence.", "intake."].some((p) => f.key.startsWith(p)))
                ? "Done — I've updated your business profile."
                : "Done — I've saved that."}
          </span>
        </div>
      )}
      {status === "skipped" && (
        <p className="text-[12px] text-muted-foreground">
          No problem — just let me know if you want to save it later.
        </p>
      )}
      {status === "error" && (
        <p className="text-[12px] text-destructive">{errorMsg}</p>
      )}

      {status === "idle" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="bg-gradient-gold hover:opacity-90 h-8 text-xs"
          >
            {isSingleField ? "Yes, save it" : `Save selected (${selected.size})`}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSkip}
            className="h-8 text-xs"
          >
            {isSingleField ? "No thanks" : "Skip all"}
          </Button>
        </div>
      )}

      {status === "saving" && (
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving…</span>
        </div>
      )}
    </Card>
  );
}
