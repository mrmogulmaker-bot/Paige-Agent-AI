// PlaybookEditorInline — the REAL "Customize Paige" editor, mounted INLINE.
// This is the same editor body the "Customize Paige" console Sheet renders
// (the 7 section components + the section rail + the gold Save bar), reused
// VERBATIM (§31) and driven by the shared usePlaybookEditor lifecycle (§18) —
// never a stub, never a fork. Setup › Playbook mounts this so the tab is a real
// working editor home, not a dead-end "Open Playbook" redirect card (§36).
//
// Knowledge commits per-doc immediately and is never gated behind the header
// Save (spec §1.7); it needs the workspace context for live doc counts, so this
// component provides its own PaigeWorkspaceProvider scoped to the active tenant.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { PaigeWorkspaceProvider, usePaigeWorkspace } from "./PaigeWorkspaceContext";
import { PaigeConsoleSaveBar } from "./PaigeConsoleSaveBar";
import {
  PaigeConsoleRail, PaigeConsoleRailMobile, type ConsoleSection, type RailCounts,
} from "./PaigeConsoleRail";
import { PersonaSection } from "./sections/PersonaSection";
import { QuickActionsSection } from "./sections/QuickActionsSection";
import { ProbingSection } from "./sections/ProbingSection";
import { JourneySection } from "./sections/JourneySection";
import { IntakeSection } from "./sections/IntakeSection";
import { PortalSection } from "./sections/PortalSection";
import { KnowledgePanel } from "./KnowledgePanel";
import { usePlaybookEditor } from "./usePlaybookEditor";

function EditorBody({ tenantName }: { tenantName: string }) {
  const { activeTenantId, counts } = usePaigeWorkspace();
  const editor = usePlaybookEditor(activeTenantId);
  const [section, setSection] = useState<ConsoleSection>("persona");

  if (editor.loading || !editor.pb) {
    return (
      <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading your Paige…
      </div>
    );
  }

  const pb = editor.pb;
  const railCounts: RailCounts = {
    personaNamed: !!pb.persona.name.trim(),
    quickActions: pb.quickActions.length,
    probing: pb.probingQuestions.length,
    journey: pb.journey.length,
    intake: pb.intake.length,
    portal: pb.portal.modules.length,
    knowledgeDocs: counts.docs,
  };

  return (
    <div className="flex flex-col">
      {/* Sticky Save bar — the one gold act (§11) travels with the editor across
          all 7 sections, exactly like the console header bar. Mounted BARE in the
          PageShell (no wrapping SectionCard), so the bar spans the content column
          full-width with no negative-margin bleed — the divider aligns with the
          section Cards' left edge instead of guessing a card gutter (§6/§25). */}
      <div className="sticky top-0 z-10 mb-4 border-b border-border bg-background/85 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <PaigeConsoleSaveBar
          tone="surface"
          dirty={editor.dirty}
          saving={editor.saving}
          justSaved={editor.justSaved}
          onSave={editor.save}
        />
      </div>

      <div className="flex min-h-0 gap-0 md:gap-5">
        {/* Desktop section rail — a recessed navigator, mirrors the console. */}
        <nav className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-16">
            <PaigeConsoleRail active={section} onSelect={setSection} counts={railCounts} />
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          <PaigeConsoleRailMobile className="mb-4 md:hidden" active={section} onSelect={setSection} counts={railCounts} />
          {section === "persona" && <PersonaSection pb={pb} patch={editor.patch} onApplyPreset={editor.applyPreset} />}
          {section === "quickActions" && <QuickActionsSection pb={pb} patch={editor.patch} />}
          {section === "probing" && <ProbingSection pb={pb} patch={editor.patch} />}
          {section === "journey" && <JourneySection pb={pb} patch={editor.patch} />}
          {section === "intake" && <IntakeSection pb={pb} patch={editor.patch} />}
          {section === "portal" && <PortalSection pb={pb} patch={editor.patch} />}
          {section === "knowledge" && <KnowledgePanel tenantName={tenantName} />}
        </div>
      </div>
    </div>
  );
}

export function PlaybookEditorInline({
  activeTenantId,
  tenantName,
}: {
  activeTenantId: string | null;
  tenantName: string;
}) {
  return (
    <PaigeWorkspaceProvider activeTenantId={activeTenantId}>
      <EditorBody tenantName={tenantName} />
    </PaigeWorkspaceProvider>
  );
}
