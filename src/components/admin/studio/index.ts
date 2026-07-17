/**
 * The Studio — THE creation surface. One immersive workspace, four outputs
 * (Page / Funnel / Form / Image), a dark chrome wrapping the light live
 * canvas that mounts the REAL <GrowthBlocks> renderer. Preview == published,
 * because it is literally the same tree the public page mounts. (Standalone copy
 * is a Paige-chat capability, not a Studio artifact type — §18/§21; the copy
 * INSIDE a page/funnel/form is an embedded-quality property of that asset.)
 *
 * Everything the operator can do here, Paige can do headlessly: every action
 * bottoms out in one exported function in `studio.ts` (or the narrow generate-image
 * seam Image mode carries over) — §10. Paige's headless copy rail (draftCopy /
 * saveCopy over content-draft) also lives in studio.ts, driven from her chat.
 *
 * GOLD (§11): one gold act per mode — Publish (page, + the PublishDialog
 * confirm), Publish funnel, Create form. Image mode carries none: the act is the
 * server's auto-file.
 */
export { StudioShell, type StudioShellProps } from "./StudioShell";
export { StudioTopBar, type StudioTopBarProps } from "./StudioTopBar";
export { BuildProgress, type BuildProgressProps } from "./BuildProgress";
export { PromptComposer, type PromptComposerProps, type IntentChip } from "./PromptComposer";
export { ClarifyingQuestions, type ClarifyingQuestionsProps } from "./ClarifyingQuestions";
export { GenerationExperience, type GenerationExperienceProps } from "./GenerationExperience";
export { LivePreview, type LivePreviewProps } from "./LivePreview";
export { PublishDialog, type PublishDialogProps, kebabSlug } from "./PublishDialog";
export { STUDIO_MODES, isStudioMode, type StudioMode } from "./studio-types";
