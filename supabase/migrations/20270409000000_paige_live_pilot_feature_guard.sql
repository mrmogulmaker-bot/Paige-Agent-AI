-- INT-104: platform-owned workspace availability for the existing Live flow.
-- This is not a user entitlement, role label, transcript, or usage meter.
-- A missing row is OFF. No tenant identity is hardcoded or seeded.
-- Rollback (only while all rows remain disabled):
-- DROP TABLE IF EXISTS public.paige_live_tenant_availability;

CREATE TABLE IF NOT EXISTS public.paige_live_tenant_availability (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.paige_live_tenant_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paige_live_tenant_availability FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.paige_live_tenant_availability TO service_role;

-- Intentionally no anon/authenticated policy. A browser or tenant-admin REST
-- request cannot read or change this platform rollout decision even if it
-- owns the corresponding tenant row. Only the server's named service secret
-- may read it for ticket issuance and relay admission.
