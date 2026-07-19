// premium-motion — the §29 premium motion / 3D / CSS toolkit.
//
// A barrel of INERT, opt-in primitives the Studio Design Agent composes. Every
// primitive is:
//   • useReducedMotion-gated (§11) with its OWN reduced-motion fallback,
//   • token-only — no hardcoded hex; gold is never spent on a resting surface (§11/§23),
//   • lazy where it carries heavy GPU/runtime weight (§22: earn the pixels).
//
// Importing this barrel pulls in NO heavy 3D/Rive/Spline runtime — those are
// code-split behind React.lazy inside SplineScene / R3FScene / RiveEmbed and
// only load when actually rendered.
export { FadeInSection } from "./FadeInSection";
export type { FadeInSectionProps } from "./FadeInSection";

export { AnimatedText } from "./AnimatedText";
export type { AnimatedTextProps } from "./AnimatedText";

export { MagneticCTA } from "./MagneticCTA";
export type { MagneticCTAProps } from "./MagneticCTA";

export { GradientMasked } from "./GradientMasked";
export type { GradientMaskedProps } from "./GradientMasked";

export { NoiseOverlay } from "./NoiseOverlay";
export type { NoiseOverlayProps } from "./NoiseOverlay";

export { GlassCard } from "./GlassCard";
export type { GlassCardProps } from "./GlassCard";

export { Spotlight } from "./Spotlight";
export type { SpotlightProps } from "./Spotlight";

export { ScrollReveal } from "./ScrollReveal";
export type { ScrollRevealProps } from "./ScrollReveal";

export { SplineScene } from "./SplineScene";
export type { SplineSceneProps } from "./SplineScene";

export { R3FScene } from "./R3FScene";
export type { R3FSceneProps } from "./R3FScene";

export { RiveEmbed } from "./RiveEmbed";
export type { RiveEmbedProps } from "./RiveEmbed";
