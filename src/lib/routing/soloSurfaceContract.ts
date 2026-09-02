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

export interface SoloBaselineEvidenceFlow extends SoloSurfaceDeclaration {
  id: string;
  branch: string;
  subtab: string;
  stateDelivery: "tenant_truth";
}

/** Named owner-evidence flows that must stay on the shared Solo template. */
export const SOLO_BASELINE_EVIDENCE_FLOWS: readonly SoloBaselineEvidenceFlow[] = [
  {
    id: "campaigns_pipeline",
    branch: "growth",
    subtab: "pipeline",
    template: CANONICAL_SOLO_TEMPLATE,
    delivery: "global_template",
    stateDelivery: "tenant_truth",
  },
];
