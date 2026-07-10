// Shared helpers for the "Customize Paige" console sections.
// Extracted verbatim from the former PlaybookAdmin page so the 6 config blocks
// keep their exact patch/slugify/RowShell/INTAKE_TYPES behavior — no logic rewrite.
import type React from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Playbook, IntakeField } from "@/lib/playbook/types";

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";

export const INTAKE_TYPES: IntakeField["type"][] = [
  "text", "longtext", "select", "number", "date", "phone", "address",
];

/** Mutator-style patch, identical to the old PlaybookAdmin helper. */
export type PatchFn = (fn: (d: Playbook) => void) => void;

export interface SectionProps {
  pb: Playbook;
  patch: PatchFn;
}

export function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function RowShell({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border p-3">
      <div className="flex-1 min-w-0 space-y-2">{children}</div>
      <Button variant="ghost" size="icon" className="text-muted-foreground shrink-0" onClick={onRemove} aria-label="Remove">
        <Trash2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
