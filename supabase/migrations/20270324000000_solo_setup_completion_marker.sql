-- =============================================================================
-- #826 — the canonical V3 setup journey records its own completion.
--
-- The setup gate (RequireSetupComplete) holds a playbook-less Solo tenant on
-- the shell's own Setup. Its open-signal — features.playbook /
-- features.playbook_config — was written by the admin marketplace, retired
-- with /admin (#995): on current main NOTHING reachable opens the gate, so a
-- playbook-less tenant is held on Setup forever (the #826 loop, in its
-- dead-end form; 3 standalone tenants are exposed today, and #790's rollout
-- would widen it to every eligible playbook-less tenant).
--
-- THE FIX'S SERVER HALF: every successful save of the in-shell business-context
-- Setup bumps tenant_setup_business_context_meta.revision inside the save RPC's
-- transaction — so a row-level trigger there records
-- features.solo_setup_complete = true on the tenant in the SAME commit. This
-- is the exact pattern the gate's header documented for the retired marketplace
-- path ("completing X writes features.Y synchronously, so the gate opens the
-- moment they choose"), applied to the completion the canonical shell actually
-- offers. Additive trigger only; the save RPC is untouched; no tenant that
-- never completes a setup save is affected.
-- =============================================================================

create or replace function public.solo_setup_completion_marker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Idempotent and monotone: set-once. A later save re-fires the trigger but
  -- writes the same truth (the tenant HAS completed setup), so no revision
  -- churn beyond one jsonb_set of an already-true flag.
  update public.tenants
  set features = jsonb_set(coalesce(features, '{}'::jsonb), '{solo_setup_complete}', 'true'::jsonb, true)
  where id = new.tenant_id
    and coalesce(features ->> 'solo_setup_complete', 'false') <> 'true';
  return new;
end;
$$;

revoke all on function public.solo_setup_completion_marker() from public, anon, authenticated;
-- No grant at all: trigger-executed only (the house §59 posture for triggers).

drop trigger if exists trg_solo_setup_completion on public.tenant_setup_business_context_meta;
create trigger trg_solo_setup_completion
  after insert or update on public.tenant_setup_business_context_meta
  for each row execute function public.solo_setup_completion_marker();
