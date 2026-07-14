/**
 * Vibe Studio — the page-building surface.
 *
 * Two panes: one conversational composer, and a live canvas that mounts the REAL
 * <GrowthBlocks> renderer. Preview == published, because it is literally the same tree the
 * public page mounts — same component, same theme resolver, same brand floor, same tenant
 * scope, same footer child. There is no second renderer to drift.
 *
 * Everything the operator can do here, Paige can do headlessly: every action bottoms out in
 * one exported function in `studio.ts` (§10). No component in this folder touches the
 * database directly.
 *
 * GOLD (§11): the whole surface spends gold exactly twice — the Publish trigger in
 * StudioShell's toolbar, and the confirm in PublishDialog. Nowhere else.
 */
export { StudioShell, type StudioShellProps } from "./StudioShell";
export { PromptComposer, type PromptComposerProps, type IntentChip } from "./PromptComposer";
export { GenerationExperience, type GenerationExperienceProps } from "./GenerationExperience";
export { LivePreview, type LivePreviewProps } from "./LivePreview";
export { PublishDialog, type PublishDialogProps, kebabSlug } from "./PublishDialog";
