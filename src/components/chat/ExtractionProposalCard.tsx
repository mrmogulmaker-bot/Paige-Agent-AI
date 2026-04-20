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
          <p className="text-[13px] font-medium text-foreground leading-tight">
            {proposal.intro ||
              (isSingleField
                ? "I caught something I can save for you."
                : "I found the following information:")}
          </p>
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
          <span>
            Done — I&apos;ve updated your{" "}
            {proposal.fields.some((f) => f.key.startsWith("profile.")) ? "personal" : "business"}{" "}
            profile.
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
