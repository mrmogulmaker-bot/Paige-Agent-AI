export const CANONICAL_SOLO_TEMPLATE = "canonical_solo" as const;
export const SOLO_DELIVERY_CLASSES = [
  "global_template",
  "tenant_bootstrap",
  "tenant_truth",
] as const;

export type SoloDeliveryClass = (typeof SOLO_DELIVERY_CLASSES)[number];
export interface SoloSurfaceDeclaration {
  template: typeof CANONICAL_SOLO_TEMPLATE;
  delivery: SoloDeliveryClass;
}
