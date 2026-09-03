// Server-only reconciliation of verified, owner-initiated Billing setup events.
// No provider object, identifier, card attribute or exception escapes this seam.
// deno-lint-ignore-file no-explicit-any
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: any): string | null => typeof value === 'string' && value.length > 0 ? value :
  value && typeof value.id === 'string' ? value.id : null;
const failure = (error: string, status = 503) => ({ status, body: { error } });

export async function reconcilePaymentSetup(event: any, account: 'legacy' | 'v2', provider: any, admin: any) {
  const session = event.data?.object;
  const metadata = session?.metadata ?? {};
  const tenant = metadata.platform_billing_connect_tenant_id;
  const actor = metadata.actor_user_id;
  const attempt = metadata.setup_attempt;
  const customer = id(session?.customer);
  const intent = id(session?.setup_intent);
  if (event.type !== 'checkout.session.completed' || event.account || session?.mode !== 'setup' ||
      session.status !== 'complete' || !id(event.id) || !id(session.id) || !customer || !intent ||
      !uuid.test(tenant ?? '') || !uuid.test(actor ?? '') || typeof attempt !== 'string' ||
      attempt.length < 8 || attempt.length > 128 || typeof event.livemode !== 'boolean' ||
      session.livemode !== event.livemode || !Number.isSafeInteger(event.created) || event.created <= 0 ||
      metadata.tenant_price_id || metadata.marketplace_item_slug || metadata.platform_plan_slug) {
    return failure('setup_binding_refused', 409);
  }
  try {
    const { data, error } = await admin.rpc('platform_payment_setup_is_complete', {
      p_tenant_id: tenant, p_actor_user_id: actor, p_setup_attempt: attempt,
      p_stripe_account: account, p_session_id: session.id, p_livemode: event.livemode,
    });
    if (error || typeof data !== 'boolean') return failure('setup_persistence_retryable');
    if (data) return { status: 200, body: { received: true } };
  } catch {
    return failure('setup_persistence_retryable');
  }
  let paymentMethod: string;
  try {
    const setup = await provider.setupIntents.retrieve(intent);
    paymentMethod = id(setup.payment_method)!;
    if (setup.status !== 'succeeded' || id(setup.customer) !== customer || !paymentMethod ||
        setup.livemode !== event.livemode || setup.metadata?.platform_billing_connect_tenant_id !== tenant ||
        setup.metadata?.actor_user_id !== actor || setup.metadata?.setup_attempt !== attempt) {
      return failure('setup_binding_refused', 409);
    }
    const method = await provider.paymentMethods.retrieve(paymentMethod);
    if (method.type !== 'card' || id(method.customer) !== customer || method.livemode !== event.livemode) {
      return failure('setup_binding_refused', 409);
    }
  } catch {
    return failure('setup_provider_retryable');
  }
  try {
    const { data, error } = await admin.rpc('complete_platform_payment_setup', {
      p_tenant_id: tenant, p_actor_user_id: actor, p_setup_attempt: attempt,
      p_stripe_account: account, p_customer_id: customer, p_payment_method_id: paymentMethod,
      p_session_id: session.id, p_event_id: event.id, p_livemode: event.livemode,
      p_confirmed_at: new Date(event.created * 1000).toISOString(),
    });
    if (error || data === 'persistence_retryable') return failure('setup_persistence_retryable');
    if (data !== 'completed' && data !== 'duplicate') return failure('setup_binding_refused', 409);
    return { status: 200, body: { received: true } };
  } catch {
    return failure('setup_persistence_retryable');
  }
}

