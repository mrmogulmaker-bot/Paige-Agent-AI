/**
 * Paige Admin — shared premium primitive layer.
 *
 * The Marketplace bar (SkillCard + hero masthead), generalized: hero masthead,
 * numbered rails, embossed glyph-plates, an elevation ladder, word-pills that
 * carry state, gold reserved for the on-moment, motion guarded by
 * useReducedMotion. Every admin page should be:
 *
 *   <PageShell width="…">
 *     <PageHeader … />          // variant="hero" on hubs, "plain" on leaves
 *     <StatRow><StatTile … /></StatRow>
 *     <SectionCard …>…</SectionCard>
 *     <DataTableShell …>…</DataTableShell>  // EmptyState in its `empty` slot
 *   </PageShell>
 *
 * GOLD DISCIPLINE (§6): gold is spent ONLY on the act/approve/on moment —
 * `<Button variant="gold">` for Approve / Send / Run / Enable / the single
 * primary act, and `<StatePill state="on">` for the live state. Never a resting
 * border, decorative icon, selected row, or focus ring (rings are --ring indigo).
 * Gold-as-text uses --gold-dark; gold-as-fill pairs --accent-foreground.
 *
 * TENANT-GENERIC (§2/§9): these are neutral primitives — no vertical/finance
 * content. Copy passed in stays mogul-founder voice and never leaks backend
 * table/function names (that's what EmptyState is for).
 */
export { GlyphPlate } from "./GlyphPlate";
export { ArtifactPreview, type ArtifactPreviewKind, type ArtifactPreviewProps } from "./ArtifactPreview";
export { PageShell } from "./PageShell";
export { PageHeader, type PageHeaderProps } from "./PageHeader";
export { SectionCard } from "./SectionCard";
export { StatTile, StatRow } from "./StatTile";
export { DataTableShell, type Column } from "./DataTableShell";
export { EmptyState } from "./EmptyState";
export { Toolbar, FilterChip } from "./Toolbar";
export { StatePill, type PillState } from "./StatePill";
export { ColorField, LogoUploader, BRAND_IMG_TYPES, FONT_OPTIONS } from "./BrandControls";
export * from "./PresenceDot";
