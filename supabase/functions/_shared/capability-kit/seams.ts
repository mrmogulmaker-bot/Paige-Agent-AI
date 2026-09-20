/**
 * Closed identifiers for existing governance seams. These names bind a
 * capability declaration to implementations that already ship; they do not
 * create a registry or select authority from caller input.
 */
export const CAPABILITY_SEAM_IDS = Object.freeze({
  tenantResolver: "current_user_tenant_id",
  actorResolver: "authenticated_user",
  availabilityResolver: "paige-capability-status",
  connectionResolver: "mcp-gateway",
  receiptRecorder: "record_capability_run",
  outcomeProjector: "capability-record",
} as const);

export type CapabilityTenantResolverId = typeof CAPABILITY_SEAM_IDS.tenantResolver;
export type CapabilityActorResolverId = typeof CAPABILITY_SEAM_IDS.actorResolver;
export type CapabilityAvailabilityResolverId = typeof CAPABILITY_SEAM_IDS.availabilityResolver;
export type CapabilityConnectionResolverId = typeof CAPABILITY_SEAM_IDS.connectionResolver;
export type CapabilityReceiptRecorderId = typeof CAPABILITY_SEAM_IDS.receiptRecorder;
export type CapabilityOutcomeProjectorId = typeof CAPABILITY_SEAM_IDS.outcomeProjector;
