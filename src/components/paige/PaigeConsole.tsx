// The "Customize Paige" console: one wide right-side Sheet with a persistent
// left rail across the 7 areas, a header save bar, and a dirty-close guard
// (spec §1.5 / §1.7). One scrim, one dirty model, instant lateral movement.
import { useState } from "react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PaigeConsoleSaveBar } from "./PaigeConsoleSaveBar";
import { PaigeConsoleRail, PaigeConsoleRailMobile, type ConsoleSection, type RailCounts } from "./PaigeConsoleRail";
import { PersonaSection } from "./sections/PersonaSection";
import { QuickActionsSection } from "./sections/QuickActionsSection";
import { ProbingSection } from "./sections/ProbingSection";
import { JourneySection } from "./sections/JourneySection";
import { IntakeSection } from "./sections/IntakeSection";
import { PortalSection } from "./sections/PortalSection";
import { KnowledgePanel } from "./KnowledgePanel";
import type { PatchFn } from "./sections/shared";
import type { Playbook } from "@/lib/playbook/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pb: Playbook;
  patch: PatchFn;
  onApplyPreset: (slug: string) => void;
  section: ConsoleSection;
  onSection: (s: ConsoleSection) => void;
  counts: RailCounts;
  knowledgePulse: boolean;
  dirty: boolean;
  saving: boolean;
  justSaved: boolean;
  onSave: () => Promise<boolean>;
  onDiscard: () => void;
  tenantName: string;
}

export function PaigeConsole({
  open, onOpenChange, pb, patch, onApplyPreset, section, onSection,
  counts, knowledgePulse, dirty, saving, justSaved, onSave, onDiscard, tenantName,
}: Props) {
  const [guardOpen, setGuardOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next && dirty) { setGuardOpen(true); return; }
    onOpenChange(next);
  };

  const discardAndClose = () => { onDiscard(); setGuardOpen(false); onOpenChange(false); };
  const saveAndClose = async () => {
    const ok = await onSave();
    setGuardOpen(false);
    if (ok) onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-none md:w-[860px] lg:w-[960px] p-0 gap-0 flex flex-col bg-background"
        >
          <SheetHeader className="px-5 py-4 border-b bg-primary text-primary-foreground text-left space-y-2">
            <div className="flex items-center gap-2">
              <PaigeMark className="h-6 w-6" />
              <SheetTitle className="text-primary-foreground">Customize Paige</SheetTitle>
            </div>
            <SheetDescription className="text-primary-foreground/70">
              Shape how Paige shows up for {tenantName} — and teach her what she should know.
            </SheetDescription>
            <PaigeConsoleSaveBar dirty={dirty} saving={saving} justSaved={justSaved} onSave={onSave} />
          </SheetHeader>

          <div className="flex flex-1 min-h-0">
            <nav className="w-56 shrink-0 border-r overflow-y-auto py-3 hidden md:block">
              <PaigeConsoleRail active={section} onSelect={onSection} counts={counts} knowledgePulse={knowledgePulse} />
            </nav>
            <div className="flex-1 min-w-0 overflow-y-auto px-5 py-5">
              <PaigeConsoleRailMobile className="md:hidden mb-4" active={section} onSelect={onSection} counts={counts} knowledgePulse={knowledgePulse} />
              {section === "persona" && <PersonaSection pb={pb} patch={patch} onApplyPreset={onApplyPreset} />}
              {section === "quickActions" && <QuickActionsSection pb={pb} patch={patch} />}
              {section === "probing" && <ProbingSection pb={pb} patch={patch} />}
              {section === "journey" && <JourneySection pb={pb} patch={patch} />}
              {section === "intake" && <IntakeSection pb={pb} patch={patch} />}
              {section === "portal" && <PortalSection pb={pb} patch={patch} />}
              {section === "knowledge" && <KnowledgePanel tenantName={tenantName} />}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={guardOpen} onOpenChange={setGuardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your changes to Paige?</AlertDialogTitle>
            <AlertDialogDescription>
              You've shaped how Paige works but haven't saved yet. Save now, or discard these changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={discardAndClose}
              className="mt-2 sm:mt-0 inline-flex h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              Discard
            </button>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); saveAndClose(); }}
              className="bg-gradient-gold hover:opacity-90 text-accent-foreground"
            >
              Save &amp; close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
