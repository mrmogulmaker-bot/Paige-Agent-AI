// Dirty indicator + Save button that lives in the console header, persistent
// across all 6 Playbook sections (spec §1.7). Knowledge commits per-doc and is
// never gated behind this button.
import { Button } from "@/components/ui/button";
import { Loader2, Save, Check } from "lucide-react";

interface Props {
  dirty: boolean;
  saving: boolean;
  justSaved: boolean;
  onSave: () => void;
}

export function PaigeConsoleSaveBar({ dirty, saving, justSaved, onSave }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <span className="text-xs text-primary-foreground/70">
        {dirty
          ? "Unsaved changes"
          : justSaved
            ? "All changes saved"
            : "Knowledge saves as you add it — no need to hit Save."}
      </span>
      <Button
        onClick={onSave}
        disabled={!dirty || saving}
        size="sm"
        className="bg-gradient-gold hover:opacity-90 text-accent-foreground disabled:opacity-50"
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
        ) : justSaved && !dirty ? (
          <><Check className="w-4 h-4 mr-2" /> Saved</>
        ) : (
          <><Save className="w-4 h-4 mr-2" /> Save Paige</>
        )}
      </Button>
    </div>
  );
}
