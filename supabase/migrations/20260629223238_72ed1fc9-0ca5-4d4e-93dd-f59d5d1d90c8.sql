
ALTER VIEW public._latest_cash_flow    SET (security_invoker = true);
ALTER VIEW public._latest_owner_credit SET (security_invoker = true);
ALTER VIEW public._signature_rollup    SET (security_invoker = true);
ALTER VIEW public._bank_rollup         SET (security_invoker = true);
