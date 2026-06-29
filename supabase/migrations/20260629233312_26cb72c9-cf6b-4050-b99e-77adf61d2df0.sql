
ALTER VIEW public.paige_approval_queue_v SET (security_invoker = true);

REVOKE EXECUTE ON FUNCTION public.apply_approval_policy() FROM PUBLIC, anon, authenticated;
